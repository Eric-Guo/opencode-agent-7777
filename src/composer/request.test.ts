import { describe, expect, test } from "bun:test"
import { Skill } from "@opencode/schema/skill"
import { Schema } from "effect"
import { fileUrl } from "@/workspaces/files/path"
import { buildPromptRequest } from "./request"
import { createPromptState } from "./state"
import { createComposerEditorActions } from "./editor/actions"
import { PromptDraft } from "./schema"

describe("buildPromptRequest", () => {
  test.each([undefined, "review"])("selected files survive draft reload and command %s offset trimming", (command) => {
    const prefix = command ? "  /review Read " : "  Read "
    const state = createPromptState({ prompt: `${prefix}@read`, attachments: [] })
    const editor = createComposerEditorActions(state.store)
    editor.addMention({
      type: "file",
      path: "docs/read me.md",
      url: fileUrl("/workspace", "docs/read me.md"),
      content: "@docs/read me.md",
      start: 0,
      end: 0,
    })
    const saved = Schema.decodeUnknownSync(Schema.fromJsonString(PromptDraft))(JSON.stringify(state.capture()))
    const restored = createPromptState(saved)
    expect(buildPromptRequest({ ...restored.capture(), command })).toEqual({
      text: "Read @docs/read me.md",
      files: [
        {
          uri: "file:///workspace/docs/read%20me.md",
          name: "read me.md",
          mention: { text: "@docs/read me.md", start: 5, end: 21 },
        },
      ],
    })
  })
  test.each([undefined, "review"])(
    "keeps skill mention offsets correct after trimming and removing command %s",
    (command) => {
      const prefix = command ? "  /review \n " : "  "
      expect(
        buildPromptRequest({
          prompt: `${prefix}Use @plugin/review here  `,
          attachments: [],
          command,
          references: [
            {
              type: "skill",
              id: Skill.ID.make("plugin/review"),
              name: Skill.Name.make("Review"),
              content: "@plugin/review",
              start: prefix.length + 4,
              end: prefix.length + 18,
            },
          ],
        }),
      ).toEqual({
        text: "Use @plugin/review here",
        files: [],
        skills: [{ id: Skill.ID.make("plugin/review"), mention: { text: "@plugin/review", start: 4, end: 18 } }],
      })
    },
  )
  test.each(["docs/", "docs\\"])("directory mentions keep their name with a trailing separator: %s", (path) => {
    const content = `@${path}`
    expect(
      buildPromptRequest({
        prompt: content,
        attachments: [],
        references: [{ type: "file", path, url: fileUrl("/workspace", path), content, start: 0, end: content.length }],
      }).files,
    ).toEqual([
      { uri: "file:///workspace/docs/", name: "docs", mention: { text: content, start: 0, end: content.length } },
    ])
  })
  test("trims text and preserves attachment order", () => {
    expect(
      buildPromptRequest({
        prompt: "  inspect these files  ",
        attachments: [
          { id: "one", filename: "one.txt", mime: "text/plain", url: "data:text/plain;base64,b25l" },
          { id: "two", filename: "two.txt", mime: "text/plain", url: "data:text/plain;base64,dHdv" },
        ],
      }),
    ).toEqual({
      text: "inspect these files",
      files: [
        { uri: "data:text/plain;base64,b25l", name: "one.txt" },
        { uri: "data:text/plain;base64,dHdv", name: "two.txt" },
      ],
    })
  })

  test("uses the source path when the attachment came from the desktop", () => {
    const request = buildPromptRequest({
      prompt: "inspect this",
      attachments: [
        {
          id: "external",
          filename: "settings.json",
          sourcePath: "C:\\Users\\Luke\\settings.json",
          mime: "application/json",
          url: "data:application/json;base64,e30=",
        },
      ],
    })

    expect(request.files[0]?.name).toBe("C:\\Users\\Luke\\settings.json")
  })
})
