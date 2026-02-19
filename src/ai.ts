import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import {
  Output,
  extractJsonMiddleware,
  generateText,
  jsonSchema,
  wrapLanguageModel,
} from 'ai';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  AppConfig,
  GitHubRelease,
  CategorizedRelease,
  CategoryGroup,
  CategoryType,
} from './types.js';

const CATEGORY_TYPES: CategoryType[] = [
  'feat', 'fix', 'perf', 'refactor', 'docs', 'other',
];

const VALID_TYPES = new Set<CategoryType>(CATEGORY_TYPES);

type ReleaseCategoriesOutput = {
  categories: CategoryGroup[];
};

const RELEASE_OUTPUT_SCHEMA = jsonSchema<ReleaseCategoriesOutput>({
  type: 'object',
  additionalProperties: false,
  required: ['categories'],
  properties: {
    categories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'items'],
        properties: {
          type: {
            type: 'string',
            enum: CATEGORY_TYPES,
          },
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
});

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
3. Return data that strictly follows the provided schema

Rules:
- Each item should be a concise one-line description in Chinese
- Merge duplicate or very similar items
- If a change doesn't fit feat/fix/perf/refactor/docs, use "other"
- Skip CI/build/dependency-only changes unless significant
- If input is empty or meaningless, return an empty categories array`;

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
}

function extractFirstJsonObject(text: string): string | null {
  const input = stripCodeFence(text);
  const start = input.indexOf('{');

  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function createAIClient(config: AppConfig): LanguageModelV3 {
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
  model: LanguageModelV3,
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

  const structuredModel = wrapLanguageModel({
    model,
    middleware: extractJsonMiddleware({
      transform: (text) => {
        const repaired = extractFirstJsonObject(text);

        if (repaired) {
          console.warn(`[AI] Repaired malformed output for ${release.tag_name}`);
          return repaired;
        }

        return stripCodeFence(text);
      },
    }),
  });

  const start = Date.now();
  try {
    const { output } = await generateText({
      model: structuredModel,
      system: SYSTEM_PROMPT,
      prompt: release.body,
      output: Output.object({ schema: RELEASE_OUTPUT_SCHEMA }),
      temperature: 0,
    });

    console.log(
      `[AI] Categorized ${release.tag_name} in ${Date.now() - start}ms`,
    );

    base.categories = output.categories.filter(
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
