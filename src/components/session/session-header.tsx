import { HISTORY_DIALOG_LIMIT } from "@/constants/session"
import { windowsElectron } from "@/context/platform"

export function SessionHeader(props: { status: string; userDialogCount: number }) {
  return (
    <header class="flex min-w-0 items-center justify-between gap-4 bg-v2-background-bg-deep px-11 pb-4 pt-7 [-webkit-app-region:drag] select-none max-[720px]:px-[18px] max-[720px]:pb-3 max-[720px]:pt-[18px]">
      <div>
        <h1 class="m-0 text-xl font-[720] leading-[1.1] tracking-[0] text-v2-text-text-base">7777</h1>
        <p class="m-0 mt-1 text-xs leading-[1.2] text-v2-text-text-faint">{props.status}</p>
      </div>
      <div
        class="inline-flex h-[30px] min-w-[58px] items-center justify-center gap-1 rounded-full border border-v2-border-border-base bg-v2-background-bg-layer-01 text-xs font-[650] text-v2-text-text-muted [-webkit-app-region:no-drag] select-none"
        classList={{ "mr-[138px]": windowsElectron }}
      >
        <span>{props.userDialogCount}</span>
        <span>/</span>
        <span>{HISTORY_DIALOG_LIMIT}</span>
      </div>
    </header>
  )
}
