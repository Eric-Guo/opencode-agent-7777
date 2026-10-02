import { describe, expect, test } from "bun:test"
import type { SessionMessageUser } from "@opencode/client/promise"
import { Skill } from "@opencode/schema/skill"
import { Schema } from "effect"
import { extractPromptFromMessage } from "./prompt"
import { buildPromptRequest } from "./request"
import { PromptDraft } from "./schema"
import { createPromptState } from "./state"

describe("extractPromptFromMessage", () => {
  test("restores presentation text and uploaded attachments", () => {
    const message = {
      id: "msg_1",
      type: "user",
      text: "the model prompt",
      metadata: { displayText: "the visible prompt", comments: [] },
      files: [
        {
          data: "AAA",
          mime: "image/png",
          source: { type: "inline" },
          name: "image.png",
        },
      ],
      time: { created: 1 },
    } satisfies SessionMessageUser

    expect(extractPromptFromMessage(message)).toEqual({
      prompt: "the visible prompt",
      attachments: [
        {
          id: "msg_1:file:0",
          filename: "image.png",
          mime: "image/png",
          url: "data:image/png;base64,AAA",
        },
      ],
    })
  })

  test("restores file mentions with their original server URI", () => {
    const message = {
      id: "msg_1",
      type: "user",
      text: "inspect @src/app.ts",
      files: [
        {
          data: "",
          mime: "text/plain",
          source: { type: "uri", uri: "file:///repo/src/app.ts" },
          name: "app.ts",
          mention: { text: "@src/app.ts", start: 8, end: 19 },
        },
      ],
      time: { created: 1 },
    } satisfies SessionMessageUser

    expect(extractPromptFromMessage(message)).toEqual({
      prompt: "inspect @src/app.ts",
      attachments: [],
      references: [
        {
          type: "file",
          path: "src/app.ts",
          url: "file:///repo/src/app.ts",
          content: "@src/app.ts",
          start: 8,
          end: 19,
        },
      ],
    })
  })

  test("restores mixed mentions through draft persistence and resubmission without mutating the message", () => {
    const message: SessionMessageUser = {
      id: "msg_mixed",
      type: "user",
      text: "Ask @explore use @review on @src/a.ts",
      agents: [{ name: "explore", mention: { text: "@explore", start: 4, end: 12 } }],
      skills: [{ id: "plugin/review", name: "Review", mention: { text: "@review", start: 17, end: 24 } }],
      files: [
        {
          name: "a.ts",
          mime: "text/plain",
          data: "Y29kZQ==",
          source: { type: "uri", uri: "file:///repo/src/a.ts?start=2&end=5" },
          mention: { text: "@src/a.ts", start: 28, end: 37 },
        },
      ],
      time: { created: 1 },
    }
    const original = structuredClone(message)
    const restored = extractPromptFromMessage(message)
    const draft = createPromptState(Schema.decodeUnknownSync(PromptDraft)(JSON.parse(JSON.stringify(restored))))
    expect(draft.capture().references).toEqual([
      { type: "agent", name: "explore", content: "@explore", start: 4, end: 12 },
      {
        type: "skill",
        id: Skill.ID.make("plugin/review"),
        name: Skill.Name.make("Review"),
        content: "@review",
        start: 17,
        end: 24,
      },
      {
        type: "file",
        path: "src/a.ts",
        url: "file:///repo/src/a.ts?start=2&end=5",
        content: "@src/a.ts",
        start: 28,
        end: 37,
      },
    ])
    expect(buildPromptRequest(draft.capture())).toEqual({
      text: "Ask @explore use @review on @src/a.ts",
      files: [
        {
          uri: "file:///repo/src/a.ts?start=2&end=5",
          name: "a.ts",
          mention: { text: "@src/a.ts", start: 28, end: 37 },
        },
      ],
      agents: [{ name: "explore", mention: { text: "@explore", start: 4, end: 12 } }],
      skills: [{ id: Skill.ID.make("plugin/review"), mention: { text: "@review", start: 17, end: 24 } }],
    })
    draft.store[1]("prompt", 1, { type: "agent", name: "changed", content: "@changed", start: 4, end: 12 })
    expect(restored.references?.[0]).toEqual({ type: "agent", name: "explore", content: "@explore", start: 4, end: 12 })
    expect(message).toEqual(original)
  })

  test("recovers shifted mentions in visible text and skips context absent from it", () => {
    const message: SessionMessageUser = {
      id: "msg_visible",
      type: "user",
      text: "Notes: @explore then @explore @hidden",
      metadata: { displayText: "@explore then @explore", comments: [] },
      agents: [
        { name: "first", mention: { text: "@explore", start: 7, end: 15 } },
        { name: "second", mention: { text: "@explore", start: 21, end: 29 } },
        { name: "hidden", mention: { text: "@hidden", start: 30, end: 37 } },
        { name: "unmentioned" },
      ],
      time: { created: 1 },
    }
    expect(extractPromptFromMessage(message)).toEqual({
      prompt: "@explore then @explore",
      attachments: [],
      references: [
        { type: "agent", name: "first", content: "@explore", start: 0, end: 8 },
        { type: "agent", name: "second", content: "@explore", start: 14, end: 22 },
      ],
    })
  })

  test.each([
    [-1, 8],
    [0.5, 8],
    [0, 8.5],
    [0, 0],
    [0, NaN],
    [0, Infinity],
  ])("retains plain text for malformed historical mention offsets %s..%s", (start, end) => {
    expect(
      extractPromptFromMessage({
        id: "msg_invalid",
        type: "user",
        text: "@explore",
        agents: [{ name: "explore", mention: { text: "@explore", start, end } }],
        time: { created: 1 },
      }),
    ).toEqual({ prompt: "@explore", attachments: [] })
  })
})
