import { Markdown } from "@opencode-ai/session-ui/markdown"
import { For, Show } from "solid-js"
import { AGENT_DEFAULT_CONFIG } from "@/context/agent-default-config"
import { setPrompt } from "@/context/prompt-actions"
import { currentLocalAgent, state } from "@/context/server-session-store"

export function AgentWelcome() {
  const welcomeText = () => state.server?.welcomeText ?? AGENT_DEFAULT_CONFIG.welcomeText
  const suggestedQuestions = () => state.server?.suggestedQuestions ?? AGENT_DEFAULT_CONFIG.suggestedQuestions

  return (
    <div class="mx-auto flex w-full max-w-[680px] flex-col items-center gap-6 text-center">
      <Markdown
        text={welcomeText().replaceAll(AGENT_DEFAULT_CONFIG.localAgent, currentLocalAgent())}
        cacheKey={`${currentLocalAgent()}-agent-welcome`}
        class="w-full text-v2-text-text-base"
      />
      <Show when={suggestedQuestions().length > 0}>
        <div class="flex w-full flex-wrap justify-center gap-2">
          <For each={suggestedQuestions()}>
            {(question) => (
              <button
                type="button"
                class="rounded-lg border border-v2-border-border-base bg-v2-background-bg-layer-01 px-4 py-2.5 text-left text-[13px] text-v2-text-text-base transition-colors hover:border-v2-border-border-strong hover:bg-v2-overlay-simple-overlay-hover"
                onClick={() => setPrompt(question)}
              >
                {question}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
