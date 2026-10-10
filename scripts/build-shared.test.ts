import { afterEach, expect, test } from "bun:test"
import { mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Manifest } from "vite"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture(conflict = false) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "shared-renderers-test-")))
  directories.push(directory)

  await Promise.all([
    Bun.write(
      join(directory, "plm-meeting/scripts/build-shared.ts"),
      Bun.file(new URL("./build-shared.ts", import.meta.url)),
    ),
    Bun.write(join(directory, "plm-meeting/vite.config.ts"), Bun.file(new URL("../vite.config.ts", import.meta.url))),
    ...["7777", "plm-meeting"].map(async (name) => {
      await Bun.write(join(directory, name, "package.json"), '{"type":"module"}')
      await symlink(
        await realpath(new URL("../node_modules", import.meta.url)),
        join(directory, name, "node_modules"),
        process.platform === "win32" ? "junction" : "dir",
      )
      await Promise.all([
        Bun.write(
          join(directory, name, "index.html"),
          '<!doctype html><html><head><script id="oc-theme-preload-script" src="/oc-theme-preload.js"></script></head><body><script type="module" src="/src/entry.tsx"></script></body></html>',
        ),
        Bun.write(
          join(directory, name, "src/entry.tsx"),
          'import { createSignal } from "solid-js"; import { label } from "@/label"; document.body.textContent = label + createSignal(0)[0](); document.body.onclick = async () => { document.title = (await import("./lazy")).label }',
        ),
        Bun.write(join(directory, name, "src/label.ts"), `export const label = "${name} renderer"`),
        Bun.write(join(directory, name, "src/lazy.ts"), `export const label = "${name} lazy"`),
        Bun.write(join(directory, name, "public/oc-theme-preload.js"), `document.title = "${name} theme"`),
        Bun.write(join(directory, name, "public/assets/shared.txt"), conflict ? name : "shared asset"),
        Bun.write(join(directory, name, "dist/index.html"), `${name} standalone`),
      ])
    }),
    Bun.write(join(directory, "plm-meeting/dist-shared/previous.txt"), "previous build"),
  ])

  const child = Bun.spawn([process.execPath, "scripts/build-shared.ts"], {
    cwd: join(directory, "plm-meeting"),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  return { directory, code, log: stdout + stderr, output: join(directory, "plm-meeting/dist-shared") }
}

test("builds distinct HTML entries with shared dependencies and branch-local imports", async () => {
  const result = await fixture()
  expect(result.code, result.log).toBe(0)

  const manifest: Manifest = await Bun.file(join(result.output, ".vite/manifest.json")).json()
  const entries = [manifest["7777.html"]!, manifest["plm-meeting.html"]!]
  const shared = entries[0]!.imports?.filter((name) => entries[1]!.imports?.includes(name))
  expect(shared?.length).toBeGreaterThan(0)
  expect(entries[0]!.file).not.toBe(entries[1]!.file)

  for (const name of ["7777", "plm-meeting"]) {
    const entry = manifest[`${name}.html`]!
    const html = await Bun.file(join(result.output, `${name}.html`)).text()
    expect(html).toContain(`./${entry.file}`)
    expect(html).toContain(`${name} theme`)
    expect(await Bun.file(join(result.output, entry.file)).text()).toContain(`${name} renderer`)
    expect(entry.dynamicImports).toHaveLength(1)
    expect(await Bun.file(join(result.output, manifest[entry.dynamicImports![0]!]!.file)).text()).toContain(
      `${name} lazy`,
    )
    expect(await Bun.file(join(result.directory, name, "dist/index.html")).text()).toBe(`${name} standalone`)
  }

  expect(await Bun.file(join(result.output, "assets/shared.txt")).text()).toBe("shared asset")
  expect(await Bun.file(join(result.output, "previous.txt")).exists()).toBe(false)
}, 30000)

test("rejects conflicting public assets before replacing the shared output", async () => {
  const result = await fixture(true)
  expect(result.code).not.toBe(0)
  expect(result.log).toContain("Conflicting shared public asset: assets/shared.txt")
  expect(await Bun.file(join(result.output, "previous.txt")).text()).toBe("previous build")
}, 30000)
