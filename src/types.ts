import type {
  ModelInfo,
  OpenCodeEvent,
  PermissionRequest,
  ProviderInfo,
  QuestionAnswer,
  QuestionRequest,
  SessionInfo,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageShell,
  SessionMessageUser,
  SessionPromptInput,
  SessionStatus,
  SessionV1AssistantMessage,
  SessionV1FilePart,
  SessionV1Message,
  SessionV1Part,
  SessionV1ToolPart,
  SessionV1UserMessage,
} from "@opencode-ai/client"

export type {
  ModelInfo,
  PermissionRequest,
  ProviderInfo,
  QuestionAnswer,
  QuestionRequest,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageShell,
  SessionMessageUser,
  SessionPromptInput,
  SessionStatus,
}

export type Event = OpenCodeEvent
export type Session = SessionInfo
export type Message = SessionV1Message
export type UserMessage = SessionV1UserMessage
export type AssistantMessage = SessionV1AssistantMessage
export type Part = SessionV1Part
export type FilePart = SessionV1FilePart
export type ToolPart = SessionV1ToolPart
