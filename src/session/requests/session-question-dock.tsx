import type { FormAnswer, FormInfo } from "@opencode/client/promise"
import { QuestionPrompt } from "@opencode/session-ui/question-prompt"
import { createMemo } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"

export function SessionQuestionDock(props: {
  request: FormInfo
  responding: boolean
  onReply: (answer: FormAnswer) => void
  onReject: () => void
}) {
  const language = useLanguage()
  const questions = createMemo(() =>
    props.request.fields.flatMap((field) =>
      field.type === "string" || field.type === "multiselect"
        ? [
            {
              key: field.key,
              question: field.description ?? field.title ?? props.request.title,
              options: field.options ?? [],
              multiple: field.type === "multiselect",
            },
          ]
        : [],
    ),
  )

  return (
    <div data-component="session-question-dock">
      <QuestionPrompt
        questions={questions()}
        responding={props.responding}
        progress={(current, total) => language.t("session.question.progress", { current, total })}
        onReply={props.onReply}
        onReject={props.onReject}
      />
    </div>
  )
}
