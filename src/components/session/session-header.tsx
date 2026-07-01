import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { windowsElectron } from "@/context/platform"

export function SessionHeader(props: { status: string; userDialogCount: number }) {
  return (
    <header class="topbar" data-windows-electron={windowsElectron ? "" : undefined}>
      <div>
        <h1>7777</h1>
        <p>{props.status}</p>
      </div>
      <div class="session-pill">
        <span>{props.userDialogCount}</span>
        <span>/</span>
        <span>{HISTORY_DIALOG_LIMIT}</span>
      </div>
    </header>
  )
}
