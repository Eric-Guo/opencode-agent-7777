// The embedded app uses synchronous browser storage, without routed namespaces or a platform provider.
// Resolve storage on each operation so importing a consumer does not require a browser environment.
export function storageGet(key: string) {
  try {
    if (typeof localStorage !== "object") return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string) {
  try {
    if (typeof localStorage !== "object") return
    localStorage.setItem(key, value)
  } catch {
    // Preferences and drafts remain usable in memory when storage is unavailable or full.
  }
}

export function storageRemove(key: string) {
  try {
    if (typeof localStorage !== "object") return
    localStorage.removeItem(key)
  } catch {
    // A failed removal must not interrupt the local state transition.
  }
}
