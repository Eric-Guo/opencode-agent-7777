import "@/index.css"

import { I18nProvider } from "@opencode-ai/ui/context"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import type { ParentProps } from "solid-js"
import { LanguageProvider, type Locale, useLanguage } from "@/context/language"
import Session from "@/pages/session"

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.intl, t: language.t }}>{props.children}</I18nProvider>
}

export function App(props: { locale?: Locale }) {
  return (
    <LanguageProvider locale={props.locale}>
      <UiI18nBridge>
        <DialogProvider>
          <Session />
        </DialogProvider>
      </UiI18nBridge>
    </LanguageProvider>
  )
}
