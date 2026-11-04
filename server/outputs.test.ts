import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Conversation } from "@cybros/agent"
import { fileBytes } from "./outputs"
import type { Backend } from "./nexus"

test("runner downloads follow the recorded conversation binding and never fall back to the bridge machine", async () => {
  const dir = await mkdtemp(join(tmpdir(), "7777-outputs-"))
  const root = join(dir, "project")
  const chat = { public_id: "chat", default_runner: { executor_public_id: "runner" } } as Conversation
  const actions: string[] = []
  const announcementPath = join(root, "control.json")
  const b = {
    localRunner: "runner",
    announcementPath,
    rhoGet: async (path: string) => {
      if (path.startsWith("/conversations/environment?"))
        return Response.json({
          environment: {
            conversation: "chat",
            runner: "runner",
            root,
            source: "conversation",
            directories: [],
            anchor: "chat",
          },
        })
      actions.push("local")
      return new Response("local file")
    },
    client: { uploads: { bytes: async (id: string) => new Response(id) } },
    workspace: {
      conversation: () => ({
        turns: {
          fetch: async () => ({
            public_id: "turn",
            role: "assistant",
            status: "completed",
            active_variant: {
              public_id: "v",
              content: "./notes.md ./outside.md ./control.json",
            },
          }),
        },
      }),
      runs: {
        startToolCall: async (input: { runner_executor_public_id: string; tool: string; input: { path: string } }) => {
          actions.push(input.runner_executor_public_id + "/" + input.tool)
          expect(input.input.path).toBe(join(root, "notes.md"))
          return {
            waitForToolResult: async () => ({
              content: [{ type: "resource_link", uri: "nexus://uploads/from-runner", name: "notes.md" }],
            }),
          }
        },
      },
    },
  } as unknown as Backend
  const read = (name: string) =>
    fileBytes(b, chat, new URLSearchParams({ turn: "turn", variant: "v", file: "path:./" + name }))
  try {
    await mkdir(root)
    await writeFile(announcementPath, "test control file")
    await writeFile(join(root, "notes.md"), "notes")
    await writeFile(join(dir, "elsewhere.md"), "outside the project")
    await symlink(join(dir, "elsewhere.md"), join(root, "outside.md"))
    expect(await new Response((await read("notes.md")).body).text()).toBe("local file")
    await expect(read("outside.md")).rejects.toMatchObject({ status: 403 })
    await expect(read("control.json")).rejects.toMatchObject({ status: 403 })
    await expect(read("unmentioned.md")).rejects.toMatchObject({ status: 404 })
    b.localRunner = "other-runner"
    expect(await new Response((await read("notes.md")).body).text()).toBe("from-runner")
    expect(actions).toEqual(["local", "runner/files_bytes"])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
