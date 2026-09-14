import { describe, expect, test } from "bun:test"
import { Schema, SchemaGetter } from "effect"
import { Persistence } from "./schema"

describe("persistence schemas", () => {
  test("defaults invalid fields independently and keeps the codec on writes", () => {
    const schema = Persistence.struct({
      amount: Persistence.fallback(Schema.NumberFromString.check(Schema.isFinite()), () => 7),
      label: Persistence.fallback(Schema.String, () => "default"),
    })
    const decode = Schema.decodeUnknownSync(schema)
    expect(decode({})).toEqual({ amount: 7, label: "default" })
    expect(decode({ amount: "invalid", label: "saved" })).toEqual({ amount: 7, label: "saved" })
    expect(decode({ amount: "12", label: false })).toEqual({ amount: 12, label: "default" })
    expect(Schema.encodeSync(schema)(decode({}))).toEqual({ amount: "7", label: "default" })
  })

  test("optional recovery drops invalid fields and preserves valid encoded values", () => {
    const schema = Persistence.struct({ value: Persistence.optional(Schema.NumberFromString.check(Schema.isFinite())) })
    const decode = Schema.decodeUnknownSync(schema)
    expect(decode({})).toEqual({})
    expect(decode({ value: "invalid" })).toEqual({})
    expect(Object.hasOwn(decode({ value: "invalid" }), "value")).toBe(false)
    expect(decode({ value: "42" })).toEqual({ value: 42 })
    expect(Schema.encodeSync(schema)({ value: 42 })).toEqual({ value: "42" })
  })

  test("recovers individual array entries and uses their codec for encoding", () => {
    const current = Persistence.struct({ name: Schema.String })
    const schema = Persistence.array(
      Schema.Union([current, Schema.String]).pipe(
        Schema.decodeTo(current, {
          decode: SchemaGetter.transform((value) => (typeof value === "string" ? { name: value } : value)),
          encode: SchemaGetter.passthrough(),
        }),
      ),
    )
    const decode = Schema.decodeUnknownSync(schema)
    const value = decode(["old", { name: "new" }, null, { name: false }])
    expect(value).toEqual([{ name: "old" }, { name: "new" }])
    expect(Schema.encodeSync(schema)(value)).toEqual(value)
    expect(decode(Schema.encodeSync(schema)(value))).toEqual(value)
  })

  test("creates fresh, mutable fallback collections", () => {
    const schema = Persistence.struct({ items: Persistence.array(Schema.String) })
    const decode = Schema.decodeUnknownSync(schema)
    const first = decode({})
    first.items.push("changed")
    expect(decode({})).toEqual({ items: [] })
    expect(decode({ items: false })).toEqual({ items: [] })
  })
})
