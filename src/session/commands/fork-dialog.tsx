import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { uuid } from "@opencode/util/uuid"
import { useLanguage } from "@/runtime/i18n/language"

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
