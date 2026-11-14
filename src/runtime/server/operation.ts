import { abort } from "@opencode/util/abort"
import { translateSync } from "@/runtime/i18n/language"

export const READ_TIMEOUT_MS = 60_000

// Bound the complete API promise, including decoding, even when an adapter ignores abort.
// Each invocation owns its controller; cancelling an observer never cancels a shared resource.
export function bounded<T>(
  run: (signal: AbortSignal) => T | PromiseLike<T>,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    const cancel = () => {
      abort(controller)
      reject(options.signal?.reason)
    }
    const timer = setTimeout(() => {
      reject(new Error(translateSync("error.operationTimeout")))
      abort(controller)
    }, options.timeoutMs ?? READ_TIMEOUT_MS)
    const finish = () => {
      controller.signal.removeEventListener("abort", finish)
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", cancel)
    }
    options.signal?.addEventListener("abort", cancel, { once: true })
    if (options.signal?.aborted) {
      cancel()
      finish()
      return
    }
    // Release listeners even when the underlying adapter never settles.
    controller.signal.addEventListener("abort", finish, { once: true })
    try {
      Promise.resolve(run(controller.signal)).then(
        (value) => {
          finish()
          if (!controller.signal.aborted) resolve(value)
        },
        (error) => {
          finish()
          reject(error)
        },
      )
    } catch (error) {
      finish()
      reject(error)
    }
  })
}
