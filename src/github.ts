import type {
  GitHubRelease,
  GitHubTag,
  GitHubCompareCommit,
  AppState,
  CheckResult,
  TagCheckResult,
  Subscription,
  ReleaseSubscribeMode,
} from './types.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const STATE_PATH = resolve(import.meta.dirname, '..', 'data', 'state.json');
const API_BASE = 'https://api.github.com';
const MAX_TAG_COMMITS = 50;

export function stateKey(sub: Subscription): string {
  return sub.mode === 'latest' ? sub.repo : `${sub.repo}:${sub.mode}`;
}

function releaseStateKey(repo: string, mode: ReleaseSubscribeMode): string {
  return mode === 'latest' ? repo : `${repo}:${mode}`;
}

function releaseMatchesMode(
  release: GitHubRelease,
  mode: ReleaseSubscribeMode,
): boolean {
  if (release.draft) return false;
  if (mode === 'latest') return !release.prerelease;
  return release.prerelease;
}

function buildHeaders(
  token: string | undefined,
  etag: string | null | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (etag) headers['If-None-Match'] = etag;
  return headers;
}

export function loadState(): AppState {
  try {
    const state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    console.log(`[State] Loaded ${Object.keys(state).length} repo(s)`);
    return state;
  } catch {
    console.log('[State] No existing state, starting fresh');
    return {};
  }
}

export function saveState(state: AppState): void {
  mkdirSync(resolve(STATE_PATH, '..'), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`[State] Saved ${Object.keys(state).length} repo(s)`);
}

export async function checkRepo(
  repo: string,
  mode: ReleaseSubscribeMode,
  token: string | undefined,
  state: AppState,
): Promise<CheckResult> {
  const key = releaseStateKey(repo, mode);
  const logKey = key;
  const repoState = state[key];
  const headers = buildHeaders(token, repoState?.etag);

  const res = await fetch(
    `${API_BASE}/repos/${repo}/releases?per_page=30`,
    { headers },
  );

  if (res.status === 304) {
    return { repo, newReleases: [], etag: repoState?.etag ?? null };
  }

  if (res.status === 403) {
    const resetAt = res.headers.get('x-ratelimit-reset');
    if (resetAt) {
      const waitMs = Number(resetAt) * 1000 - Date.now();
      if (waitMs > 0) {
        console.warn(
          `[${logKey}] Rate limited, reset in ${Math.ceil(waitMs / 1000)}s`,
        );
      }
    }
    return { repo, newReleases: [], etag: repoState?.etag ?? null };
  }

  if (!res.ok) {
    console.error(`[${logKey}] GitHub API error: ${res.status}`);
    return { repo, newReleases: [], etag: repoState?.etag ?? null };
  }

  const etag = res.headers.get('etag');
  const releases = (await res.json()) as GitHubRelease[];

  const matched = releases.filter((r) => releaseMatchesMode(r, mode));

  if (!repoState?.lastRelease) {
    const latest = matched[0];
    return {
      repo,
      newReleases: latest ? [latest] : [],
      etag,
    };
  }

  const newReleases: GitHubRelease[] = [];
  let sentinelFound = false;
  for (const r of matched) {
    if (r.tag_name === repoState.lastRelease) {
      sentinelFound = true;
      break;
    }
    newReleases.push(r);
  }

  // Sentinel missing (deleted release): filter by time
  if (!sentinelFound && newReleases.length > 0) {
    const cutoff = repoState.lastReleaseDate ?? repoState.lastCheck;
    console.warn(
      `[${logKey}] Last release "${repoState.lastRelease}" not found in API response, using time cutoff: ${cutoff}`,
    );
    const filtered = newReleases.filter(
      (r) => new Date(r.published_at) > new Date(cutoff),
    );
    return { repo, newReleases: filtered, etag };
  }
  return { repo, newReleases, etag };
}

export async function checkRepoTags(
  repo: string,
  token: string | undefined,
  state: AppState,
): Promise<TagCheckResult> {
  const key = `${repo}:tag`;
  const repoState = state[key];
  const headers = buildHeaders(token, repoState?.etag);

  const res = await fetch(
    `${API_BASE}/repos/${repo}/tags?per_page=30`,
    { headers },
  );

  if (res.status === 304) {
    return { repo, newTags: [], etag: repoState?.etag ?? null };
  }

  if (res.status === 403) {
    const resetAt = res.headers.get('x-ratelimit-reset');
    if (resetAt) {
      const waitMs = Number(resetAt) * 1000 - Date.now();
      if (waitMs > 0) {
        console.warn(
          `[${repo}] Rate limited, reset in ${Math.ceil(waitMs / 1000)}s`,
        );
      }
    }
    return { repo, newTags: [], etag: repoState?.etag ?? null };
  }

  if (!res.ok) {
    console.error(`[${repo}] GitHub API error: ${res.status}`);
    return { repo, newTags: [], etag: repoState?.etag ?? null };
  }

  const etag = res.headers.get('etag');
  const tags = (await res.json()) as GitHubTag[];

  if (!repoState?.lastTag) {
    const latest = tags[0];
    return { repo, newTags: latest ? [latest] : [], etag };
  }

  const newTags: GitHubTag[] = [];
  let sentinelFound = false;
  for (const t of tags) {
    if (t.name === repoState.lastTag) {
      sentinelFound = true;
      break;
    }
    newTags.push(t);
  }

  // Sentinel missing (deleted tag): filter by commit date
  if (!sentinelFound && newTags.length > 0) {
    const cutoff = repoState.lastTagDate ?? repoState.lastCheck;
    console.warn(
      `[${repo}] Last tag "${repoState.lastTag}" not found in API response, using time cutoff: ${cutoff}`,
    );
    const cutoffTime = new Date(cutoff).getTime();
    const filtered: GitHubTag[] = [];
    for (const t of newTags) {
      const dateStr = await getCommitDate(repo, t.commit.sha, token);
      if (!dateStr) continue;
      if (new Date(dateStr).getTime() <= cutoffTime) break;
      filtered.push(t);
    }
    return { repo, newTags: filtered, etag };
  }
  return { repo, newTags, etag };
}

export async function getCompareCommits(
  repo: string,
  base: string,
  head: string,
  token: string | undefined,
): Promise<GitHubCompareCommit[]> {
  const headers = buildHeaders(token, undefined);

  const res = await fetch(
    `${API_BASE}/repos/${repo}/compare/${base}...${head}`,
    { headers },
  );

  if (!res.ok) {
    console.error(`[${repo}] Compare API error: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as { commits: GitHubCompareCommit[] };
  return data.commits.slice(-MAX_TAG_COMMITS);
}

export async function getTagCommits(
  repo: string,
  tag: string,
  token: string | undefined,
): Promise<GitHubCompareCommit[]> {
  const headers = buildHeaders(token, undefined);

  const res = await fetch(
    `${API_BASE}/repos/${repo}/commits?sha=${encodeURIComponent(tag)}&per_page=${MAX_TAG_COMMITS}`,
    { headers },
  );

  if (!res.ok) {
    console.error(`[${repo}] Commits API error: ${res.status}`);
    return [];
  }

  return (await res.json()) as GitHubCompareCommit[];
}

export async function getCommitDate(
  repo: string,
  sha: string,
  token: string | undefined,
): Promise<string | null> {
  const headers = buildHeaders(token, undefined);

  const res = await fetch(
    `${API_BASE}/repos/${repo}/commits/${sha}`,
    { headers },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as GitHubCompareCommit;
  return data.commit.author?.date ?? null;
}
