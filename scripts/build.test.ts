import { afterEach, expect, test } from "bun:test"
import { lstat, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import manifest from "../package.json"

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture(failure = false) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "plm-meeting-build-")))
  directories.push(directory)
  await Promise.all([
    Bun.write(join(directory, "plm-meeting/scripts/build.ts"), Bun.file(new URL("./build.ts", import.meta.url))),
    Bun.write(
      join(directory, "plm-meeting/package.json"),
      JSON.stringify({ scripts: { build: manifest.scripts.build, vite: "bun vite.ts" } }),
    ),
    Bun.write(
      join(directory, "plm-meeting/vite.ts"),
      failure
        ? "process.exit(23)"
        : 'if (process.argv[2] !== "build") process.exit(24); await Bun.write("dist/index.html", "meeting renderer")',
    ),
    Bun.write(join(directory, "7777/package.json"), JSON.stringify({ scripts: { build: "exit 25" } })),
    Bun.write(join(directory, "7777/dist/index.html"), "main renderer"),
  ])
  return directory
}

async function build(directory: string) {
  const child = Bun.spawn([process.execPath, "run", "build"], {
    cwd: join(directory, "plm-meeting"),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, output: stdout + stderr }
}

test("builds and rebuilds meeting sources without building or changing 7777", async () => {
  const directory = await fixture()
  const output = join(directory, "plm-meeting/dist")
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(await build(directory)).toMatchObject({ code: 0 })
    expect((await lstat(output)).isDirectory()).toBe(true)
    expect(await Bun.file(join(output, "index.html")).text()).toBe("meeting renderer")
    expect(await Bun.file(join(directory, "7777/dist/index.html")).text()).toBe("main renderer")
  }
})

test.each([false, true])("replaces the old shared link safely (dangling: %s)", async (dangling) => {
  const directory = await fixture()
  const target = join(directory, "7777/dist")
  const output = join(directory, "plm-meeting/dist")
  if (dangling) await rm(target, { recursive: true })
  await symlink(
    process.platform === "win32" ? target : "../7777/dist",
    output,
    process.platform === "win32" ? "junction" : "dir",
  )
  expect(await build(directory)).toMatchObject({ code: 0 })
  expect((await lstat(output)).isSymbolicLink()).toBe(false)
  expect(await Bun.file(join(output, "index.html")).text()).toBe("meeting renderer")
  if (dangling) expect(await Bun.file(join(target, "index.html")).exists()).toBe(false)
  else expect(await Bun.file(join(target, "index.html")).text()).toBe("main renderer")
})

test("propagates a failed meeting build", async () => {
  const directory = await fixture(true)
  expect(await build(directory)).toMatchObject({ code: 23 })
  expect(await Bun.file(join(directory, "7777/dist/index.html")).text()).toBe("main renderer")
})

test("refuses an unrelated output link without touching its target", async () => {
  const directory = await fixture()
  const output = join(directory, "plm-meeting/dist")
  const target = join(directory, "other-dist")
  await Bun.write(join(target, "index.html"), "keep this output")
  await symlink(target, output, process.platform === "win32" ? "junction" : "dir")
  const result = await build(directory)
  expect(result.code).not.toBe(0)
  expect(result.output).toContain("refusing to build into another output directory")
  expect((await lstat(output)).isSymbolicLink()).toBe(true)
  expect(await Bun.file(join(output, "index.html")).text()).toBe("keep this output")
})
