import type { SessionMessageUser } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { SearchHighlight, SearchList } from "@opencode/ui/search-list"
import { uuid } from "@opencode/util/uuid"
import { createMemo, createSignal } from "solid-js"
import { readPromptPresentation } from "@/composer/comment-note"
import { useLanguage } from "@/runtime/i18n/language"

function ForkDialog(props: { messages: SessionMessageUser[]; onSelect: (id: string) => void }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [query, setQuery] = createSignal("")
  const rows = createMemo(() =>
    props.messages.toReversed().map((message) => {
      const text = (readPromptPresentation(message.metadata)?.displayText ?? message.text).trim()
      const filenames = message.files?.map((file) => file.name || language.t("ui.message.attachment.alt")).join(", ")
      return { id: message.id, label: text || filenames || message.id }
    }),
  )
  const matches = createMemo(() => {
    const search = query().trim().toLowerCase()
    return rows().filter((row) => row.label.toLowerCase().includes(search))
  })
  return (
    <Dialog fit>
      <DialogHeader>
        <DialogTitleGroup title={language.t("command.session.fork")} />
      </DialogHeader>
      <DialogBody class="min-h-0 !p-0">
        <SearchList
          items={matches()}
          key={(row) => row.id}
          query={query()}
          onQuery={setQuery}
          placeholder={language.t("common.search.placeholder")}
          label={language.t("command.session.fork")}
          empty={language.t(rows().length ? "dialog.fork.search.empty" : "dialog.fork.empty")}
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

export function useForkPicker() {
  const dialog = useDialog()
  return (messages: () => SessionMessageUser[], onSelect: (id: string) => void, signal: AbortSignal) => {
    const id = uuid()
    const close = () => dialog.close(id)
    signal.addEventListener("abort", close, { once: true })
    void dialog.show(
      () => <ForkDialog messages={messages()} onSelect={onSelect} />,
      () => signal.removeEventListener("abort", close),
      id,
      signal,
    )
  }
}

export function useForkConfirmation() {
  const dialog = useDialog()
  const language = useLanguage()

  return (created: boolean, signal: AbortSignal) => {
    if (signal.aborted) return Promise.resolve(false)
    const id = uuid()
    const answer = Promise.withResolvers<boolean>()
    const close = () => dialog.close(id)
    const cancel = () => {
      answer.resolve(false)
      close()
    }
    signal.addEventListener("abort", cancel, { once: true })
    void dialog
      .show(
        () => (
          <Dialog fit>
            <DialogHeader hideClose>
              <DialogTitleGroup
                title={language.t("ui.message.forkMessage")}
                description={language.t(created ? "session.fork.draftChanged" : "session.fork.confirm")}
              />
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" autofocus onClick={cancel}>
                {language.t("ui.common.cancel")}
              </Button>
              <Button
                variant="contrast"
                onClick={() => {
                  if (dialog.active?.id !== id) return
                  answer.resolve(true)
                  close()
                }}
              >
                {language.t(created ? "session.fork.open" : "session.fork.replace")}
              </Button>
            </DialogFooter>
          </Dialog>
        ),
        () => answer.resolve(false),
        id,
        signal,
      )
      .catch(answer.reject)
    return answer.promise.finally(() => signal.removeEventListener("abort", cancel))
  }
}
