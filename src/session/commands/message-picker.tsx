import type { SessionMessageInfo, SessionMessageUser } from "@opencode/client/promise"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { SearchHighlight, SearchList } from "@opencode/ui/search-list"
import { uuid } from "@opencode/util/uuid"
import { createMemo, createSignal } from "solid-js"
import { readPromptPresentation } from "@/composer/comment-note"
import { useLanguage } from "@/runtime/i18n/language"
import type { SessionRuntime } from "@/runtime/server/runtime"
import { selectSessionUserMessages } from "@/session/session-domain"

const LABELS = {
  fork: { title: "command.session.fork", empty: "dialog.fork.empty", noMatches: "dialog.fork.search.empty" },
  jump: { title: "dialog.jump.title", empty: "dialog.jump.empty", noMatches: "dialog.jump.noMatches" },
} as const

function jumpSnippet(text: string, match: number, length: number) {
  const prefix = Math.max(0, match - 16)
  const space = text.indexOf(" ", prefix)
  const start = prefix && space >= prefix && space < match ? space + 1 : prefix
  const end = Math.max(start + 90, match + length + 16)
  return (start ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "")
}

function MessagePicker(props: {
  action: keyof typeof LABELS
  messages: SessionMessageUser[]
  onSelect: (id: string) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const labels = LABELS[props.action]
  const normalize = (text: string) => (props.action === "jump" ? text.replace(/\s+/g, " ") : text)
  const [query, setQuery] = createSignal("")
  const rows = createMemo(() =>
    props.messages.toReversed().map((message) => {
      const text = (readPromptPresentation(message.metadata)?.displayText ?? message.text).trim()
      const filenames = message.files?.map((file) => file.name || language.t("ui.message.attachment.alt")).join(", ")
      return { id: message.id, label: normalize(text || filenames || message.id) }
    }),
  )
  const matches = createMemo(() => {
    const search = normalize(query()).trim().toLowerCase()
    return rows().flatMap(({ id, label }) => {
      const match = label.toLowerCase().indexOf(search)
      if (match < 0) return []
      return [{ id, label: props.action === "jump" ? jumpSnippet(label, match, search.length) : label }]
    })
  })
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={language.t(labels.title)} />
      </DialogHeader>
      <DialogBody class="min-h-0 !p-0">
        <SearchList
          items={matches()}
          key={(row) => row.id}
          query={query()}
          onQuery={setQuery}
          placeholder={language.t("common.search.placeholder")}
          label={language.t(labels.title)}
          empty={language.t(rows().length ? labels.noMatches : labels.empty)}
          onSelect={(row) => {
            if (dialog.closing) return
            dialog.close()
            props.onSelect(row.id)
          }}
        >
          {(row, attrs) => (
            <button type="button" tabIndex={-1} {...attrs}>
              <span class="truncate" dir="auto">
                <SearchHighlight text={row().label} />
              </span>
            </button>
          )}
        </SearchList>
      </DialogBody>
    </Dialog>
  )
}

// Both actions apply only to delivered user prompts in the currently projected timeline.
export function useMessagePicker(action: keyof typeof LABELS, visibleMessages: () => SessionMessageInfo[]) {
  const dialog = useDialog()
  return (runtime: SessionRuntime, onSelect: (id: string) => void, signal = runtime.signal) => {
    const id = uuid()
    const close = () => dialog.close(id)
    signal.addEventListener("abort", close, { once: true })
    void dialog.show(
      () => (
        <MessagePicker
          action={action}
          messages={selectSessionUserMessages(visibleMessages()).filter((row) => runtime.deliveredPrompt(row.id))}
          onSelect={(messageID) => {
            if (!signal.aborted) onSelect(messageID)
          }}
        />
      ),
      () => signal.removeEventListener("abort", close),
      id,
      signal,
    )
  }
}
