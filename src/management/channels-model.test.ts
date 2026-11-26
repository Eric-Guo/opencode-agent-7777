import { expect, test } from "bun:test"
import { acceptModes, ingestSummary, parseList, sourceError, sourceKeyPattern } from "./channels-model"

test("parseList splits comma separated entries and drops blanks", () => {
  expect(parseList("alice, bob ,,carol,")).toEqual(["alice", "bob", "carol"])
  expect(parseList("")).toEqual([])
  expect(parseList(" , ")).toEqual([])
})

test("sourceError enforces the runtime source key pattern and 128 byte name", () => {
  expect(sourceKeyPattern.test("webhook:github")).toBe(true)
  expect(sourceError("webhook:github", "GitHub")).toBe("")
  expect(sourceError("Webhook", "GitHub")).toContain("Source key")
  expect(sourceError("", "GitHub")).toContain("Source key")
  expect(sourceError("webhook:github", " ")).toContain("name is required")
  expect(sourceError("webhook:github", "x".repeat(129))).toContain("128 bytes")
  // Multi-byte characters count by encoded length, not by characters.
  expect(sourceError("webhook:github", "汉".repeat(43))).toContain("128 bytes")
  expect(sourceError("webhook:github", "汉".repeat(42) + "ab")).toBe("")
})

test("ingestSummary reports the outcome with the gate strength when present", () => {
  expect(ingestSummary({ outcome: "routed", strength: "explicit" })).toBe("routed · explicit")
  expect(ingestSummary({ outcome: "observed" })).toBe("observed")
  expect(ingestSummary({ outcome: "filtered" })).toBe("filtered")
  expect(ingestSummary({})).toBe("unknown")
})

test("acceptModes matches the runtime gate modes", () => {
  expect([...acceptModes]).toEqual(["off", "observe", "auto"])
})
