import { lstatSync, readlinkSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const output = resolve(root, "dist")
const existing = lstatSync(output, { throwIfNoEntry: false })

// Older checkouts linked dist to 7777. Remove only that link before Vite empties its output.
if (existing?.isSymbolicLink()) {
  if (resolve(root, readlinkSync(output)) !== resolve(root, "../7777/dist")) {
    throw new Error("Unexpected dist link; refusing to build into another output directory")
  }
  unlinkSync(output)
}

process.exitCode = await Bun.spawn([process.execPath, "run", "vite", "build"], {
  cwd: root,
  stdio: ["inherit", "inherit", "inherit"],
}).exited
