import type { JSX } from "solid-js"
import "./settings.css"

export interface SettingsRowProps {
  title: JSX.Element
  description: JSX.Element
  children: JSX.Element
}

export function SettingsRow(props: SettingsRowProps) {
  return (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{props.title}</div>
        <div data-slot="settings-row-description">{props.description}</div>
      </div>
      <div data-slot="settings-row-control">{props.children}</div>
    </div>
  )
}
