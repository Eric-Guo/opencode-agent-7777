import "@/index.css"

import { File } from "@opencode-ai/session-ui/file"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { ThemeProvider } from "@opencode-ai/ui/theme/context"
import { type ParentProps } from "solid-js"
import { syncPlatformBackgroundColor } from "@/context/platform"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import Session from "@/pages/session"

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

export function AppBaseProviders(props: ParentProps<{ locale?: Locale }>) {
  return (
    <ThemeProvider
      onThemeApplied={() => {
        if (typeof document === "undefined") return
        const background = getComputedStyle(document.body).backgroundColor
        if (!background || background === "transparent") return
        syncPlatformBackgroundColor(background)
      }}
    >
      <LanguageProvider locale={props.locale}>
        <UiI18nBridge>
          <DialogProvider>
            <MarkedProvider>
              <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
            </MarkedProvider>
          </DialogProvider>
        </UiI18nBridge>
      </LanguageProvider>
    </ThemeProvider>
  )
}

function ConnectionGate(props: ParentProps) {
  return <>{props.children}</>
}

export function AppInterface() {
  return (
    <ConnectionGate>
      <Session />
    </ConnectionGate>
  )
}

export function App(props: { locale?: Locale }) {
  return (
    <AppBaseProviders locale={props.locale}>
      <AppInterface />
    </AppBaseProviders>
  )
}
