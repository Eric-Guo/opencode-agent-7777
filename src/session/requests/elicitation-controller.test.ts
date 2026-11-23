import { expect, test } from "bun:test"
import type { FormInfo, FormMultiselectField } from "@opencode/client/promise"
import { createRoot } from "solid-js"
import { browserSuite } from "@/runtime/server/runtime.test-fixture"
import { createElicitationDock, type ElicitationDrafts } from "./elicitation-controller"

function withDock(
  request: FormInfo,
  drafts: ElicitationDrafts,
  check: (dock: ReturnType<typeof createElicitationDock>) => void,
) {
  createRoot((dispose) => {
    try {
      check(createElicitationDock(request, drafts))
    } finally {
      dispose()
    }
  })
}

browserSuite(import.meta.path, () => {
  test("conditions use preceding visible answers and keep edits while a field is hidden", () => {
    const form: FormInfo = {
      id: "details",
      sessionID: "root",
      title: "Details",
      fields: [
        { key: "early", type: "string", default: "early", when: [{ key: "count", op: "neq", value: 3 }] },
        { key: "count", type: "integer", default: 2, required: true },
        { key: "formats", type: "multiselect", options: [{ value: "csv", label: "CSV" }], default: ["csv"] },
        {
          key: "detail",
          type: "string",
          required: true,
          when: [
            { key: "formats", op: "eq", value: "csv" },
            { key: "count", op: "neq", value: 3 },
          ],
        },
        { key: "followUp", type: "boolean", when: [{ key: "detail", op: "eq", value: "saved" }] },
      ],
    }
    withDock(form, new WeakMap(), (dock) => {
      const keys = () => dock.view().fields.map((field) => field.key)
      expect(keys()).toEqual(["count", "formats", "detail"])
      expect(dock.view().complete).toBe(false)
      dock.set(form.fields[3], "saved")
      dock.set(form.fields[1], "3")
      expect(keys()).toEqual(["count", "formats"])
      expect(dock.view().answer).toEqual({ count: 3, formats: ["csv"] })
      expect(dock.view().complete).toBe(true)
      dock.set(form.fields[1], "2")
      expect(keys()).toEqual(["count", "formats", "detail", "followUp"])
      expect(dock.view().answer).toEqual({ count: 2, formats: ["csv"], detail: "saved", followUp: false })
    })
  })

  test("cleared and partial numbers survive a remount only for their pending request", () => {
    const form: FormInfo = {
      id: "count",
      sessionID: "root",
      title: "Count",
      fields: [{ key: "count", type: "number", required: true, default: 5 }],
    }
    const drafts: ElicitationDrafts = new WeakMap()
    const field = form.fields[0]
    withDock(form, drafts, (dock) => dock.set(field, ""))
    withDock(form, drafts, (dock) => {
      expect(dock.value(field)).toBe("")
      expect(dock.view().answer).toEqual({})
      expect(dock.view().complete).toBe(false)
      dock.set(field, "-")
    })
    withDock(form, drafts, (dock) => {
      expect(dock.value(field)).toBe("-")
      expect(dock.view().answer).toEqual({})
      expect(dock.view().complete).toBe(false)
      dock.set(field, "0")
      expect(dock.view().answer).toEqual({ count: 0 })
      expect(dock.view().complete).toBe(true)
    })
    withDock({ ...form }, drafts, (dock) => expect(dock.view().answer).toEqual({ count: 5 }))
  })

  test("optional multiselects can be cleared and apply count limits to nonempty selections", () => {
    const field: FormMultiselectField = {
      key: "formats",
      type: "multiselect",
      default: ["csv"],
      minItems: 2,
      maxItems: 2,
      options: ["csv", "pdf", "html"].map((value) => ({ value, label: value })),
    }
    withDock({ id: "export", sessionID: "root", title: "Export", fields: [field] }, new WeakMap(), (dock) => {
      expect(dock.view().complete).toBe(false)
      dock.toggle(field, "pdf", true)
      const accepted = dock.view()
      expect(accepted.complete).toBe(true)
      dock.toggle(field, "html", true)
      expect(dock.view().complete).toBe(false)
      expect(accepted.answer).toEqual({ formats: ["csv", "pdf"] })
      for (const option of field.options) dock.toggle(field, option.value, false)
      expect(dock.view().answer).toEqual({})
      expect(dock.view().complete).toBe(true)
      expect(field.default).toEqual(["csv"])
    })
  })
})
