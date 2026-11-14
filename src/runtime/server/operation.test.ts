import { afterEach, expect, jest, test } from "bun:test"
import { bounded } from "./operation"
afterEach(() => jest.useRealTimers())

test("complete reads expire even when body decoding ignores cancellation and permit a fresh read", async () => {
  jest.useFakeTimers()
  const owner = new AbortController()
  const pending = Promise.withResolvers<string>()
  let signal: AbortSignal | undefined
  const result = bounded(
    (value) => {
      signal = value
      return pending.promise
    },
    { signal: owner.signal },
  )
  void result.catch(() => {})
  jest.advanceTimersByTime(60_000)
  await expect(result).rejects.toThrow("timed out")
  expect(signal?.aborted).toBe(true)
  pending.resolve("late body")
  await Promise.resolve()
  expect(await bounded(() => "retry", { signal: owner.signal })).toBe("retry")
})

test("disposal settles an abort-ignoring read and an already disposed owner starts no work", async () => {
  const owner = new AbortController()
  let calls = 0
  const result = bounded(
    () => {
      calls++
      return new Promise<void>(() => {})
    },
    { signal: owner.signal },
  )
  void result.catch(() => {})
  owner.abort()
  await expect(result).rejects.toBeDefined()
  await expect(
    bounded(
      () => {
        calls++
      },
      { signal: owner.signal },
    ),
  ).rejects.toBeDefined()
  expect(calls).toBe(1)
})
