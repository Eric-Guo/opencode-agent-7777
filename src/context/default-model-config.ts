type Visibility = "show" | "hide"

type DefaultModelConfig = {
  disabledProviders: string[]
  popularProviders: Array<{ providerID: string; visibility: Visibility }>
  user: Array<{ providerID: string; modelID: string; visibility: Visibility }>
}

export const DEFAULT_MODEL_CONFIG = {
  // Models from these providers are hidden by default. New models stay hidden until the provider is removed here.
  disabledProviders: ["siliconflow-cn", "minimax", "deepseek", "cerebras"],

  // Provider-level defaults for the providers shown first in the model manager.
  popularProviders: [
    { providerID: "github-copilot", visibility: "hide" },
    { providerID: "google", visibility: "hide" },
    { providerID: "openai", visibility: "hide" },
    { providerID: "opencode", visibility: "show" },
    { providerID: "openrouter", visibility: "hide" },
  ],

  // Per-model overrides. Missing models show by default unless their provider is disabled above or hidden here.
  user: [
    { providerID: "opencode-go", modelID: "glm-5.1", visibility: "hide" },
    { providerID: "kimi-for-coding", modelID: "kimi-k2-thinking", visibility: "hide" },
    { providerID: "kimi-for-coding", modelID: "k2p5", visibility: "hide" },
    { providerID: "kimi-for-coding", modelID: "k2p6", visibility: "hide" },
    { providerID: "kimi-for-coding", modelID: "k2p7", visibility: "show" },
    { providerID: "opencode", modelID: "claude-fable-5", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-opus-4-1", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-opus-4-5", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-opus-4-6", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-opus-4-7", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-opus-4-8", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-sonnet-4", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-sonnet-4-5", visibility: "hide" },
    { providerID: "opencode", modelID: "claude-sonnet-4-6", visibility: "hide" },
    { providerID: "opencode", modelID: "deepseek-v4-flash", visibility: "hide" },
    { providerID: "opencode", modelID: "gemini-3-flash", visibility: "hide" },
    { providerID: "opencode", modelID: "glm-5", visibility: "hide" },
    { providerID: "opencode", modelID: "glm-5.1", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5-codex", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5-nano", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.1", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.1-codex", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.1-codex-max", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.1-codex-mini", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.2", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.2-codex", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.3-codex-spark", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.4-pro", visibility: "hide" },
    { providerID: "opencode", modelID: "gpt-5.5-pro", visibility: "hide" },
    { providerID: "opencode", modelID: "kimi-k2.5", visibility: "hide" },
    { providerID: "opencode", modelID: "minimax-m2.5", visibility: "hide" },
    { providerID: "opencode", modelID: "minimax-m2.7", visibility: "hide" },
    { providerID: "opencode", modelID: "minimax-m3", visibility: "hide" },
    { providerID: "google", modelID: "gemini-3.1-flash-image-preview", visibility: "show" },
    { providerID: "openai", modelID: "gpt-5.5", visibility: "show" },
    { providerID: "openai", modelID: "gpt-5.4-mini", visibility: "show" },
    { providerID: "openai", modelID: "gpt-5.4", visibility: "show" },
    { providerID: "github-copilot", modelID: "claude-sonnet-5", visibility: "show" },
    { providerID: "github-copilot", modelID: "kimi-k2.7-code", visibility: "show" },
    { providerID: "github-copilot", modelID: "mai-code-1-flash-picker", visibility: "show" },
  ],
} satisfies DefaultModelConfig
