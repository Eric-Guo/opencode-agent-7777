# Model Selector Defaults

The source model defaults live in `src/providers/models/default-config.json`.

Models that offer variants show a variant menu beside the model selector. Choices are saved per provider/model in
the browser and pinned to the active session. Returning to a session restores its model and variant, including unsent
choices. Session choices take precedence over per-model preferences, followed by the agent's configured variant when
the selected model matches its configured model. **Default** sends no explicit variant and suppresses those fallbacks.
Server acknowledgements retire submitted choices without discarding newer composer selections. Variant preferences
and session choices are not exported into source defaults by `models:apply-localstorage`.

While the message editor is focused, **F2** cycles through recently selected models and **Shift+F2** cycles in reverse.
Cycling skips hidden or unavailable models and preserves the recent order. Select models from the model menu to add
them to the recent list. **Cmd+Shift+D** on macOS, or **Ctrl+Shift+D** elsewhere, cycles thinking effort through the
model's available variants and back to **Default**. These shortcuts preserve the draft and use the same session-scoped
choices as the selectors.

- `manageModels`: set `true` to show the Manage models entry in the model selector UI. Set `false` to hide it from users.
- `defaultSelection`: the model selected for users who do not already have `opencode.7777.model.selection` in localStorage. Use `{ "providerID": "...", "modelID": "..." }`, or `null` to use the server default.
- `disabledProviders`: provider IDs hidden by default. New models from these providers stay hidden.
- `popularProviders`: provider-level visibility for providers shown first in the model manager.
- `user`: per-model visibility overrides.

To enable the Manage models UI for a developer build:

```json
{
  "manageModels": true
}
```

To configure the default selected model in source:

```json
{
  "defaultSelection": { "providerID": "opencode", "modelID": "gpt-5.1-codex" }
}
```

Use the model's catalog `id` from the server model list for `modelID`; its provider API `modelID` may differ.
Older saved API IDs remain compatible when they identify exactly one model in that provider. If the selection is
missing or ambiguous, the UI falls back to the configured source default, server default, then the first available
model.

## Updating Source Defaults From Browser localStorage

One practical workflow is to enable `manageModels`, run the app, use the Manage models dialog to show or hide models, select the default model in the selector, then dump localStorage from the browser.

In the browser console:

```js
copy(
  JSON.stringify(
    {
      selection: JSON.parse(localStorage.getItem("opencode.7777.model.selection") || "null"),
      config: JSON.parse(localStorage.getItem("opencode.7777.model.config") || "null"),
    },
    null,
    2,
  ),
)
```

Then paste the copied JSON into the package script:

