export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
}

export interface CheckResult {
  repo: string;
  newReleases: GitHubRelease[];
  etag: string | null;
}

export interface RepoState {
  lastRelease: string;
  etag: string | null;
  lastCheck: string;
}

export type AppState = Record<string, RepoState>;

export interface CategorizedRelease {
  tag: string;
  date: string;
  url: string;
  categories: CategoryGroup[];
}

export interface CategoryGroup {
  type: CategoryType;
  items: string[];
}

export type CategoryType =
  | 'feat'
  | 'fix'
  | 'perf'
  | 'refactor'
  | 'docs'
  | 'other';

export const CATEGORY_META: Record<
  CategoryType,
  { emoji: string; label: string }
> = {
  feat: { emoji: '✨', label: '新功能' },
  fix: { emoji: '🐛', label: '修复' },
  perf: { emoji: '⚡', label: '优化' },
  refactor: { emoji: '♻️', label: '重构' },
  docs: { emoji: '📝', label: '文档' },
  other: { emoji: '📌', label: '其他' },
};

export type AIProvider = 'openai-completions' | 'openai-responses' | 'google' | 'anthropic';

export interface AppConfig {
  githubToken: string;
  telegramBotToken: string;
  telegramChatId: string;
  aiProvider: AIProvider;
  aiBaseUrl?: string;
  aiApiKey: string;
  aiModel: string;
  cron: string;
  timezone: string;
}
