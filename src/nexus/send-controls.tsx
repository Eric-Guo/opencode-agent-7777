import { createEffect, For, Show } from "solid-js"
import { Popover } from "@opencode/ui/popover"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { Button } from "@opencode/ui/button"
import { useSettings } from "../settings/model"
import { useLanguage } from "../runtime/i18n/language"
import type { ChatController } from "./controller"
import type { Approval } from "./chat"

function ModeControls(p: { chat: ChatController }) {
  const c = p.chat,
    lang = useLanguage()
  // Opening Run settings reads the durable choices again, including edits from another client.
  createEffect(() => {
    void c.loadModes()
  })
  return (
    <Show when={c.modes()}>
      <div class="chat-modes">
        <For each={["code_mode", "subagent"] as const}>
          {(key) => (
            <Switch
              checked={!!c.modes()?.[key] && (key !== "code_mode" || !!c.modes()?.code_mode_available)}
              disabled={
                !c.writable() || c.s.sending || c.s.prepared || (key === "code_mode" && !c.modes()?.code_mode_available)
              }
              onChange={(value) => void c.changeMode(key, value)}
            >
              {lang.t(key === "code_mode" ? "chat.codeMode" : "chat.subagent")}
            </Switch>
          )}
        </For>
        <small>{lang.t("chat.modeHint")}</small>
      </div>
    </Show>
  )
}

export function SendControls(p: { chat: ChatController }) {
  const c = p.chat,
    s = c.s,
    lang = useLanguage(),
    settings = useSettings()
  const choices = () => s.choices
  return (
    <div class="chat-row">
      <Popover
        placement="top-start"
        title={lang.t("chat.tools")}
        triggerAs="button"
        triggerProps={{
          type: "button",
          "aria-label": lang.t("chat.tools"),
          disabled: !c.writable() || s.sending || s.prepared,
          class: "chat-settings-trigger",
        }}
        trigger={
          <>
            <Icon name="settings-gear" size="small" />
            <span>{s.model || s.connection?.agent || "OpenCode"}</span>
          </>
        }
      >
        <div class="chat-inspect chat-controls">
          <label>
            {lang.t("chat.model")}
            <select value={s.model} onChange={(e) => c.configure({ model: e.currentTarget.value })}>
              <option value="">{lang.t("chat.automatic")}</option>
              <For each={choices()?.models}>{(model) => <option value={model}>{model}</option>}</For>
            </select>
          </label>
          <Show when={!s.id}>
            <label>
              {lang.t("chat.runner")}
              <select value={s.runner || ""} onChange={(e) => c.configure({ runner: e.currentTarget.value || null })}>
                <Show when={s.runner && !choices()?.runners.some((r) => r.id === s.runner)}>
                  <option value={s.runner!}>{s.runner}</option>
                </Show>
                <For each={choices()?.runners}>{(r) => <option value={r.id}>{r.name}</option>}</For>
              </select>
            </label>
          </Show>
          <label>
            {lang.t("chat.permissions")}
            <select value={s.approval} onChange={(e) => c.configure({ approval: e.currentTarget.value as Approval })}>
              <For each={choices()?.approvals ?? (["ask", "rules"] as const)}>
                {(mode) => <option value={mode}>{lang.t(`chat.${mode}`)}</option>}
              </For>
            </select>
          </label>
          <ModeControls chat={c} />
          <Show when={choices()?.modes === null}>
            <small>{lang.t("chat.modesUnavailable")}</small>
          </Show>
          <label>
            {lang.t("chat.delivery")}
            <select
              value={settings.general.followUpBehavior()}
              onChange={(e) =>
                settings.general.setFollowUpBehavior(e.currentTarget.value === "queue" ? "queue" : "steer")
              }
            >
              <option value="steer">{lang.t("chat.steer")}</option>
              <option value="queue">{lang.t("chat.queue")}</option>
            </select>
          </label>
        </div>
      </Popover>
      <Show when={s.snapshot.busy && c.writable() && (s.draft.trim() || c.latestSteer())}>
        <Button type="button" disabled={s.sending} onClick={() => void c.send(true)}>
          {lang.t(s.draft.trim() ? "chat.steer_now" : "chat.promote")}
        </Button>
      </Show>
    </div>
  )
}
