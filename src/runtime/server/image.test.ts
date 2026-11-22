import { OpenCode } from "@opencode/client/promise"
import { expect, test } from "bun:test"
import { readLocalImage } from "./image"

function client() {
  const requests: Request[] = []
  const api = OpenCode.make({
    baseUrl: "https://server.example",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init))
        return new Response(new Uint8Array([0, 127, 255]))
      },
      { preconnect() {} },
    ),
  })
  return { api, requests }
}

test.each([
  ["/project/", "./charts/../figures/chart #1%.PNG", "figures/chart%20%231%25.PNG", "image/png"],
  ["/", "/figures/chart.svg", "figures/chart.svg", "image/svg+xml"],
  ["C:\\Project", "c:/project/charts/result.jpg", "charts/result.jpg", "image/jpeg"],
  ["\\\\host\\share", "charts/result.webp", "charts/result.webp", "image/webp"],
])("reads workspace image bytes under %s using the session location", async (directory, path, encoded, type) => {
  const { api, requests } = client()
  const controller = new AbortController()
  const blob = await readLocalImage(api, directory, path, controller.signal)
  expect(blob?.type).toBe(type)
  expect(await blob?.bytes()).toEqual(new Uint8Array([0, 127, 255]))
  expect(requests).toHaveLength(1)
  const url = new URL(requests[0]!.url)
  expect(url.pathname).toBe(`/api/fs/read/${encoded}`)
  expect(url.searchParams.get("location[directory]")).toBe(directory)
  controller.abort()
  expect(requests[0]!.signal.aborted).toBe(true)
})

test("ignores non-images, network paths and files outside the active directory", async () => {
  const { api, requests } = client()
  for (const path of [
    "./doc.txt",
    "../chart.png",
    "/Project/chart.png",
    "/project2/chart.png",
    "https://host/a.svg",
    "//host/chart.png",
    "D:/chart.png",
  ]) {
    expect(await readLocalImage(api, "/project", path, new AbortController().signal)).toBeUndefined()
  }
  expect(requests).toHaveLength(0)
})
