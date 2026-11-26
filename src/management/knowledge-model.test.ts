import { expect, test } from "bun:test"
import { filterMemory, groupMemory, memoryGroup, memoryPathError, skillNameError } from "./knowledge-model"

const rows = (...paths: string[]) => paths.map((path) => ({ path }))

test("memoryGroup buckets paths by their top-level prefix", () => {
  expect(memoryGroup("speaker/profile.md")).toBe("speaker")
  expect(memoryGroup("agent/notes/today.md")).toBe("agent")
  expect(memoryGroup("workspace/projects/alpha.md")).toBe("workspace")
  expect(memoryGroup("conversation/standup.md")).toBe("conversation")
  expect(memoryGroup("skills/weekly-brief")).toBe("other")
  expect(memoryGroup("readme.md")).toBe("other")
})

test("groupMemory orders known folders first and other last, skipping empty groups", () => {
  const groups = groupMemory(rows("misc.txt", "workspace/b.md", "speaker/a.md", "conversation/c.md"))
  expect(groups.map((group) => group.folder)).toEqual(["speaker", "workspace", "conversation", "other"])
  expect(groups[0].items).toEqual([{ path: "speaker/a.md" }])
  expect(groupMemory([])).toEqual([])
})

test("filterMemory applies the scope bucket and a case-insensitive path query", () => {
  const all = rows("speaker/Profile.md", "workspace/profile-notes.md", "agent/todo.md")
  expect(filterMemory(all, "all", "")).toHaveLength(3)
  expect(filterMemory(all, "speaker", "")).toEqual([{ path: "speaker/Profile.md" }])
  expect(filterMemory(all, "all", "PROFILE")).toEqual([
    { path: "speaker/Profile.md" },
    { path: "workspace/profile-notes.md" },
  ])
  expect(filterMemory(all, "workspace", "profile")).toEqual([{ path: "workspace/profile-notes.md" }])
})

test("memoryPathError rejects absolute, empty, dot and hidden segments", () => {
  expect(memoryPathError("speaker/profile.md")).toBe("")
  expect(memoryPathError("speaker/nested/deep.md")).toBe("")
  expect(memoryPathError("")).toContain("path")
  expect(memoryPathError("/speaker/profile.md")).toContain("leading /")
  expect(memoryPathError("speaker//profile.md")).toContain("plain names")
  expect(memoryPathError("speaker/../escape.md")).toContain("plain names")
  expect(memoryPathError("speaker/./profile.md")).toContain("plain names")
  expect(memoryPathError("speaker/.hidden.md")).toContain("plain names")
  expect(memoryPathError("speaker/")).toContain("plain names")
})

test("skillNameError mirrors the runtime skill name rule", () => {
  expect(skillNameError("weekly-brief")).toBe("")
  expect(skillNameError("a")).toBe("")
  expect(skillNameError("Weekly")).toContain("lowercase")
  expect(skillNameError("-lead")).toContain("lowercase")
  expect(skillNameError("double--dash")).toContain("lowercase")
  expect(skillNameError("a".repeat(65))).toContain("64")
})
