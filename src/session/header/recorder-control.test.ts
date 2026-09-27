import { expect, test } from "bun:test"
import { type AudioStatus } from "@opencode/client/promise"
import { createRecorderController, type RecorderRecordingClient, type RecorderDestination } from "./recorder-control"

function destination(): RecorderDestination {
  return { save: async (_, filename) => `/workspace/${filename}`, transcribe: async () => {} }
}

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
    release: async () => {},
    start: async () => {
      calls.push("start")
      return audioStatus("recording", true)
    },
    stop: async () => new Uint8Array(),
    status: async () => audioStatus("idle"),
  }
  const controller = createRecorderController(
    () => client,
    () => {},
    destination,
  )

  await controller.onChange("start")

  expect(calls).toEqual(["start"])
  expect(controller.state.status).toEqual(audioStatus("recording", true))
  expect(controller.state.pending).toBeUndefined()
})

test("saves before transcription and disables repeated stops", async () => {
  const calls: string[] = []
  const stopped: Uint8Array[] = []
  const completed = { ...audioStatus("completed"), recordingID: "recording-1" }
  const client: RecorderRecordingClient = {
    release: async ({ recordingID }) => {
      calls.push(`release:${recordingID}`)
    },
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
    () => ({
      async save(audio, filename) {
        calls.push(`save:${filename}:${audio.join(",")}`)
        return `/workspace/${filename}`
      },
      async transcribe(audio) {
        calls.push(`transcribe:${audio.join(",")}`)
        stopped.push(audio)
      },
    }),
  )

  await controller.onChange("start")
  await controller.onChange("stop")
  await controller.onChange("stop")

  expect(calls).toEqual([
    "start",
    "stop:recording-1",
    "save:record_1.mp3:1,2,3",
    "release:recording-1",
    "status",
    "transcribe:1,2,3",
  ])
  expect(stopped).toHaveLength(1)
  expect(controller.canStop()).toBe(false)
  expect(controller.canStart()).toBe(true)
  expect(controller.state.unsaved).toBe(false)
  expect(controller.state.saved).toEqual({ recordingID: "recording-1", path: "/workspace/record_1.mp3" })
  expect(stopped.every((audio) => audio instanceof Uint8Array)).toBe(true)
  expect(controller.state.status).toEqual(completed)
})

