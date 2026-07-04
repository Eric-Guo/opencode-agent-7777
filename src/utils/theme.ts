import { syncPlatformBackgroundColor } from "@/context/platform"

export function syncWindowBackgroundColor() {
  if (typeof document === "undefined") return

  const background = getComputedStyle(document.body).backgroundColor
  if (!background || background === "transparent") return
  syncPlatformBackgroundColor(background)
}
