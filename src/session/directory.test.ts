import { expect, test } from "bun:test"
import { defaultSessionDirectory } from "./directory"

test.each([
  ["/repo", "/repo/agent7777"],
  ["/repo/", "/repo/agent7777"],
  ["/", "/agent7777"],
  ["/repo/agent7777/", "/repo/agent7777"],
  ["/repo/agent7777/agent7777", "/repo/agent7777/agent7777"],
  ["C:\\repo\\", "C:\\repo\\agent7777"],
  ["C:\\", "C:\\agent7777"],
  ["C:\\repo\\agent7777\\", "C:\\repo\\agent7777"],
  ["C:\\repo\\agent7777\\agent7777", "C:\\repo\\agent7777\\agent7777"],
])("selects the default session directory for %s", (base, expected) => {
  expect(defaultSessionDirectory(base)).toBe(expected)
})
