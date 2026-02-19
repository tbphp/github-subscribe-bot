import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, type LanguageModel } from 'ai';
import type {
  AppConfig,
  GitHubRelease,
  CategorizedRelease,
  CategoryGroup,
  CategoryType,
} from './types.js';

const VALID_TYPES = new Set<CategoryType>([
  'feat', 'fix', 'perf', 'refactor', 'docs', 'other',
]);

function formatDate(iso: string, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

const SYSTEM_PROMPT = `You are a GitHub Release Notes translator and categorizer.
Given release notes in any language, you MUST:
1. Translate all content to Chinese (简体中文)
2. Categorize each change into exactly one type: feat, fix, perf, refactor, docs, other
3. Return ONLY valid JSON, no markdown fences, no extra text

Output format:
{"categories":[{"type":"feat","items":["中文描述1"]},{"type":"fix","items":["中文描述2"]}]}

Rules:
- Each item should be a concise one-line description in Chinese
- Merge duplicate or very similar items
- If a change doesn't fit feat/fix/perf/refactor/docs, use "other"
- Skip CI/build/dependency-only changes unless significant
- If input is empty or meaningless, return {"categories":[]}`;

export function createAIClient(config: AppConfig): LanguageModel {
  const opts = {
    ...(config.aiBaseUrl && { baseURL: config.aiBaseUrl }),
    apiKey: config.aiApiKey,
  };

  switch (config.aiProvider) {
    case 'google':
      return createGoogleGenerativeAI(opts)(config.aiModel);
    case 'anthropic':
      return createAnthropic(opts)(config.aiModel);
    case 'openai-responses':
      return createOpenAI(opts).responses(config.aiModel);
    default:
      // .chat() ensures /v1/chat/completions format (compatible with proxies)
      return createOpenAI(opts).chat(config.aiModel);
  }
}

export async function categorizeRelease(
  model: LanguageModel,
  release: GitHubRelease,
  timeZone: string,
): Promise<CategorizedRelease> {
  const base: CategorizedRelease = {
    tag: release.tag_name,
    date: formatDate(release.published_at, timeZone),
    url: release.html_url,
    categories: [],
  };

  if (!release.body?.trim()) return base;

  const start = Date.now();
  try {
    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: release.body,
    });

    console.log(
      `[AI] Categorized ${release.tag_name} in ${Date.now() - start}ms`,
    );

    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as { categories: CategoryGroup[] };
    base.categories = parsed.categories.filter(
      (c) => VALID_TYPES.has(c.type) && c.items.length > 0,
    );
  } catch (e) {
    console.error(
      `[AI] Failed for ${release.tag_name} after ${Date.now() - start}ms:`,
      e,
    );
    base.categories = [
      { type: 'other', items: [release.body.slice(0, 500)] },
    ];
  }

  return base;
}
