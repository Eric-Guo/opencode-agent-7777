import { refreshRecentSessions } from "@/home/sessions/directory-sync-recent-compact"
import { currentRuntime } from "@/runtime/server/session-store-compact"
import { confirmSessionWrite, type SessionWriteTarget } from "./session-write-compact"

export function createSessionRenamer(target: SessionWriteTarget, originalTitle: string | undefined) {
  const { api, sessionID } = target
  return {
    save: (title: string) =>
      confirmSessionWrite(
        target,
        (event) => event.type === "session.renamed" && event.data.sessionID === sessionID && event.data.title === title,
        (signal) => api.session.update({ sessionID, title }, { signal }),
      ),
    apply(title: string) {
      const active = currentRuntime()
      if (active?.id === sessionID && active.view().session.title === originalTitle) {
        active.setSession({ ...active.view().session, title })
      }
      void refreshRecentSessions()
    },
  }
}
