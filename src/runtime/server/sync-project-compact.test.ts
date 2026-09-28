import { describe, expect, test } from "bun:test"
import type { OpenCodeEvent, Project } from "@opencode/client/promise"
import { createProjectSync } from "./sync-project-compact"

function project(id = "workspace", updated = 1): Project {
  return {
    id,
    canonical: "/workspace",
    time: { created: 1, updated, active: 1 },
    sandboxes: [],
    myTodo: { project_id: 1, work_package_id: 2, project_name: "First PLM project" },
  }
}

function event(data: Project): OpenCodeEvent {
  return { type: "project.updated", id: "event", created: data.time.updated, data }
}

function fixture(list: () => Promise<Project[]>) {
  return createProjectSync({ project: { list, update: async () => project() } }, "workspace")
}

describe("compact project sync", () => {
  test("loads only the active project and replaces fields removed by an update", async () => {
    const original = project()
    const sync = fixture(async () => [project("other"), original])
    await sync.sync()
    expect(sync.project()?.myTodo?.project_name).toBe("First PLM project")
    expect(sync.loading()).toBe(false)
    const cleared = project("workspace", 2)
    delete cleared.myTodo
    sync.event(event(cleared))
    expect(sync.project()?.myTodo).toBeUndefined()
    expect(sync.project()?.time.updated).toBe(2)
    expect(original).toEqual(project())
  })

  test("a saved project and an SSE update use the same state", async () => {
    const sync = fixture(async () => [project()])
    await sync.sync()
    sync.update({ ...project("workspace", 2), myTodo: { project_id: 3, work_package_id: 4, project_name: "Saved" } })
    expect(sync.project()?.myTodo).toEqual({ project_id: 3, work_package_id: 4, project_name: "Saved" })
    sync.event(
      event({ ...project("workspace", 3), myTodo: { project_id: 5, work_package_id: 6, project_name: "Remote" } }),
    )
    expect(sync.project()?.myTodo).toEqual({ project_id: 5, work_package_id: 6, project_name: "Remote" })
    sync.update(project("workspace", 2))
    sync.event(event(project("other", 10)))
    expect(sync.project()?.myTodo?.project_name).toBe("Remote")
  })

  test.each([false, true])("an update supersedes an in-flight list (failed=%s)", async (failed) => {
    const response = Promise.withResolvers<Project[]>()
    const sync = fixture(() => response.promise)
    const pending = sync.sync()
    sync.event(
      event({ ...project("workspace", 2), myTodo: { project_id: 3, work_package_id: 4, project_name: "Latest" } }),
    )
    if (failed) response.reject(new Error("old request failed"))
    else response.resolve([project()])
    await pending
    expect(sync.project()?.myTodo?.project_name).toBe("Latest")
    expect(sync.failed()).toBe(false)
    expect(sync.loading()).toBe(false)
  })

  test("coalesces simultaneous reads and retries after a failed read", async () => {
    let calls = 0
    const response = Promise.withResolvers<Project[]>()
    const sync = fixture(() => (++calls === 1 ? response.promise : Promise.resolve([project()])))
    const pending = sync.sync()
    await sync.sync()
    expect(calls).toBe(1)
    response.reject(new Error("offline"))
    await pending
    expect(sync.failed()).toBe(true)
    expect(sync.loading()).toBe(false)
    await sync.sync()
    expect(calls).toBe(2)
    expect(sync.failed()).toBe(false)
    expect(sync.project()?.id).toBe("workspace")
  })

  test("reports a missing project and clears the previous association", async () => {
    const sync = fixture(async () => [])
    sync.update(project())
    await sync.sync()
    expect(sync.project()).toBeUndefined()
    expect(sync.failed()).toBe(true)
    expect(sync.loading()).toBe(false)
  })

  test.each([false, true])("disposal rejects old reads and saves when changing scope (failed=%s)", async (failed) => {
    const response = Promise.withResolvers<Project[]>()
    const old = fixture(() => response.promise)
    const pending = old.sync()
    old.dispose()
    const next = fixture(async () => [{ ...project(), myTodo: undefined }])
    await next.sync()
    if (failed) response.reject(new Error("old server failed"))
    else response.resolve([project()])
    await pending
    old.update(project())
    expect(old.project()).toBeUndefined()
    expect(old.failed()).toBe(false)
    expect(next.project()?.myTodo).toBeUndefined()
  })
})
