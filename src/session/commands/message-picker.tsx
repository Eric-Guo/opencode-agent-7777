import type { SessionMessageUser } from "@opencode/client/promise"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { SearchHighlight, SearchList } from "@opencode/ui/search-list"
import { uuid } from "@opencode/util/uuid"
import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import { readPromptPresentation } from "@/composer/comment-note"
import { useLanguage } from "@/runtime/i18n/language"
import { jumpSearchFields, matchingJumpSnippet } from "./jump-to-message"

function MessagePicker(props: { messages: SessionMessageUser[]; onSelect: (id: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const normalize = (text: string) => text.replace(/\s+/g, " ")
  const [query, setQuery] = createSignal("")
  const rows = createMemo(() =>
    props.messages.toReversed().map((message) => {
      const presentation = readPromptPresentation(message.metadata)
      const displayText = message.metadata?.displayText
      const text = typeof displayText === "string" ? displayText : message.text
      const attachment = language.t("ui.message.attachment.alt")
      const filenames = message.files?.map((file) => file.name || attachment).join(", ")
      const fields = jumpSearchFields(text.trim() || filenames || message.id, message.files, presentation, attachment)
      return { id: message.id, fields }
    }),
  )
  const matches = createMemo(() => {
    const search = normalize(query()).trim().toLowerCase()
    return rows().flatMap(({ id, fields }) => {
      const label = matchingJumpSnippet(fields, search)
      return label === undefined ? [] : [{ id, label }]
    })
  })
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={language.t("dialog.jump.title")} />
      </DialogHeader>
      <DialogBody class="min-h-0 !p-0">
        <SearchList
          items={matches()}
          key={(row) => row.id}
          query={query()}
          onQuery={setQuery}
          placeholder={language.t("common.search.placeholder")}
          label={language.t("dialog.jump.title")}
          empty={language.t(rows().length ? "dialog.jump.noMatches" : "dialog.jump.empty")}
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

export function useMessagePicker(
  owner: Accessor<unknown>,
  messages: Accessor<SessionMessageUser[]>,
  onSelect: (id: string) => void,
) {
  const dialog = useDialog()
  const lifetime = createMemo(() => {
    if (!owner()) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    return controller.signal
  })
  return () => {
    const signal = lifetime()
    if (!signal) return
    const id = uuid()
    const close = () => dialog.close(id)
    signal.addEventListener("abort", close, { once: true })
    void dialog.show(
      () => (
        <MessagePicker
          messages={messages()}
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
