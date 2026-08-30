import { expect, test } from "bun:test"
import type { AudioStatus } from "@opencode-ai/client/promise"
import { createRecorderController, type RecorderRecordingClient } from "./recorder-control"

function audioStatus(state: AudioStatus["state"], active = false): AudioStatus {
  return {
    state,
    recordingID: active ? "recording-1" : null,
    active,
    backend: active ? "native" : null,
    startedAt: active ? 1 : null,
    endedAt: null,
    endReason: null,
    pcmBytes: 0,
    mp3Bytes: 0,
    durationMs: 0,
    progress: state,
    availability: true,
    permission: "authorized",
    environment: "local",
    errorCode: null,
    errorMessage: null,
    guidance: null,
  }
}

test("starts recording and stores the returned backend status", async () => {
  const calls: string[] = []
  const client: RecorderRecordingClient = {
    start: async () => {
      calls.push("start")
      return audioStatus("recording", true)
    },
    stop: async () => new Uint8Array(),
    status: async () => audioStatus("idle"),
  }
  const controller = createRecorderController(() => client, () => {})

  await controller.onChange("start")

  expect(calls).toEqual(["start"])
  expect(controller.state.status).toEqual(audioStatus("recording", true))
  expect(controller.state.pending).toBeUndefined()
})

test("stops the active recording by ID and refreshes its status", async () => {
  const calls: string[] = []
  const stopped: Uint8Array[] = []
  const completed = { ...audioStatus("completed"), recordingID: "recording-1" }
  const client: RecorderRecordingClient = {
    start: async () => {
      calls.push("start")
      return audioStatus("recording", true)
    },
    stop: async ({ recordingID }) => {
      calls.push(`stop:${recordingID}`)
      return new Uint8Array([1, 2, 3])
    },
    status: async () => {
      calls.push("status")
      return completed
    },
  }
  const controller = createRecorderController(
    () => client,
    () => {},
    async (audio) => {
      calls.push(`transcribe:${audio.join(",")}`)
      stopped.push(audio)
    },
  )

  await controller.onChange("start")
  await controller.onChange("stop")
  await controller.onChange("stop")

  expect(calls).toEqual([
    "start",
    "stop:recording-1",
    "status",
    "transcribe:1,2,3",
    "stop:recording-1",
    "status",
    "transcribe:1,2,3",
  ])
  expect(stopped).toHaveLength(2)
  expect(stopped.every((audio) => audio instanceof Uint8Array)).toBe(true)
  expect(controller.state.status).toEqual(completed)
})

test("refreshes status without invoking stop", async () => {
  const calls: string[] = []
  const client: RecorderRecordingClient = {
    start: async () => audioStatus("recording", true),
    stop: async () => {
      calls.push("stop")
      return new Uint8Array()
    },
    status: async () => {
      calls.push("status")
      return audioStatus("idle")
    },
  }
  const controller = createRecorderController(() => client, () => {})

  await controller.onChange("status")

  expect(calls).toEqual(["status"])
})

test("reports recorder request errors", async () => {
  const failure = new Error("microphone denied")
  const errors: unknown[] = []
  const client: RecorderRecordingClient = {
    start: async () => {
      throw failure
    },
    stop: async () => new Uint8Array(),
    status: async () => audioStatus("idle"),
  }
  const controller = createRecorderController(() => client, (error) => errors.push(error))

  await controller.onChange("start")

  expect(errors).toEqual([failure])
  expect(controller.state.pending).toBeUndefined()
})
