# GitHub Subscribe Bot

[English](README.md) | 简体中文 | [日本語](README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

订阅 GitHub 仓库的 Release，通过 AI 自动将更新日志翻译并分类，推送到 Telegram 频道/群组。

## 功能特性

- 定时轮询 GitHub Release（支持 ETag 缓存，节省 API 配额）
- AI 自动翻译 + 分类（新功能、修复、优化、重构、文档、其他）
- 支持多种 AI 提供商：OpenAI / Google Gemini / Anthropic Claude
- 翻译目标语言可配置（默认英文）
- Telegram 消息自动分割（超过 4096 字符时拆分发送）
- 发送失败自动重试（最多 3 次）
- Docker 一键部署

## 快速开始

### 前置准备

1. **GitHub Token** — [创建 Personal Access Token](https://github.com/settings/tokens)，无需额外权限（公开仓库）
2. **Telegram Bot** — 通过 [@BotFather](https://t.me/BotFather) 创建 Bot，获取 Token
3. **Telegram Chat ID** — 频道用户名（如 `@my_channel`）或群组/个人数字 ID
4. **AI API Key** — 任选一个 AI 提供商的 API Key

### Docker Compose 部署（推荐）

```bash
git clone https://github.com/nicepkg/github-subscribe-bot.git
cd github-subscribe-bot

cp .env.example .env
# 编辑 .env 填入你的配置（见下方配置说明）

cp subscribe.example.json subscribe.json
# 编辑 subscribe.json 添加你要订阅的仓库（见下方订阅配置）

docker compose up -d --build

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

## 配置说明

所有配置通过环境变量设置，在 `.env` 文件中填写：

| 变量                 | 必填 | 默认值               | 说明                                             |
| -------------------- | ---- | -------------------- | ------------------------------------------------ |
| `GITHUB_TOKEN`       | ✅   | —                    | GitHub Personal Access Token                     |
| `TELEGRAM_BOT_TOKEN` | ✅   | —                    | Telegram Bot Token                               |
| `TELEGRAM_CHAT_ID`   | ✅   | —                    | 目标频道/群组/用户 ID                            |
| `AI_PROVIDER`        | ❌   | `openai-completions` | AI 提供商（见下方）                              |
| `AI_BASE_URL`        | ❌   | 各 SDK 默认值        | 自定义 API 地址（代理/自部署）                   |
| `AI_API_KEY`         | ✅   | —                    | AI 服务 API Key                                  |
| `AI_MODEL`           | ✅   | —                    | 模型名称                                         |
| `TIMEZONE`           | ❌   | `Asia/Shanghai`      | 全局时区（IANA），用于 cron 调度和消息时间格式化 |
| `CRON`               | ✅   | —                    | Cron 表达式（6 字段，含秒）                      |
| `TARGET_LANG`        | ❌   | `English`            | AI 翻译目标语言                                  |

> `TARGET_LANG` 同时控制 AI 翻译输出和分类标签（如 ✨ 新功能）。内置标签翻译支持`English`、`Chinese`和`Japanese`，其他语言将使用英文标签配合 AI 翻译内容。
>
> 若未设置 `TIMEZONE`，程序会回退读取 `TZ`；两者都未设置时默认 `Asia/Shanghai`。
> `TIMEZONE` 必须是 IANA 时区（例如 `Asia/Shanghai`、`UTC`），`UTC+8` 这类写法会在启动时报错。

### AI 提供商配置

`AI_PROVIDER` 支持以下值：

| 值                   | 说明                                                  | AI_MODEL 示例              |
| -------------------- | ----------------------------------------------------- | -------------------------- |
| `openai-completions` | OpenAI Chat Completions（默认），兼容所有 OpenAI 代理 | `gpt-4o-mini`              |
| `openai-responses`   | OpenAI Responses API                                  | `gpt-4o-mini`              |
| `google`             | Google Gemini                                         | `gemini-2.0-flash`         |
| `anthropic`          | Anthropic Claude                                      | `claude-sonnet-4-20250514` |

**使用第三方代理**：设置 `AI_PROVIDER=openai-completions`，将 `AI_BASE_URL` 指向代理地址即可。

`.env` 配置示例：

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=@my_channel
AI_PROVIDER=openai-completions
AI_API_KEY=sk-xxxxxxxxxxxx
AI_MODEL=gpt-4o-mini
TIMEZONE=Asia/Shanghai
CRON=0 */10 9-23 * * *
TARGET_LANG=Chinese
```

### 定时调度（Cron）

程序使用 `CRON` 调度（基于 `cron` 包）：

```env
TIMEZONE=Asia/Shanghai
CRON=0 */10 9-23 * * *
```

含义：每天 09:00-23:59，每 10 分钟检查一次（夜间不通知）。

常用示例：

- 工作日白天每 10 分钟：`0 */10 9-23 * * 1-5`
- 每天 08:30：`0 30 8 * * *`

> `CRON` 使用 6 字段格式（秒 分 时 日 月 周），例如 `0 */10 9-23 * * *`。

## 订阅仓库

从示例文件创建订阅配置：

```bash
cp subscribe.example.json subscribe.json
```

编辑 `subscribe.json`，添加要订阅的 GitHub 仓库（`owner/repo` 格式）：

```json
{
  "repos": ["vuejs/core", "nodejs/node", "microsoft/vscode"]
}
```

> `subscribe.json` 已被 `.gitignore` 忽略，不会被 Git 跟踪，可随时修改。

修改后重启容器生效：

```bash
docker compose restart
```

## 消息格式

Bot 推送的 Telegram 消息示例：

```
vuejs/core

2025-02-19 14:30:00  v3.5.0

✨ 新功能
• 新增 useTemplateRef API
• 支持延迟 Teleport

🐛 修复
• 修复响应式数组 watch 回调触发异常

⚡ 优化
• 提升虚拟 DOM diff 性能
```

AI 会将英文 Release Notes 自动翻译为配置的目标语言，并按类别分组。

## 本地开发

```bash
npm install
cp .env.example .env
cp subscribe.example.json subscribe.json
# 编辑 .env 填入你的配置

npm run dev    # 开发模式（文件变更自动重启）
npm start      # 直接运行
npm run build  # 编译 TypeScript
```

## 项目结构

```
├── src/
│   ├── index.ts       # 入口，主循环与调度
│   ├── config.ts      # 环境变量加载与校验
│   ├── types.ts       # 类型定义
│   ├── github.ts      # GitHub API 交互与状态管理
│   ├── ai.ts          # AI 翻译与分类
│   ├── formatter.ts   # Telegram 消息格式化
│   ├── telegram.ts    # Telegram 消息发送（含重试）
│   └── logger.ts      # 日志工具
├── subscribe.example.json
├── data/              # 运行时状态（自动生成）
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 贡献指南

请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
