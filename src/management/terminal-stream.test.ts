import { expect, test } from "bun:test"
import { TerminalStream } from "./terminal-stream"

test("terminal replay deduplicates bytes across peers and accounts for bounded gaps", () => {
  const stream = new TerminalStream()

  const output = (offset: number, data: number[]) =>
    JSON.stringify({ type: "output", offset, data: btoa(String.fromCharCode(...data)) })

  expect(stream.receive(output(0, [0xe4, 0xbd])).data).toEqual(new Uint8Array([0xe4, 0xbd]))
  expect(stream.receive(output(0, [0xe4, 0xbd, 0xa0])).data).toEqual(new Uint8Array([0xa0]))
  expect(stream.resume()).toBe('{"type":"resume","offset":3}')
  expect(stream.receive(output(0, [0xe4, 0xbd, 0xa0])).data).toHaveLength(0)
  expect(stream.receive(JSON.stringify({ type: "gap", from: 3, to: 30 })).gap).toBe(27)
  expect(() => stream.receive(output(31, [65]))).toThrow("offset")
  expect(stream.receive(output(30, [65]), false)).toEqual({})
  expect(stream.offset).toBe(30)
})

test("terminal inputs use byte lengths and unique IDs without replaying uncertain input", () => {
  const stream = new TerminalStream()
  const first = stream.input("你好")
  expect(first.bytes).toBe(6)
  expect(first.id).toBe(1)
  expect(stream.input("x").id).toBe(2)
  expect(() => stream.input("x".repeat(8193))).toThrow("8192")
  expect(stream.receive('{"type":"receipt","id":1,"sequence":3,"bytes":6,"status":"written"}').receipt?.status).toBe(
    "written",
  )
  expect(() => stream.receive('{"type":"receipt","id":0,"sequence":3,"bytes":6,"status":"written"}')).toThrow("receipt")
})
