import { dict as en } from "./en"

type Keys = keyof typeof en

export const dict = {
  "language.en": "English",
  "language.zh": "中文",
  "language.switch": "切换语言为 {{language}}",

  "session.status.starting": "启动中",
  "session.status.offline": "离线",
  "session.status.sending": "发送中",
  "session.status.working": "处理中",
  "session.status.retry": "重试 {{attempt}}",
  "session.status.ready": "就绪",
  "session.loading": "正在启动 7777",
  "session.empty": "就绪",

  "prompt.placeholder": "询问 7777",
  "prompt.message.aria": "消息",
  "prompt.addContext": "添加上下文",
  "prompt.send": "发送",
  "prompt.stop": "停止",
  "prompt.unsupportedFiles": "部分所选文件不受支持。",
  "prompt.removeAttachment": "移除 {{filename}}",

  "model.aria": "模型",
  "model.loading": "正在加载模型",
  "model.default": "服务器默认",

  "permission.required": "需要权限",
  "permission.description.externalDirectory": "访问项目目录外的文件",
  "permission.description.grep": "使用正则表达式搜索文件内容",
  "permission.description.glob": "使用 glob 模式匹配文件",
  "permission.description.list": "列出目录中的文件",
  "permission.description.read": "读取匹配所请求路径的文件",
  "permission.description.bash": "运行 shell 命令",
  "permission.description.default": "智能体需要权限才能继续",
  "permission.action.deny": "拒绝",
  "permission.action.allowAlways": "始终允许",
  "permission.action.allowOnce": "允许一次",

  "timeline.role.user": "你",
  "timeline.copy": "复制消息",
  "timeline.copied": "已复制",
  "timeline.reasoningSummary": "推理摘要",
  "timeline.reasoningSummaryIndexed": "推理摘要 {{index}}",
  "timeline.tool.done": "完成",
  "timeline.tool.running": "运行中",
  "timeline.tool.pending": "等待中",

  "error.sessionNotReady": "会话尚未就绪",
  "error.requestFailed": "请求失败",
  "error.modelListEmpty": "模型列表响应为空",
  "error.loadServerPathFailed": "加载服务器路径失败",
  "error.createSessionFailed": "创建 7777 会话失败",
  "error.permissionsLoadFailed": "加载权限失败：{{status}}",
  "error.permissionsReplyFailed": "响应权限失败：{{status}}",
} satisfies Partial<Record<Keys, string>>
