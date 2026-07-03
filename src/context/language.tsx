import { createSimpleContext } from "@opencode-ai/ui/context"
import { dict as uiEn } from "@opencode-ai/ui/i18n/en"
import { dict as uiZh } from "@opencode-ai/ui/i18n/zh"
import { createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { dict as en } from "@/i18n/en"
import { dict as zh } from "@/i18n/zh"

export type Locale = "en" | "zh"

type RawDictionary = typeof en & typeof uiEn
export type Dictionary = RawDictionary
export type TranslationKey = keyof Dictionary
export type TranslationParams = Record<string, string | number | boolean>

const STORAGE_KEY = "opencode.7777.language"
const LOCALES: readonly Locale[] = ["en", "zh"]
const INTL: Record<Locale, string> = {
  en: "en",
  zh: "zh-CN",
}
const LABEL_KEY: Record<Locale, TranslationKey> = {
  en: "language.en",
  zh: "language.zh",
}

function cookie(locale: Locale) {
  return `oc_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

const base = { ...en, ...uiEn } as Dictionary
const dictionaries: Record<Locale, Dictionary> = {
  en: base,
  zh: { ...base, ...zh, ...uiZh } as Dictionary,
}

function resolveTemplate(text: string, params?: TranslationParams) {
  if (!params) return text
  return text.replace(/{{\s*([^}]+?)\s*}}/g, (_, rawKey) => {
    const key = String(rawKey)
    const value = params[key]
    return value === undefined ? "" : String(value)
  })
}

function template(dict: Dictionary, key: TranslationKey, params?: TranslationParams) {
  const value = dict[key] ?? base[key] ?? String(key)
  return resolveTemplate(value, params)
}

export function normalizeLocale(value: string | undefined | null): Locale {
  if (!value) return "en"
  const normalized = value.toLowerCase()
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans" || normalized.startsWith("zh-")) {
    return "zh"
  }
  return "en"
}

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    if (!language) continue
    const normalized = language.toLowerCase()
    if (normalized.startsWith("zh")) return "zh"
    if (normalized.startsWith("en")) return "en"
  }

  return "en"
}

function readStoredLocale() {
  if (typeof localStorage !== "object") return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    if (!raw.startsWith("{")) return normalizeLocale(raw)
    const parsed = JSON.parse(raw) as { locale?: string }
    return normalizeLocale(parsed.locale)
  } catch {
    return
  }
}

function writeStoredLocale(locale: Locale) {
  if (typeof localStorage !== "object") return
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    return
  }
}

function currentLocale() {
  return readStoredLocale() ?? detectLocale()
}

export function loadLocaleDict(_locale: Locale) {
  return Promise.resolve()
}

export function translateSync(key: TranslationKey, params?: TranslationParams) {
  return template(dictionaries[currentLocale()], key, params)
}

export const { use: useLanguage, provider: LanguageProvider } = createSimpleContext({
  name: "Language",
  gate: false,
  init: (props: { locale?: Locale }) => {
    const [store, setStore] = createStore({
      locale: props.locale ?? currentLocale(),
    })

    const locale = createMemo<Locale>(() => normalizeLocale(store.locale))
    const intl = createMemo(() => INTL[locale()])
    const dict = createMemo(() => dictionaries[locale()])
    const t = ((key: TranslationKey, params?: TranslationParams) => template(dict(), key, params)) as (
      key: TranslationKey,
      params?: TranslationParams,
    ) => string

    createEffect(() => {
      const next = locale()
      writeStoredLocale(next)
      if (typeof document !== "object") return
      document.documentElement.lang = INTL[next]
      document.cookie = cookie(next)
    })

    return {
      locale,
      intl,
      locales: LOCALES,
      label(value: Locale) {
        return t(LABEL_KEY[value])
      },
      t,
      setLocale(next: Locale) {
        setStore("locale", normalizeLocale(next))
      },
    }
  },
})
