# Contributing

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/nicepkg/github-subscribe-bot.git
cd github-subscribe-bot
npm install
cp .env.example .env
cp subscribe.example.json subscribe.json
# Edit .env with your tokens
npm run dev
```

## Project Structure

```
src/
├── index.ts       # Entry point, scheduler
├── config.ts      # Environment config loader
├── github.ts      # GitHub API client
├── ai.ts          # AI translation & categorization
├── formatter.ts   # Telegram message formatting
├── telegram.ts    # Telegram bot client
├── logger.ts      # Logger utility
└── types.ts       # Type definitions
```

## Guidelines

- Run `npm run build` before submitting a PR
- Follow [Conventional Commits](https://www.conventionalcommits.org/): `type: Description`
- Comments in English, only for non-obvious logic
- Do not add new dependencies without discussion

## Reporting Issues

Use [GitHub Issues](https://github.com/nicepkg/github-subscribe-bot/issues) with the provided templates.
