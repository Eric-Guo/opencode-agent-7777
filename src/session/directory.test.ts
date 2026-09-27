import { expect, test } from "bun:test"
import { defaultSessionDirectory } from "./directory"

test.each([
  ["/repo", "/repo/agent-plm-meeting"],
  ["/repo/", "/repo/agent-plm-meeting"],
  ["/", "/agent-plm-meeting"],
  ["/repo/agent-plm-meeting/", "/repo/agent-plm-meeting"],
  ["/repo/agent-plm-meeting/agent-plm-meeting", "/repo/agent-plm-meeting/agent-plm-meeting"],
  ["C:\\repo\\", "C:\\repo\\agent-plm-meeting"],
  ["C:\\", "C:\\agent-plm-meeting"],
  ["C:\\repo\\agent-plm-meeting\\", "C:\\repo\\agent-plm-meeting"],
  ["C:\\repo\\agent-plm-meeting\\agent-plm-meeting", "C:\\repo\\agent-plm-meeting\\agent-plm-meeting"],
])("selects the default session directory for %s", (base, expected) => {
  expect(defaultSessionDirectory(base)).toBe(expected)
})