test("refreshes status without invoking stop", async () => {
  const calls: string[] = []
  const client: RecorderRecordingClient = {
    release: async () => {},
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
  const controller = createRecorderController(
    () => client,
    () => {},
    destination,
  )

  await controller.onChange("status")

  expect(calls).toEqual(["status"])
})

test("reports recorder request errors", async () => {
  const failure = new Error("microphone denied")
  const errors: unknown[] = []
  const client: RecorderRecordingClient = {
    release: async () => {},
    start: async () => {
      throw failure
    },
    stop: async () => new Uint8Array(),
    status: async () => audioStatus("idle"),
  }
  const controller = createRecorderController(
    () => client,
    (error) => errors.push(error),
    destination,
  )

  await controller.onChange("start")

  expect(errors).toEqual([failure])
  expect(controller.state.pending).toBeUndefined()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function fixture(target: () => RecorderDestination = destination) {
  const calls: string[] = []
  const errors: unknown[] = []
  let starts = 0
  const client: RecorderRecordingClient = {
    release: async () => {},
    start: async () => {
      calls.push("start")
      return { ...audioStatus("recording", true), recordingID: `recording-${++starts}` }
    },
    stop: async () => {
      calls.push("stop")
      return new Uint8Array([1, 2, 3])
    },
    status: async () => {
      calls.push("status")
      return { ...audioStatus("completed"), recordingID: `recording-${starts}` }
    },
  }
  return {
    client,
    calls,
    errors,
    controller: createRecorderController(
      () => client,
      (error) => errors.push(error),
      target,
    ),
  }
}

test("waits for disk success, then disables Stop during a slow or failed transcription", async () => {
  const disk = deferred<string>()
  const transcription = deferred<void>()
  const enteredSave = deferred<void>()
  const enteredTranscription = deferred<void>()
  const f = fixture(() => ({
    save: async () => {
      enteredSave.resolve()
      return disk.promise
    },
    transcribe: async () => {
      enteredTranscription.resolve()
      return transcription.promise
    },
  }))
  await f.controller.onChange("start")
  const stopping = f.controller.onChange("stop")
  await enteredSave.promise
  expect(f.controller.state.unsaved).toBe(true)
  expect(f.controller.state.saved).toBeUndefined()
  expect(f.controller.canStart()).toBe(false)
  await f.controller.onChange("stop")
  expect(f.calls).toEqual(["start", "stop"])

  disk.resolve("/workspace/record_1.mp3")
  await enteredTranscription.promise
  expect(f.controller.state.unsaved).toBe(false)
  expect(f.controller.canStop()).toBe(false)
  expect(f.controller.state.pending).toBe("stop")
  const failure = new Error("transcription temporarily unavailable")
  transcription.reject(failure)
  await stopping
  await f.controller.onChange("stop")
  expect(f.errors).toEqual([failure])
  expect(f.controller.state.saved?.path).toBe("/workspace/record_1.mp3")
  expect(f.controller.state.pending).toBeUndefined()
  expect(f.calls).toEqual(["start", "stop", "status"])
  await f.controller.onChange("start")
  expect(f.controller.canStop()).toBe(true)
  expect(f.controller.state.saved).toBeUndefined()
})

test("failed writes retain bytes and their destination for retry, without stopping again", async () => {
  const failure = new Error("disk full")
  const writes: Array<{ audio: number[]; filename: string }> = []
  const transcribed: number[][] = []
  const target: RecorderDestination = {
    async save(audio, filename) {
      writes.push({ audio: Array.from(audio), filename })
      if (writes.length === 1) throw failure
      return `/workspace/${filename}`
    },
    async transcribe(audio) {
      transcribed.push(Array.from(audio))
    },
  }
  let active = target
  const f = fixture(() => active)
  await f.controller.onChange("start")
  await f.controller.onChange("stop")
  expect(f.errors).toEqual([failure])
  expect(f.controller.state.unsaved).toBe(true)
  expect(f.controller.canStart()).toBe(false)
  expect(f.controller.canStop()).toBe(true)
  expect(transcribed).toEqual([])
  active = {
    save: async () => {
      throw new Error("wrong workspace")
    },
    transcribe: async () => {
      throw new Error("wrong session")
    },
  }
  await f.controller.onChange("start")
  await f.controller.onChange("stop")
  expect(writes).toEqual([
    { audio: [1, 2, 3], filename: "record_1.mp3" },
    { audio: [1, 2, 3], filename: "record_1.mp3" },
  ])
  expect(f.calls).toEqual(["start", "stop", "status"])
  expect(transcribed).toEqual([[1, 2, 3]])
  expect(f.controller.state.unsaved).toBe(false)
})

test("a status refresh failure after stop cannot prevent saving or transcription", async () => {
  const calls: string[] = []
  const f = fixture(() => ({
    save: async () => {
      calls.push("save")
      return "/workspace/record_1.mp3"
    },
    transcribe: async () => {
      calls.push("transcribe")
    },
  }))
  const failure = new Error("status unavailable")
  f.client.status = async () => {
    throw failure
  }
  await f.controller.onChange("start")
  await f.controller.onChange("stop")
  expect(calls).toEqual(["save", "transcribe"])
  expect(f.errors).toEqual([failure])
  expect(f.controller.canStop()).toBe(false)
})

test("captures the session before stopping and does not mutate backend status objects", async () => {
  const stopped = deferred<Uint8Array>()
  const source = Object.freeze(audioStatus("recording", true))
  const target = destination()
  let active = target
  const calls: string[] = []
  target.save = async () => {
    calls.push("original save")
    return "/workspace/record_1.mp3"
  }
  target.transcribe = async () => {
    calls.push("original transcribe")
  }
  const f = fixture(() => active)
  f.client.start = async () => source
  f.client.stop = () => stopped.promise
  await f.controller.onChange("start")
  const stopping = f.controller.onChange("stop")
  active = {
    save: async () => {
      throw new Error("wrong workspace")
    },
    transcribe: async () => {},
  }
  stopped.resolve(new Uint8Array([1, 2, 3]))
  await stopping
  expect(calls).toEqual(["original save", "original transcribe"])
  expect(source).toEqual(audioStatus("recording", true))
})

test("does not release unsaved audio and continues transcription after a release failure", async () => {
  const failure = new Error("release unavailable")
  const calls: string[] = []
  let writable = false
  const f = fixture(() => ({
    async save() {
      calls.push("save")
      if (!writable) throw new Error("disk full")
      return "/workspace/record_1.mp3"
    },
    async transcribe() {
      calls.push("transcribe")
    },
  }))
  f.client.release = async () => {
    calls.push("release")
    throw failure
  }
  await f.controller.onChange("start")
  await f.controller.onChange("stop")
  expect(calls).toEqual(["save"])
  writable = true
  await f.controller.onChange("stop")
  expect(calls).toEqual(["save", "save", "release", "transcribe"])
  expect(f.errors.at(-1)).toBe(failure)
  expect(f.controller.state.unsaved).toBe(false)
  expect(f.controller.canStop()).toBe(false)
})

test("a refreshed empty status cannot strand a failed save", async () => {
  let writes = 0
  const f = fixture(() => ({
    ...destination(),
    save: async () => {
      if (++writes === 1) throw new Error("disk full")
      return "/workspace/record_1.mp3"
    },
  }))
  await f.controller.onChange("start")
  await f.controller.onChange("stop")
  f.client.status = async () => audioStatus("idle")
  await f.controller.refreshStatus()
  expect(f.controller.canStop()).toBe(true)
  await f.controller.onChange("stop")
  expect(writes).toBe(2)
  expect(f.controller.state.unsaved).toBe(false)
  expect(f.controller.state.saved?.path).toBe("/workspace/record_1.mp3")
  expect(f.calls.filter((call) => call === "stop")).toHaveLength(1)
})
