export function decode64(value: string | undefined) {
  if (value === undefined) return
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"))
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
  } catch {
    return
  }
}
