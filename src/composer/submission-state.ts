import type { PromptState } from "./state"
import type { ComposerPrompt } from "./types"

// One draft target in 7777; session promotion and queue retargeting are not needed.
export function createComposerSubmission(input: { target: PromptState }) {
  const prompt = input.target.capture()
  let cleared: ComposerPrompt | undefined

  return {
    prompt,
    clear() {
      input.target.reset()
      cleared = input.target.store[0].prompt
    },
    restore() {
      if (!cleared || input.target.store[0].prompt !== cleared) return
      // Nested Solid store edits can retain the array identity captured at clear().
      if (input.target.current() !== "" || input.target.attachments().length > 0) return
      return { target: input.target, prompt }
    },
  }
}
