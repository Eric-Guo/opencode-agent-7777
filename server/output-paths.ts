import type { OutputFile } from "../src/nexus/inspection"

// A bare filename is downloadable only when the run actually published or captured it.
export function outputPaths(text: string): OutputFile[] {
  const paths = new Map<string, OutputFile>()
  for (const [, path] of text.matchAll(
    /(?:^|[\s("'\x60])((?:\/|\.\.?\/)?[\w.@+-]*(?:\/[\w.@+-]+)*\.(?:png|jpe?g|gif|webp|avif|svg|ico|log|txt|json|md|markdown|zip|pdf))(?=$|[\s)"'\x60,.])/gi,
  )) {
    if (path.includes("/")) paths.set(path, { id: "path:" + path, name: path.split("/").at(-1)!, path: true })
  }
  return [...paths.values()]
}
