import type { OpenCodeClient, SessionExportOutput } from "@opencode/client/promise"

export type SessionExportData = SessionExportOutput

export function fetchSessionExport(input: {
  sessionID: string
  api: { session: Pick<OpenCodeClient["session"], "export"> }
}) {
  // The public transfer API owns the complete transcript, independent of the visible dialog window.
  return input.api.session.export({ sessionID: input.sessionID })
}

export function sessionExportFilename(session: { id: string; title?: string; slug?: string }) {
  const name = session.title || session.slug || session.id
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
  return `${clean || session.id}.json`
}

export function downloadSessionExport(filename: string, data: SessionExportData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    URL.revokeObjectURL(url)
  }
}
