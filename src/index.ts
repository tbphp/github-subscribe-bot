import 'dotenv/config';
import { CronJob } from 'cron';
import { loadConfig, loadSubscriptions } from './config.js';
import { loadState, saveState, checkRepo } from './github.js';
import { createAIClient, categorizeRelease } from './ai.js';
import { splitMessages } from './formatter.js';
import { sendMessage } from './telegram.js';
import { setupLogging } from './logger.js';
import type { AppState, CategorizedRelease } from './types.js';

setupLogging();

const config = loadConfig();
const model = createAIClient(config);
let running = true;

async function processRepo(
  repo: string,
  state: AppState,
): Promise<void> {
  const result = await checkRepo(repo, config.githubToken, state);
  const now = new Date().toISOString();

  if (result.newReleases.length === 0) {
    console.log(`[${repo}] No new releases`);
    if (result.etag && result.etag !== state[repo]?.etag) {
      state[repo] = {
        lastRelease: state[repo]?.lastRelease ?? '',
        etag: result.etag,
        lastCheck: now,
      };
    }
    return;
  }

  console.log(
    `[${repo}] Found ${result.newReleases.length} new release(s)`,
  );

  const categorized: CategorizedRelease[] = [];
  for (const release of result.newReleases) {
    categorized.push(await categorizeRelease(model, release, config.timezone, config.targetLang));
  }

  const messages = splitMessages(repo, categorized, config.targetLang);

  for (const msg of messages) {
    const ok = await sendMessage(
      config.telegramBotToken,
      config.telegramChatId,
      msg,
    );
    if (!ok) {
      console.error(`[${repo}] Failed to send Telegram message`);
      return;
    }
  }

  state[repo] = {
    lastRelease: result.newReleases[0].tag_name,
    etag: result.etag,
    lastCheck: now,
  };
  console.log(`[${repo}] Notified, latest: ${state[repo].lastRelease}`);
}

async function runCheck(): Promise<void> {
  const repos = loadSubscriptions();
  console.log(
    `[Check] ${new Date().toISOString()} — ${repos.length} repo(s)`,
  );

  const start = Date.now();
  const state = loadState();
  let updated = 0;
  let failed = 0;

  for (const repo of repos) {
    if (!running) break;
    try {
      await processRepo(repo, state);
      if (state[repo]?.lastCheck === new Date().toISOString()) updated++;
    } catch (e) {
      console.error(`[${repo}] Unexpected error:`, e);
      failed++;
    }
  }

  saveState(state);
  console.log(
    `[Check] Done in ${Date.now() - start}ms. Repos: ${repos.length}, failed: ${failed}`,
  );
}

async function main(): Promise<void> {
  console.log(
    `Started. Provider: ${config.aiProvider}, Model: ${config.aiModel}, Lang: ${config.targetLang}, Timezone: ${config.timezone}, Cron: ${config.cron}`,
  );

  await runCheck();

  const job = CronJob.from({
    cronTime: config.cron,
    timeZone: config.timezone,
    start: true,
    onTick: async () => {
      if (!running) return;
      await runCheck();
    },
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    running = false;
    job.stop();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
