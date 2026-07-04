import "@/index.css"

import { File } from "@opencode-ai/session-ui/file"
import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { FileComponentProvider } from "@opencode-ai/ui/context/file"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { onMount, type ParentProps } from "solid-js"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import Session from "@/pages/session"
import { syncWindowBackgroundColor } from "@/utils/theme"

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

function ThemeSideEffects() {
  onMount(syncWindowBackgroundColor)
  return null
}

export function AppBaseProviders(props: ParentProps<{ locale?: Locale }>) {
  return (
    <>
      <ThemeSideEffects />
      <LanguageProvider locale={props.locale}>
        <UiI18nBridge>
          <DialogProvider>
            <MarkedProvider>
              <FileComponentProvider component={File}>{props.children}</FileComponentProvider>
            </MarkedProvider>
          </DialogProvider>
        </UiI18nBridge>
      </LanguageProvider>
    </>
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
