# GitHub Subscribe Bot

English | [简体中文](README.zh-CN.md) | [日本語](README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

Subscribe to GitHub repository releases, automatically translate and categorize changelogs via AI, and push to Telegram channels/groups.

## Features

- Scheduled GitHub Release polling (with ETag caching to save API quota)
- AI-powered translation + categorization (Features, Bug Fixes, Performance, Refactoring, Documentation, Other)
- Multiple AI providers: OpenAI / Google Gemini / Anthropic Claude
- Configurable target language for translation (default: English)
- Auto-split Telegram messages (when exceeding 4096 characters)
- Auto-retry on send failure (up to 3 times)
- One-click Docker deployment

## Quick Start

### Prerequisites

1. **GitHub Token** (Optional) — [Create a Personal Access Token](https://github.com/settings/tokens) for higher API rate limits. Recommended if you subscribe to many repos or use frequent polling
2. **Telegram Bot** — Create via [@BotFather](https://t.me/BotFather) to get the Bot Token
3. **Telegram Chat ID** — Channel username (e.g. `@my_channel`) or group/user numeric ID
4. **AI API Key** — From any supported AI provider

### Docker Compose (Recommended)

```bash
git clone https://github.com/nicepkg/github-subscribe-bot.git
cd github-subscribe-bot

cp .env.example .env
# Edit .env with your configuration (see below)

cp subscribe.example.json subscribe.json
# Edit subscribe.json with repos to subscribe (see below)

docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Configuration

All settings are configured via environment variables in the `.env` file:

| Variable             | Required | Default              | Description                                   |
| -------------------- | -------- | -------------------- | --------------------------------------------- |
| `GITHUB_TOKEN`       | ❌       | —                    | GitHub Personal Access Token (optional, recommended for high-frequency polling) |
| `TELEGRAM_BOT_TOKEN` | ✅       | —                    | Telegram Bot Token                            |
| `TELEGRAM_CHAT_ID`   | ✅       | —                    | Target channel/group/user ID                  |
| `AI_PROVIDER`        | ❌       | `openai-completions` | AI provider (see below)                       |
| `AI_BASE_URL`        | ❌       | SDK default          | Custom API URL (proxy/self-hosted)            |
| `AI_API_KEY`         | ✅       | —                    | AI service API Key                            |
| `AI_MODEL`           | ✅       | —                    | Model name                                    |
| `TIMEZONE`           | ❌       | `Asia/Shanghai`      | IANA timezone for cron and message formatting |
| `CRON`               | ✅       | —                    | Cron expression (6 fields, with seconds)      |
| `TARGET_LANG`        | ❌       | `English`            | Target language for AI translation            |

> `TARGET_LANG` controls both AI translation output and category labels (e.g. ✨ Features). Built-in label translations are available for `English`, `Chinese`, and `Japanese`. Other languages will use English labels with AI-translated content.
>
> If `TIMEZONE` is not set, the program falls back to `TZ`; if neither is set, defaults to `Asia/Shanghai`.
> `TIMEZONE` must be a valid IANA timezone (e.g. `Asia/Shanghai`, `UTC`). Formats like `UTC+8` are invalid and will cause a startup error.

### AI Providers

Supported `AI_PROVIDER` values:

| Value                | Description                                                           | AI_MODEL Example           |
| -------------------- | --------------------------------------------------------------------- | -------------------------- |
| `openai-completions` | OpenAI Chat Completions (default), compatible with all OpenAI proxies | `gpt-4o-mini`              |
| `openai-responses`   | OpenAI Responses API                                                  | `gpt-4o-mini`              |
| `google`             | Google Gemini                                                         | `gemini-2.0-flash`         |
| `anthropic`          | Anthropic Claude                                                      | `claude-sonnet-4-20250514` |

**Using a third-party proxy**: Set `AI_PROVIDER=openai-completions` and point `AI_BASE_URL` to your proxy.

`.env` example:

```env
# GITHUB_TOKEN=ghp_xxxxxxxxxxxx  # Optional, recommended for many repos
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=@my_channel
AI_PROVIDER=openai-completions
AI_API_KEY=sk-xxxxxxxxxxxx
AI_MODEL=gpt-4o-mini
TIMEZONE=Asia/Shanghai
CRON=0 */10 9-23 * * *
TARGET_LANG=English
```

### Scheduling (Cron)

The program uses `CRON` for scheduling (via the `cron` package):

```env
TIMEZONE=Asia/Shanghai
CRON=0 */10 9-23 * * *
```

This means: every day 09:00–23:59, check every 10 minutes (no notifications at night).

Examples:

- Weekdays daytime every 10 min: `0 */10 9-23 * * 1-5`
- Daily at 08:30: `0 30 8 * * *`

> `CRON` uses 6-field format (second minute hour day month weekday), e.g. `0 */10 9-23 * * *`.

## Subscription

Create your subscription config from the example:

```bash
cp subscribe.example.json subscribe.json
```

Edit `subscribe.json` with GitHub repos to subscribe (`owner/repo` format):

```json
{
  "repos": ["vuejs/core", "nodejs/node", "microsoft/vscode"]
}
```

> `subscribe.json` is gitignored and won't be tracked. Modify freely.

Restart the container after changes:

```bash
docker compose restart
```

## Message Format

Example Telegram message from the bot:

```
vuejs/core

2025-02-19 14:30:00  v3.5.0

✨ Features
• Added useTemplateRef API
• Support for deferred Teleport

🐛 Bug Fixes
• Fixed reactive array watch callback trigger issue

⚡ Performance
• Improved virtual DOM diff performance
```

AI automatically translates English release notes into the configured target language and groups them by category.

## Local Development

```bash
npm install
cp .env.example .env
cp subscribe.example.json subscribe.json
# Edit .env with your tokens

npm run dev    # Dev mode (auto-restart on file changes)
npm start      # Run directly
npm run build  # Compile TypeScript
```

## Project Structure

```
├── src/
│   ├── index.ts       # Entry point, scheduler
│   ├── config.ts      # Environment config loader
│   ├── types.ts       # Type definitions
│   ├── github.ts      # GitHub API client & state management
│   ├── ai.ts          # AI translation & categorization
│   ├── formatter.ts   # Telegram message formatting
│   ├── telegram.ts    # Telegram message sender (with retry)
│   └── logger.ts      # Logger utility
├── subscribe.example.json
├── data/              # Runtime state (auto-generated)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[MIT](LICENSE)
