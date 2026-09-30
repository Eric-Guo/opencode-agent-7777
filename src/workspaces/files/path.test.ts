import { expect, test } from "bun:test"
import { fileUrl } from "./path"

test.each([
  ["/workspace/", "docs/a #1?.md", "file:///workspace/docs/a%20%231%3F.md"],
  ["/workspace", "/outside/你好%.md", "file:///outside/%E4%BD%A0%E5%A5%BD%25.md"],
  ["C:\\workspace\\", "src\\index.ts", "file:///C:/workspace/src/index.ts"],
  ["C:\\workspace", "D:\\other\\a b.txt", "file:///D:/other/a%20b.txt"],
  ["/workspace", "\\\\server\\share\\a.txt", "file:////server/share/a.txt"],
  ["/", "src/", "file:///src/"],
])("resolves and encodes a server file URI from %s and %s", (directory, path, expected) => {
  expect(fileUrl(directory, path)).toBe(expected)
})
