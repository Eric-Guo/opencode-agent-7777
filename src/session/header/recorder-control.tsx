import { type AudioStatus } from "@opencode/client/promise"
import { Icon } from "@opencode/ui/icon"
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { createEffect, createMemo, untrack, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { FETCH_MESSAGE_LIMIT } from "@/constants/session"
import { useLanguage } from "@/runtime/i18n/language"
import { createServerSdk } from "@/runtime/server/client-compact"
import { refreshMessages } from "@/runtime/server/global-sync/session-cache-messages"
import { currentSession, state, setState } from "@/runtime/server/session-store-compact"
import { readableError } from "@/shell/errors/readable"

export type RecorderRecordingClient = {
  start(): Promise<AudioStatus>
  stop(input: { readonly recordingID: string }): Promise<Uint8Array>
  release(input: { readonly recordingID: string }): Promise<void>
  status(): Promise<AudioStatus>
}

type RecorderAction = "start" | "stop" | "status"

export type RecorderDestination = {
  save(audio: Uint8Array, filename: string): Promise<string>
  transcribe(audio: Uint8Array): Promise<unknown>
}

export function createRecorderController(
  client: Accessor<RecorderRecordingClient | undefined>,
  onError: (error: unknown) => void,
  destination: Accessor<RecorderDestination>,
) {
  const [recorder, setRecorder] = createStore<{
    status: AudioStatus | undefined
    pending: RecorderAction | undefined
    unsaved: boolean
    saved: { recordingID: string; path: string } | undefined
  }>({
    status: undefined,
    pending: undefined,
    unsaved: false,
    saved: undefined,
  })
  let retained:
    | {
        audio: Uint8Array
        filename: string
        recordingID: string
        recording: RecorderRecordingClient
        target: RecorderDestination
      }
    | undefined

  const canStop = () =>
    recorder.unsaved || (!!recorder.status?.recordingID && recorder.status.recordingID !== recorder.saved?.recordingID)
  const canStart = () => !recorder.unsaved && !recorder.status?.active

  const requestStatus = async (action: Exclude<RecorderAction, "stop">) => {
    if (recorder.pending) return
    if (action === "start" && !canStart()) return
    const recording = client()
    if (!recording) return

    setRecorder("pending", action)
    try {
      const result = await recording[action]()
      setRecorder("status", { ...result })
      if (action === "start") setRecorder("saved", undefined)
    } catch (error) {
      onError(error)
    } finally {
      setRecorder("pending", undefined)
    }
  }

  const stop = async () => {
    if (recorder.pending) return
    const recording = retained?.recording ?? client()
    if (!recording) return

    setRecorder("pending", "stop")
    try {
      if (!retained) {
        // Capture the destination before stopping; switching sessions while saving
        // must not send the recording to a different workspace or conversation.
        const target = destination()
        let status = recorder.status
        if (!status?.recordingID) {
          status = await recording.status()
          setRecorder("status", { ...status })
        }
        if (!status.recordingID || !canStop()) return
        const filename = `record_${status.startedAt ?? Date.now()}.mp3`
        const audio = await recording.stop({ recordingID: status.recordingID })
        retained = { audio, filename, recordingID: status.recordingID, recording, target }
        setRecorder("unsaved", true)
        setRecorder("status", { ...status, active: false, state: "completed" })
      }

      const saved = await retained.target.save(retained.audio, retained.filename)
      const { audio, target, recordingID } = retained
      // A failed save keeps the bytes for retry and prevents Start from replacing
      // the backend's only recording. Once saved, Stop must never resubmit it.
      retained = undefined
      setRecorder({ unsaved: false, saved: { recordingID, path: saved } })

      // Release only after persistence succeeds. Cleanup failure must not prevent
      // transcription of the already saved recording.
      try {
        await recording.release({ recordingID })
      } catch (error) {
        onError(error)
      }

      // Status is informational: its failure must not discard or block saved audio.
      try {
        const result = await recording.status()
        setRecorder("status", { ...result })
      } catch (error) {
        onError(error)
      }
      await target.transcribe(audio)
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
    canStart,
    canStop,
    refreshStatus: () => requestStatus("status"),
    onChange,
  }
}

export function RecorderControl(props: { onStatusSummaryChange?: (summary: string) => void }) {
  const language = useLanguage()
  const recordingClient = createMemo(() => {
    const server = state.server
    if (!server) return
    return createServerSdk(server).client.audio.recording
  })
  const recorder = createRecorderController(
    recordingClient,
    (error) => setState("error", readableError(error)),
    () => {
      const active = currentSession()
      if (!active) throw new Error(state.error)
      const directory = state.session!.location.directory
      return {
        async save(audio, filename) {
          const result = await active.client.file.write({ location: { directory }, path: filename, payload: audio })
          return result.data.path
        },
        async transcribe(audio) {
          await active.client.audio.transcriptions({ sessionID: active.sessionID, payload: audio })
          if (state.session?.id === active.sessionID) await refreshMessages(FETCH_MESSAGE_LIMIT)
        },
      }
    },
  )
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
    const summary = language.t("recorder.status.summary", {
      state: status.state,
      duration: (status.durationMs / 1000).toFixed(1),
      progress: status.progress,
    })
    return recorder.state.saved
      ? language.t("recorder.status.saved", { summary, path: recorder.state.saved.path })
      : summary
  }

  createEffect(() => props.onStatusSummaryChange?.(statusSummary()))

  return (
    <div title={statusSummary()}>
      <SegmentedControl
        value={selected()}
        onChange={(action) => void recorder.onChange(action)}
        disabled={!!recorder.state.pending}
        class="segmented-control-v2--fit-content"
        aria-label={language.t("recorder.label")}
      >
        <SegmentedControlItem value="start" disabled={!recorder.canStart()}>
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
        <SegmentedControlItem value="stop" disabled={!recorder.canStop()}>
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
