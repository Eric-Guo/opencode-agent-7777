import { createEffect, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { storageGet, storageSet } from "../runtime/persistence/storage"
import type { ChatController } from "./controller"

const pages: Record<string, string> = {
  workspaces: "Workspaces",
  bots: "Bots",
  presets: "Presets",
  schedules: "Schedules",
  plugins: "Plugins",
  integrations: "Integrations",
  terminals: "Terminals",
  providers: "Providers",
  updates: "Updates",
  settings: "Settings",
}

type Address = { workspace?: string; conversation?: string; page?: string; item?: string }

function readAddress(): Address {
  const match = /^#\/workspaces\/([^/]+)(?:\/conversations\/([^/]+)|\/panels\/([^/]+)(?:\/([^/]+))?)?$/.exec(
    location.hash,
  )

  if (!match) return {}

  try {
    const workspace = decodeURIComponent(match[1])

    return {
      workspace,
      ...(match[2] ? { conversation: decodeURIComponent(match[2]) } : {}),
      ...(match[3] ? { page: pages[decodeURIComponent(match[3])] ?? decodeURIComponent(match[3]) } : {}),
      ...(match[4] ? { item: decodeURIComponent(match[4]) } : {}),
    }
  } catch {
    return {}
  }
}

/** Fragments preserve the embedding host's path, query and relative bundle assets. */
export function createNavigation(chat: ChatController) {
  const [s, set] = createStore({ page: "", item: "", applying: true })
  const owner = { revision: 0 }
  onCleanup(() => owner.revision++)

  const workspace = () => {
    const scope = chat.s.connection?.scope

    return scope?.startsWith("[") ? (JSON.parse(scope) as string[])[2] : undefined
  }

  const apply = async () => {
    const revision = ++owner.revision
    const address = readAddress()
    set("applying", true)
    const target = address.workspace ?? storageGet("7777.nexus.workspace") ?? undefined

    if (!chat.s.connection || target !== workspace())
      await chat.connect(
        target,
        address.page ? undefined : address.workspace ? (address.conversation ?? "") : undefined,
      )
    else if (!address.page && chat.s.id !== (address.conversation ?? "")) chat.select(address.conversation ?? "")

    if (revision === owner.revision) set({ page: address.page ?? "", item: address.item ?? "", applying: false })
  }

  onMount(() => {
    void apply()
    const hide = () => chat.close()

    const show = (event: PageTransitionEvent) => {
      if (event.persisted) void reconnect()
    }

    window.addEventListener("popstate", apply)
    window.addEventListener("pagehide", hide)
    window.addEventListener("pageshow", show)
    onCleanup(() => {
      window.removeEventListener("popstate", apply)
      window.removeEventListener("pagehide", hide)
      window.removeEventListener("pageshow", show)
    })
  })
  createEffect(() => {
    const id = workspace()
    const conversation = chat.s.id
    const page = s.page
    const item = s.item

    if (!id || s.applying || chat.s.connecting) return
    storageSet("7777.nexus.workspace", id)
    const panel = Object.entries(pages).find(([, label]) => label === page)?.[0] ?? page

    const hash =
      "/workspaces/" +
      encodeURIComponent(id) +
      (panel
        ? "/panels/" + encodeURIComponent(panel) + (item ? "/" + encodeURIComponent(item) : "")
        : conversation
          ? "/conversations/" + encodeURIComponent(conversation)
          : "")

    if (location.hash === "#" + hash) return
    const url = new URL(location.href)
    url.hash = hash

    if (!location.hash) history.replaceState(null, "", url)
    else history.pushState(null, "", url)
  })

  async function reconnect() {
    const revision = ++owner.revision
    set("applying", true)
    await chat.connect(workspace() ?? readAddress().workspace, chat.s.id || readAddress().conversation)

    if (revision === owner.revision) set("applying", false)
  }

  return {
    page: () => s.page,
    item: () => s.item,
    openPage: (page: string, item = "") => set({ page, item }),
    reconnect,
    async open(workspace: string, conversation = "") {
      const revision = ++owner.revision
      set({ applying: true, page: "", item: "" })
      await chat.connect(workspace, conversation)

      if (revision === owner.revision) set("applying", false)
    },
  }
}

export type Navigation = ReturnType<typeof createNavigation>
