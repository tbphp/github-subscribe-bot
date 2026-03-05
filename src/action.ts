import 'dotenv/config';
import { loadConfig, loadSubscriptions } from './config.js';
import { loadState, saveState, checkRepo, checkRepoTags, getCompareCommits, getTagCommits, getCommitDate } from './github.js';
import { createAIClient, categorizeRelease } from './ai.js';
import { splitMessages } from './formatter.js';
import { sendMessage } from './telegram.js';
import { setupLogging } from './logger.js';
import type {
  AppState,
  CategorizedRelease,
  Subscription,
  GitHubRelease,
  ReleaseSubscribeMode,
} from './types.js';

// Single-run entry point for GitHub Actions (no cron loop)
setupLogging();

const config = loadConfig();
const model = createAIClient(config);

if (!config.githubToken) {
  console.info(
    '[Tip] GITHUB_TOKEN not set. Using unauthenticated GitHub API (60 req/hr).',
  );
}

async function processReleaseRepo(
  repo: string,
  mode: ReleaseSubscribeMode,
  state: AppState,
): Promise<void> {
  const key = mode === 'latest' ? repo : `${repo}:${mode}`;
  const result = await checkRepo(repo, mode, config.githubToken, state);
  const now = new Date().toISOString();

  if (result.newReleases.length === 0) {
    console.log(`[${key}] No new releases`);
    if (result.etag && result.etag !== state[key]?.etag) {
      state[key] = {
        lastRelease: state[key]?.lastRelease,
        lastReleaseDate: state[key]?.lastReleaseDate,
        etag: result.etag,
        lastCheck: now,
      };
    }
    return;
  }

  console.log(
    `[${key}] Found ${result.newReleases.length} new release(s)`,
  );

  const categorized: CategorizedRelease[] = [];
  for (const release of result.newReleases) {
    categorized.push(
      await categorizeRelease(model, release, config.timezone, config.targetLang),
    );
  }

  const messages = splitMessages(repo, categorized, config.targetLang);

  for (const msg of messages) {
    const ok = await sendMessage(
      config.telegramBotToken,
      config.telegramChatId,
      msg,
    );
    if (!ok) {
      console.error(`[${key}] Failed to send Telegram message`);
      return;
    }
  }

  state[key] = {
    lastRelease: result.newReleases[0].tag_name,
    lastReleaseDate: result.newReleases[0].published_at,
    etag: result.etag,
    lastCheck: now,
  };
  console.log(`[${key}] Notified, latest: ${state[key].lastRelease}`);
}

async function processTagRepo(
  repo: string,
  state: AppState,
): Promise<void> {
  const key = `${repo}:tag`;
  const result = await checkRepoTags(repo, config.githubToken, state);
  const now = new Date().toISOString();

  if (result.newTags.length === 0) {
    console.log(`[${repo}:tag] No new tags`);
    if (result.etag && result.etag !== state[key]?.etag) {
      state[key] = {
        lastTag: state[key]?.lastTag,
        lastTagDate: state[key]?.lastTagDate,
        etag: result.etag,
        lastCheck: now,
      };
    }
    return;
  }

  console.log(
    `[${repo}:tag] Found ${result.newTags.length} new tag(s)`,
  );

  const prevTag = state[key]?.lastTag;
  const categorized: CategorizedRelease[] = [];

  for (const tag of [...result.newTags].reverse()) {
    let commits;
    if (prevTag || categorized.length > 0) {
      const base = categorized.length > 0
        ? result.newTags[result.newTags.length - categorized.length]?.name ?? prevTag!
        : prevTag!;
      commits = await getCompareCommits(
        repo, base, tag.name, config.githubToken,
      );
    } else {
      // First run: no previous tag, fetch recent commits for this tag
      commits = await getTagCommits(repo, tag.name, config.githubToken);
    }
    const body = commits.map((c) => c.commit.message).join('\n');
    const tagDate = await getCommitDate(repo, tag.commit.sha, config.githubToken);

    const pseudoRelease: GitHubRelease = {
      tag_name: tag.name,
      name: tag.name,
      body,
      html_url: `https://github.com/${repo}/releases/tag/${tag.name}`,
      published_at: tagDate ?? now,
      draft: false,
      prerelease: false,
    };

    categorized.push(
      await categorizeRelease(model, pseudoRelease, config.timezone, config.targetLang),
    );
  }

  categorized.reverse();
  const messages = splitMessages(repo, categorized, config.targetLang);

  for (const msg of messages) {
    const ok = await sendMessage(
      config.telegramBotToken,
      config.telegramChatId,
      msg,
    );
    if (!ok) {
      console.error(`[${repo}:tag] Failed to send Telegram message`);
      return;
    }
  }

  const latestTagDate = await getCommitDate(repo, result.newTags[0].commit.sha, config.githubToken);
  state[key] = {
    lastTag: result.newTags[0].name,
    lastTagDate: latestTagDate ?? now,
    etag: result.etag,
    lastCheck: now,
  };
  console.log(`[${repo}:tag] Notified, latest: ${state[key].lastTag}`);
}

async function processRepo(
  sub: Subscription,
  state: AppState,
): Promise<void> {
  if (sub.mode === 'tag') {
    await processTagRepo(sub.repo, state);
  } else {
    await processReleaseRepo(sub.repo, sub.mode, state);
  }
}

async function run(): Promise<void> {
  const subs = loadSubscriptions();
  console.log(
    `[Check] ${new Date().toISOString()} — ${subs.length} subscription(s)`,
  );

  const start = Date.now();
  const state = loadState();
  let failed = 0;

  for (const sub of subs) {
    try {
      await processRepo(sub, state);
    } catch (e) {
      console.error(`[${sub.repo}:${sub.mode}] Unexpected error:`, e);
      failed++;
    }
  }

  saveState(state);
  console.log(
    `[Check] Done in ${Date.now() - start}ms. Subscriptions: ${subs.length}, failed: ${failed}`,
  );

  if (failed > 0) {
    process.exit(1);
  }
}

run();