```sh
bun run models:apply-localstorage <<'JSON'
{
  "selection": {
    "providerID": "kimi-code-plan-cn",
    "modelID": "kimi-for-coding"
  },
  "config": {
    "user": [
      {
        "providerID": "opencode",
        "modelID": "claude-fable-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-6",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-7",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-4-8",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-4",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-4-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-4-6",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gemini-3-flash",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "glm-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "glm-5.1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5-nano",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1-codex-max",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.1-codex-mini",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.2",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.2-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.3-codex-spark",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.4-pro",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.5-pro",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "kimi-k2.5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "minimax-m2.5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "minimax-m2.7",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "minimax-m3",
        "visibility": "hide"
      },
      {
        "providerID": "google",
        "modelID": "gemini-3.1-flash-image-preview",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "kimi-k2.7-code",
        "visibility": "show"
      },
      {
        "providerID": "deepseek",
        "modelID": "deepseek-chat",
        "visibility": "hide"
      },
      {
        "providerID": "deepseek",
        "modelID": "deepseek-reasoner",
        "visibility": "hide"
      },
      {
        "providerID": "cerebras",
        "modelID": "zai-glm-4.7",
        "visibility": "show"
      },
      {
        "providerID": "siliconflow-cn",
        "modelID": "Pro/moonshotai/Kimi-K2.6",
        "visibility": "show"
      },
      {
        "providerID": "siliconflow-cn",
        "modelID": "Qwen/Qwen3.6-35B-A3B",
        "visibility": "show"
      },
      {
        "providerID": "siliconflow-cn",
        "modelID": "Qwen/Qwen3.5-27B",
        "visibility": "show"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-haiku-4-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.3-codex",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.4-nano",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.4",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "deepseek-v4-pro",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-sonnet-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gemini-3.5-flash",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gpt-5.4-mini",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "qwen3.5-plus",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gemini-3.5-flash-lite",
        "visibility": "hide"
      },
      {
        "providerID": "google",
        "modelID": "gemini-3.1-flash-lite-image",
        "visibility": "show"
      },
      {
        "providerID": "google",
        "modelID": "gemini-3-pro-image-preview",
        "visibility": "show"
      },
      {
        "providerID": "opencode",
        "modelID": "gemini-3.1-pro",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "gemini-3.6-flash",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "grok-4.5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "muse-spark-1.2",
        "visibility": "hide"
      },
      {
        "providerID": "github-copilot",
        "modelID": "mai-code-1.1-flash",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "gpt-5.6-luna",
        "visibility": "show"
      },
      {
        "providerID": "cerebras",
        "modelID": "gpt-oss-120b",
        "visibility": "show"
      },
      {
        "providerID": "opencode",
        "modelID": "claude-opus-5",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "kimi-k2.6",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "modelID": "muse-spark-1.2-contributor-free",
        "visibility": "hide"
      },
      {
        "providerID": "github-copilot",
        "modelID": "gemini-3.8-flash",
        "visibility": "show"
      },
      {
        "providerID": "cerebras",
        "modelID": "qwen-3.8-27b",
        "visibility": "show"
      },
      {
        "providerID": "deepseek",
        "modelID": "deepseek-v4-flash",
        "visibility": "hide"
      },
      {
        "providerID": "kimi-for-coding",
        "modelID": "kimi-for-coding-highspeed",
        "visibility": "hide"
      },
      {
        "providerID": "opencode-go",
        "modelID": "deepseek-v4-flash-vision-exp",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "deepseek-v4.1-flash",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "glm-5.3",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "glm-5.3-flash",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "gpt-6-luna",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "grok-4.7",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "hy4-preview",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "kimi-k2.7-code",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "kimi-k3",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "longcat-2.5-preview-free",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "mimo-v2.6-flash",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "mimo-v2.6-pro",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "muse-spark-1.3-contributor",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "space-bunny-free",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "qwen3.8-max",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "qwen3.8-flash",
        "visibility": "show"
      },
      {
        "providerID": "anthropic",
        "modelID": "claude-sonnet-5-5",
        "visibility": "show"
      },
      {
        "providerID": "anthropic",
        "modelID": "claude-opus-5-5",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "claude-sonnet-5.5",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "gpt-6-luna",
        "visibility": "show"
      },
      {
        "providerID": "github-copilot",
        "modelID": "gpt-5.3-codex",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-5.6-sol",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-6-astra",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-6-luna",
        "visibility": "show"
      },
      {
        "providerID": "google",
        "modelID": "gemini-3.8-flash",
        "visibility": "show"
      },
      {
        "providerID": "google",
        "modelID": "gemini-flash-latest",
        "visibility": "show"
      },
      {
        "providerID": "google",
        "modelID": "gemini-flash-lite-latest",
        "visibility": "show"
      },
      {
        "providerID": "minimax",
        "modelID": "MiniMax-M2.7",
        "visibility": "show"
      },
      {
        "providerID": "siliconflow-cn",
        "modelID": "deepseek-ai/DeepSeek-V4-Flash",
        "visibility": "show"
      },
      {
        "providerID": "siliconflow-cn",
        "modelID": "stepfun-ai/Step-3.5-Flash",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-6.1-sol",
        "visibility": "show"
      },
      {
        "providerID": "openai",
        "modelID": "gpt-image-2",
        "visibility": "show"
      },
      {
        "providerID": "kimi-code-plan-cn",
        "modelID": "kimi-for-coding-highspeed",
        "visibility": "hide"
      },
      {
        "providerID": "opencode-go",
        "modelID": "claude-haiku-5-5",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "step-5-preview-free",
        "visibility": "show"
      },
      {
        "providerID": "opencode-go",
        "modelID": "space-bunny",
        "visibility": "show"
      },
      {
        "providerID": "opencode",
        "modelID": "muse-spark-1.3",
        "visibility": "hide"
      },
      {
        "modelID": "deepseek-ai/DeepSeek-V3.1-Terminus",
        "providerID": "siliconflow-cn",
        "visibility": "show"
      },
      {
        "modelID": "gemini-4-argon-contributor",
        "providerID": "opencode-go",
        "visibility": "show"
      },
      {
        "modelID": "step-5-preview",
        "providerID": "opencode-go",
        "visibility": "show"
      }
    ],
    "disabledProviders": [
      "siliconflow-cn",
      "minimax",
      "cerebras",
      "kimi-code-plan-global"
    ],
    "popularProviders": [
      {
        "providerID": "github-copilot",
        "visibility": "hide"
      },
      {
        "providerID": "google",
        "visibility": "hide"
      },
      {
        "providerID": "openai",
        "visibility": "hide"
      },
      {
        "providerID": "opencode",
        "visibility": "show"
      },
      {
        "providerID": "openrouter",
        "visibility": "hide"
      },
      {
        "providerID": "opencode-go",
        "visibility": "hide"
      },
      {
        "providerID": "anthropic",
        "visibility": "hide"
      }
    ],
    "recent": [
      {
        "providerID": "kimi-code-plan-cn",
        "modelID": "kimi-for-coding"
      },
      {
        "providerID": "opencode",
        "modelID": "muse-spark-1.3-contributor-free"
      },
      {
        "providerID": "opencode",
        "modelID": "nemotron-3.5-lightning-free"
      },
      {
        "providerID": "opencode",
        "modelID": "union-alpha"
      },
      {
        "providerID": "opencode-go",
        "modelID": "union-alpha"
      }
    ]
  }
}
JSON
```

On macOS, after using `copy(...)` in Chrome, this is shorter:

```sh
pbpaste | bun run models:apply-localstorage
```

The script updates `src/providers/models/default-config.json`. It imports `config.user`, `config.disabledProviders`, `config.popularProviders`, and uses `selection` as `defaultSelection`. It intentionally does not store `recent` in source defaults.

Useful overrides:

```sh
pbpaste | bun run models:apply-localstorage --manage=false
pbpaste | bun run models:apply-localstorage --default=opencode:gpt-5.1-codex
```

After changing model defaults, run:

```sh
bun run typecheck
bun run build
```
