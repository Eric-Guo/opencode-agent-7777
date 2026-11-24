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
import { jumpSearchFields, matchingJumpSnippet } from "./jump-to-message"

const LABELS = {
  fork: { title: "command.session.fork", empty: "dialog.fork.empty", noMatches: "dialog.fork.search.empty" },
  jump: { title: "dialog.jump.title", empty: "dialog.jump.empty", noMatches: "dialog.jump.noMatches" },
} as const

function MessagePicker(props: {
  action: keyof typeof LABELS
  messages: SessionMessageUser[]
  onSelect: (id: string) => void
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const labels = LABELS[props.action]
  const [query, setQuery] = createSignal("")
  const rows = createMemo(() =>
    props.messages.toReversed().map((message) => {
      const presentation = readPromptPresentation(message.metadata)
      // Even an incomplete card envelope can explicitly hide model-only text from Jump.
      const displayText = props.action === "jump" ? message.metadata?.displayText : presentation?.displayText
      const text = typeof displayText === "string" ? displayText : message.text
      const attachment = language.t("ui.message.attachment.alt")
      const label = text.trim() || message.files?.map((file) => file.name || attachment).join(", ") || message.id
      const fields =
        props.action === "jump" ? jumpSearchFields(label, message.files, presentation, attachment) : undefined
      return { id: message.id, label, fields }
    }),
  )
  const matches = createMemo(() => {
    const search = (props.action === "jump" ? query().replace(/\s+/g, " ") : query()).trim().toLowerCase()
    return rows().flatMap(({ id, label, fields }) => {
      if (!fields) return label.toLowerCase().includes(search) ? [{ id, label }] : []
      const snippet = matchingJumpSnippet(fields, search)
      return snippet === undefined ? [] : [{ id, label: snippet }]
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
