// Keep the main app's parsing boundary; 7777 exposes server commands only.
export function parseSlashCommand(text: string) {
  if (!text.startsWith("/")) return
  const separator = text.search(/\s/)
  const name = text.slice(1, separator === -1 ? undefined : separator)
  return { name, input: separator === -1 ? "" : text.slice(separator).trim() }
}
