import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { build, normalizePath } from "vite"
import config from "../vite.config"

const root = resolve(import.meta.dir, "..")
const renderers = ["7777", "plm-meeting"].map((name) => ({ name, root: resolve(root, "..", name) }))
const staging = await realpath(await mkdtemp(join(tmpdir(), "opencode-shared-renderers-")))

try {
  await mkdir(join(staging, "public"))

  for (const renderer of renderers) {
    const html = await Bun.file(join(renderer.root, "index.html")).text()
    const theme = await Bun.file(join(renderer.root, "public/oc-theme-preload.js")).text()

    await Bun.write(
      join(staging, "sigma-agents", `${renderer.name}.html`),
      html
        .replace('src="/src/entry.tsx"', `src="/@fs/${normalizePath(renderer.root)}/src/entry.tsx"`)
        .replace(
          /<script id="oc-theme-preload-script" src="(?:\/|\.\/)oc-theme-preload\.js"><\/script>/,
          () => `<script id="oc-theme-preload-script">${theme}</script>`,
        ),
    )

    // Both pages share public URLs. Reject differing files instead of letting copy order choose a branch's asset.
    for await (const name of new Bun.Glob("**/*").scan({ cwd: join(renderer.root, "public"), onlyFiles: true })) {
      if (name === "oc-theme-preload.js") continue

      const source = await Bun.file(join(renderer.root, "public", name)).bytes()
      const destination = Bun.file(join(staging, "public", name))

      if ((await destination.exists()) && !Buffer.from(source).equals(await destination.bytes())) {
        throw new Error(`Conflicting shared public asset: ${name}`)
      }

      await Bun.write(destination, source)
    }
  }

  await build({
    ...config,
    configFile: false,
    root: staging,
    envDir: root,
    publicDir: join(staging, "public"),
    resolve: {
      ...config.resolve,
      alias: [
        {
          find: "@",
          replacement: "@",
          async customResolver(source, importer) {
            const renderer = renderers.find(
              (renderer) => importer && normalizePath(importer).startsWith(`${normalizePath(renderer.root)}/`),
            )

            if (!renderer) throw new Error(`Cannot resolve renderer import ${source} from ${importer}`)

            return this.resolve(resolve(renderer.root, "src", source.slice(2)), importer, { skipSelf: true })
          },
        },
      ],
    },
    build: {
      ...config.build,
      outDir: join(root, "dist-shared"),
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: Object.fromEntries(
          renderers.map((renderer) => [renderer.name, join(staging, "sigma-agents", `${renderer.name}.html`)]),
        ),
      },
    },
  })
} finally {
  await rm(staging, { recursive: true, force: true })
}
