import { untrack } from "solid-js"
import { createStore, type SetStoreFunction, type Store } from "solid-js/store"

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
// The compact persisted-store boundary is synchronous. Each consumer keeps its existing codec and keys.
export function persisted<T extends object>(input: {
  read: () => T
  write: (value: T) => void
}): [Store<T>, SetStoreFunction<T>] {
  const [store, setStore] = createStore(untrack(input.read))
  // Forward Solid's overloaded setter unchanged, then save the resulting store without tracking its fields.
  const apply = setStore as (...values: unknown[]) => void
  const set = ((...values: unknown[]) => {
    apply(...values)
    untrack(() => input.write(store))
  }) as SetStoreFunction<T>
  return [store, set]
}
