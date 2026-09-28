export type SessionTabs = {
  active?: string
  all: string[]
}

export type SessionTabState = {
  tabs: SessionTabs
  preview?: string
}

// Keep the main app's preview/open/close boundary, scoped to local file paths.
// An undefined active tab shows the conversation without closing files.
export function previewSessionTab(current: SessionTabState, tab: string): SessionTabState {
  const previewIndex = current.preview ? current.tabs.all.indexOf(current.preview) : -1
  if (current.tabs.all.includes(tab)) {
    return {
      tabs: {
        all: current.tabs.all.filter((item) => item !== current.preview || item === tab),
        active: tab,
      },
      preview: current.preview === tab ? tab : undefined,
    }
  }
  return {
    tabs: {
      all:
        previewIndex < 0
          ? [...current.tabs.all, tab]
          : current.tabs.all.map((item, index) => (index === previewIndex ? tab : item)),
      active: tab,
    },
    preview: tab,
  }
}

export function openSessionTab(current: SessionTabState, tab: string): SessionTabState {
  return { tabs: previewSessionTab(current, tab).tabs, preview: undefined }
}

export function closeSessionTab(current: SessionTabState, tab: string): SessionTabState {
  const all = current.tabs.all.filter((item) => item !== tab)
  const index = current.tabs.all.indexOf(tab)
  return {
    tabs: {
      all,
      active:
        current.tabs.active === tab
          ? (current.tabs.all[index - 1] ?? current.tabs.all[index + 1])
          : current.tabs.active,
    },
    preview: current.preview === tab ? undefined : current.preview,
  }
}

export function moveSessionTab(current: SessionTabState, tab: string, to: number): SessionTabState {
  const from = current.tabs.all.indexOf(tab)
  if (from < 0 || !Number.isInteger(to) || to < 0 || to >= current.tabs.all.length || from === to) return current
  const all = [...current.tabs.all]
  all.splice(to, 0, all.splice(from, 1)[0])
  return { tabs: { all, active: current.tabs.active }, preview: current.preview }
}
