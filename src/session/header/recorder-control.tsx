import type { AudioStatus } from "@opencode-ai/client/promise"
import { Icon } from "@opencode-ai/ui/icon"
import { SegmentedControl, SegmentedControlItem } from "@opencode-ai/ui/segmented-control"
import { createEffect, createMemo, untrack, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { createServerSdk } from "@/runtime/server/client-compact"
import { state, setState } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

export type RecorderRecordingClient = {
  start(): Promise<AudioStatus>
  stop(input: { readonly recordingID: string }): Promise<Uint8Array>
  status(): Promise<AudioStatus>
}

type RecorderAction = "start" | "stop" | "status"

export function createRecorderController(
  client: Accessor<RecorderRecordingClient | undefined>,
  onError: (error: unknown) => void,
) {
  const [recorder, setRecorder] = createStore<{
    status: AudioStatus | undefined
    pending: RecorderAction | undefined
  }>({
    status: undefined,
    pending: undefined,
  })

  const requestStatus = async (action: Exclude<RecorderAction, "stop">) => {
    if (recorder.pending) return
    const recording = client()
    if (!recording) return

    setRecorder("pending", action)
    try {
      const result = await recording[action]()
      setRecorder("status", { ...result })
    } catch (error) {
      onError(error)
    } finally {
      setRecorder("pending", undefined)
    }
  }

  const stop = async () => {
    if (recorder.pending) return
    const recording = client()
    if (!recording) return

    setRecorder("pending", "stop")
    try {
      let status = recorder.status
      if (!status?.recordingID) {
        status = await recording.status()
        setRecorder("status", { ...status })
      }
      if (!status.recordingID) return

      await recording.stop({ recordingID: status.recordingID })
      const result = await recording.status()
      setRecorder("status", { ...result })
    } catch (error) {
      onError(error)
    } finally {
      setRecorder("pending", undefined)
    }
  }

  const onChange = (action: string | null) => {
    if (action === "start" || action === "status") return requestStatus(action)
    if (action === "stop") return stop()
    return Promise.resolve()
  }

  return {
    state: recorder,
    refreshStatus: () => requestStatus("status"),
    onChange,
  }
}

export function RecorderControl() {
  const language = useLanguage()
  const recordingClient = createMemo(() => {
    const server = state.server
    if (!server) return
    return createServerSdk(server).client.audio.recording
  })
  const recorder = createRecorderController(recordingClient, (error) => setState("error", readableError(error)))
  let initializedServerUrl: string | undefined

  createEffect(() => {
    const serverUrl = state.server?.url
    if (!serverUrl || initializedServerUrl === serverUrl) return
    initializedServerUrl = serverUrl
    untrack(() => void recorder.refreshStatus())
  })

  const recording = () => recorder.state.status?.active === true
  const selected = () => (recording() ? "start" : null)
  const statusSummary = () => {
    const status = recorder.state.status
    if (!status) return language.t("recorder.status.fetch")
    return language.t("recorder.status.summary", {
      state: status.state,
      duration: (status.durationMs / 1000).toFixed(1),
      progress: status.progress,
    })
  }

  return (
    <div title={statusSummary()}>
      <SegmentedControl
        value={selected()}
        onChange={(action) => void recorder.onChange(action)}
        disabled={!!recorder.state.pending}
        class="segmented-control-v2--fit-content"
        aria-label={language.t("recorder.label")}
      >
        <SegmentedControlItem value="start">
          <span class="inline-flex items-center gap-1.5">
            <Icon
              name="record-start"
              size="small"
              style={recording() ? { color: "var(--v2-state-fg-danger)" } : undefined}
            />
            <span class="max-[960px]:hidden">
              {recording() ? language.t("recorder.recording") : language.t("recorder.start")}
            </span>
          </span>
        </SegmentedControlItem>
        <SegmentedControlItem value="stop">
          <span class="inline-flex items-center gap-1.5">
            <Icon name="record-stop" size="small" />
            <span class="max-[960px]:hidden">{language.t("recorder.stop")}</span>
          </span>
        </SegmentedControlItem>
        <SegmentedControlItem value="status">
          <span class="inline-flex items-center gap-1.5">
            <Icon name="record-status" size="small" />
            <span class="max-[960px]:hidden">{language.t("recorder.status")}</span>
          </span>
        </SegmentedControlItem>
      </SegmentedControl>
      <span class="sr-only" aria-live="polite">
        {statusSummary()}
      </span>
    </div>
  )
}
