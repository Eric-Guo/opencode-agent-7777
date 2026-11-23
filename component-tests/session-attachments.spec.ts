import { createHash } from "node:crypto"
import { expect, test, type Page } from "@playwright/test"
import { setupSession } from "./session.fixture"

test.use({ userAgent: "7777 fixture Electron/44", locale: "en-US" })

function savedAttachments(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("opencode.7777.prompt.draft") ?? "{}").attachments ?? [])
}

for (const mode of ["native codecs", "fallback decoder", "no SubtleCrypto"] as const) {
  test(`inline attachments retain their bytes and IDs after reload with ${mode}`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "no SubtleCrypto") Object.defineProperty(crypto, "subtle", { value: undefined })
      if (mode === "fallback decoder") Object.defineProperty(Uint8Array, "fromBase64", { value: undefined })
    }, mode)
    const { errors } = await setupSession(page)
    const files = [
      { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
      { name: "note.txt", mimeType: 'text/plain;profile="a,b"', buffer: Buffer.from("Note 📝\n") },
      {
        name: "report.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(Array.from({ length: 65537 }, (_, i) => i % 256)),
      },
    ]
    await page.locator('input[type="file"]').setInputFiles(files)
    await expect.poll(async () => (await savedAttachments(page)).length).toBe(files.length)
    const saved = await savedAttachments(page)
    for (const [i, file] of files.entries()) {
      expect(saved[i]).toMatchObject({
        filename: file.name,
        mime: file.name.endsWith(".txt") ? "text/plain" : "application/pdf",
        blobID:
          mode === "no SubtleCrypto"
            ? expect.stringMatching(/^[a-f0-9]{32}$/)
            : createHash("sha256").update(file.buffer).digest("hex"),
        url: "data:" + file.mimeType + ";base64," + file.buffer.toString("base64"),
      })
    }
    await page.reload()
    for (const file of files) await expect(page.getByText(file.name, { exact: true })).toBeVisible()
    expect(await savedAttachments(page)).toEqual(saved)
    await page.locator('input[type="file"]').setInputFiles(files[2])
    await expect(page.getByText("This file has already been uploaded", { exact: true })).toBeVisible()
    expect(await savedAttachments(page)).toEqual(saved)
    expect(errors).toEqual([])
  })
}

test("saving an attachment only reads its source file once", async ({ page }) => {
  const { errors } = await setupSession(page)
  const reads = await page.evaluateHandle(() => {
    const reads: string[] = []
    const record = (blob: Blob, method: string) => {
      if (blob instanceof File && blob.name === "snapshot.txt") reads.push(method)
    }
    const arrayBuffer = Blob.prototype.arrayBuffer
    Blob.prototype.arrayBuffer = function () {
      record(this, "arrayBuffer")
      return arrayBuffer.call(this)
    }
    for (const method of ["readAsArrayBuffer", "readAsDataURL"] as const) {
      const read = FileReader.prototype[method]
      FileReader.prototype[method] = function (blob) {
        record(blob, method)
        return read.call(this, blob)
      }
    }
    return reads
  })
  await page.locator('input[type="file"]').setInputFiles({
    name: "snapshot.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Read once"),
  })
  await expect(page.getByText("snapshot.txt", { exact: true })).toBeVisible()
  expect(await reads.jsonValue()).toHaveLength(1)
  expect(errors).toEqual([])
})

test("cancelling a file during hashing preserves the draft and accepts the next file", async ({ page }) => {
  const { errors } = await setupSession(page)
  const hash = await page.evaluateHandle(() => {
    const entered = Promise.withResolvers<void>()
    const held = Promise.withResolvers<void>()
    const digest = crypto.subtle.digest.bind(crypto.subtle)
    crypto.subtle.digest = async (algorithm, data) => {
      const result = await digest(algorithm, data)
      entered.resolve()
      await held.promise
      return result
    }
    return { entered: entered.promise, release: held.resolve }
  })
  const input = page.locator('input[type="file"]')
  const editor = page.getByRole("textbox", { name: "Message", exact: true })
  await editor.fill("Keep this draft")
  await input.setInputFiles({ name: "cancel.txt", mimeType: "text/plain", buffer: Buffer.from("cancel") })
  await hash.evaluate((gate) => gate.entered)
  await page.getByRole("button", { name: "Cancel pending files" }).click()
  await hash.evaluate((gate) => gate.release())
  await input.setInputFiles({ name: "next.txt", mimeType: "text/plain", buffer: Buffer.from("next") })
  await expect(page.getByText("next.txt", { exact: true })).toBeVisible()
  expect(await savedAttachments(page)).toMatchObject([{ filename: "next.txt" }])
  await expect(editor).toHaveText("Keep this draft")
  expect(errors).toEqual([])
})
