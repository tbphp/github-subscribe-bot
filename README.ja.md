# GitHub Subscribe Bot

[English](README.md) | [简体中文](README.zh-CN.md) | 日本語

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

GitHub リポジトリの Release を購読し、AI で自動的に変更履歴を翻訳・分類して Telegram チャンネル/グループに配信します。

## 機能

- GitHub Release の定期ポーリング（ETag キャッシュで API クォータを節約）
- AI による自動翻訳 + 分類（新機能、修正、最適化、リファクタリング、ドキュメント、その他）
- 複数の AI プロバイダー対応：OpenAI / Google Gemini / Anthropic Claude
- 翻訳先言語を設定可能（デフォルト：英語）
- Telegram メッセージの自動分割（4096 文字超過時）
- 送信失敗時の自動リトライ（最大 3 回）
- Docker でワンクリックデプロイ

## クイックスタート

### 前提条件

1. **GitHub Token** — [Personal Access Token を作成](https://github.com/settings/tokens)（公開リポジトリには追加権限不要）
2. **Telegram Bot** — [@BotFather](https://t.me/BotFather) で Bot を作成し Token を取得
3. **Telegram Chat ID** — チャンネルユーザー名（例：`@my_channel`）またはグループ/ユーザーの数値 ID
4. **AI API Key** — 対応する AI プロバイダーの API Key

### Docker Compose（推奨）

```bash
git clone https://github.com/nicepkg/github-subscribe-bot.git
cd github-subscribe-bot

cp .env.example .env
# .env を編集して設定を入力（下記参照）

cp subscribe.example.json subscribe.json
# subscribe.json を編集して購読するリポジトリを追加（下記参照）

docker compose up -d --build

# ログを確認
docker compose logs -f

# 停止
docker compose down
```

## 設定

すべての設定は `.env` ファイルの環境変数で行います：

| 変数 | 必須 | デフォルト | 説明 |
|------|------|-----------|------|
| `GITHUB_TOKEN` | ✅ | — | GitHub Personal Access Token |
| `TELEGRAM_BOT_TOKEN` | ✅ | — | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | ✅ | — | 配信先チャンネル/グループ/ユーザー ID |
| `AI_PROVIDER` | ❌ | `openai-completions` | AI プロバイダー（下記参照） |
| `AI_BASE_URL` | ❌ | SDK デフォルト | カスタム API URL（プロキシ/セルフホスト） |
| `AI_API_KEY` | ✅ | — | AI サービス API Key |
| `AI_MODEL` | ✅ | — | モデル名 |
| `TIMEZONE` | ❌ | `Asia/Shanghai` | IANA タイムゾーン（cron とメッセージ時刻に使用） |
| `CRON` | ✅ | — | Cron 式（6 フィールド、秒を含む） |
| `TARGET_LANG` | ❌ | `English` | AI 翻訳の対象言語 |

> `TARGET_LANG` は AI 翻訳出力とカテゴリラベル（例：✨ 新機能）の両方を制御します。`English`、`Chinese`、`Japanese`のラベル翻訳が組み込まれています。その他の言語では英語ラベルと AI 翻訳コンテンツが使用されます。
>
> `TIMEZONE` 未設定の場合は `TZ` にフォールバックし、両方未設定の場合は `Asia/Shanghai` がデフォルトになります。
> `TIMEZONE` は有効な IANA タイムゾーン（例：`Asia/Shanghai`、`UTC`）である必要があります。`UTC+8` のような形式は無効で、起動時にエラーになります。

### AI プロバイダー

`AI_PROVIDER` の対応値：

| 値 | 説明 | AI_MODEL 例 |
|----|------|-------------|
| `openai-completions` | OpenAI Chat Completions（デフォルト）、すべての OpenAI プロキシと互換 | `gpt-4o-mini` |
| `openai-responses` | OpenAI Responses API | `gpt-4o-mini` |
| `google` | Google Gemini | `gemini-2.0-flash` |
| `anthropic` | Anthropic Claude | `claude-sonnet-4-20250514` |

**サードパーティプロキシの使用**：`AI_PROVIDER=openai-completions` に設定し、`AI_BASE_URL` をプロキシに向けてください。

`.env` の例：

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=@my_channel
AI_PROVIDER=openai-completions
AI_API_KEY=sk-xxxxxxxxxxxx
AI_MODEL=gpt-4o-mini
TIMEZONE=Asia/Shanghai
CRON=0 */10 9-23 * * *
TARGET_LANG=Japanese
```

### スケジューリング（Cron）

`CRON` でスケジュールを設定します（`cron` パッケージ使用）：

```env
TIMEZONE=Asia/Shanghai
CRON=0 */10 9-23 * * *
```

意味：毎日 09:00〜23:59、10 分ごとにチェック（夜間は通知なし）。

例：
- 平日の日中 10 分ごと：`0 */10 9-23 * * 1-5`
- 毎日 08:30：`0 30 8 * * *`

> `CRON` は 6 フィールド形式（秒 分 時 日 月 曜日）を使用します。例：`0 */10 9-23 * * *`

## 購読設定

サンプルファイルから購読設定を作成：

```bash
cp subscribe.example.json subscribe.json
```

`subscribe.json` を編集し、購読する GitHub リポジトリを追加（`owner/repo` 形式）：

```json
{
  "repos": [
    "vuejs/core",
    "nodejs/node",
    "microsoft/vscode"
  ]
}
```

> `subscribe.json` は `.gitignore` に含まれており、Git で追跡されません。自由に変更できます。

変更後にコンテナを再起動：

```bash
docker compose restart
```

## メッセージ形式

Bot が配信する Telegram メッセージの例：

```
vuejs/core

2025-02-19 14:30:00  v3.5.0

✨ 新機能
• useTemplateRef API を追加
• 遅延 Teleport をサポート

🐛 修正
• リアクティブ配列の watch コールバック発火の問題を修正

⚡ 最適化
• 仮想 DOM diff のパフォーマンスを改善
```

AI が英語の Release Notes を設定された対象言語に自動翻訳し、カテゴリ別にグループ化します。

## ローカル開発

```bash
npm install
cp .env.example .env
cp subscribe.example.json subscribe.json
# .env にトークンを設定

npm run dev    # 開発モード（ファイル変更時に自動再起動）
npm start      # 直接実行
npm run build  # TypeScript コンパイル
```

## プロジェクト構成

```
├── src/
│   ├── index.ts       # エントリーポイント、スケジューラー
│   ├── config.ts      # 環境変数の読み込み
│   ├── types.ts       # 型定義
│   ├── github.ts      # GitHub API クライアントと状態管理
│   ├── ai.ts          # AI 翻訳と分類
│   ├── formatter.ts   # Telegram メッセージフォーマット
│   ├── telegram.ts    # Telegram メッセージ送信（リトライ付き）
│   └── logger.ts      # ロガーユーティリティ
├── subscribe.example.json
├── data/              # ランタイム状態（自動生成）
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## コントリビュート

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT](LICENSE)
