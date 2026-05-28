import simpleGit, { SimpleGit } from "simple-git";
import { Octokit } from "@octokit/rest";
import { execSync } from "child_process";

export interface FileChange {
  file: string;
  additions: number;
  deletions: number;
  diff: string;
}

export async function getDiff(options: {
  staged?: boolean;
  pr?: number;
  cwd?: string;
}): Promise<FileChange[]> {
  const git: SimpleGit = simpleGit(options.cwd || process.cwd());

  if (options.pr) {
    return getPRDiff(git, options.pr);
  }

  let diffText: string;
  if (options.staged) {
    diffText = await git.diff(["--cached"]);
  } else {
    diffText = await git.diff();
  }

  return parseDiff(diffText);
}

async function getPRDiff(git: SimpleGit, prNumber: number): Promise<FileChange[]> {
  // Try GitHub Actions context first
  const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repoEnv = process.env.GITHUB_REPOSITORY;

  if (ghToken && repoEnv) {
    const [owner, repo] = repoEnv.split("/");
    try {
      return await fetchPRDiffViaAPI(ghToken, owner, repo, prNumber);
    } catch {
      // Fall through to gh CLI
    }
  }

  // Try gh CLI
  try {
    return fetchPRDiffViaCLI(prNumber);
  } catch {
    // Fall through to local diff
  }

  // Fallback: local diff against main/master
  const branches = await git.branchLocal();
  const mainBranch = branches.all.includes("main") ? "main" : "master";
  const diffText = await git.diff([mainBranch]);
  return parseDiff(diffText);
}

async function fetchPRDiffViaAPI(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<FileChange[]> {
  const octokit = new Octokit({ auth: token });

  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  const changes: FileChange[] = [];

  for (const file of files) {
    if (!file.patch) continue;

    const patch = file.patch as string;
    let additions = 0;
    let deletions = 0;

    for (const line of patch.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    // Build a unified diff header
    const diffHeader = `diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${patch}`;

    changes.push({
      file: file.filename,
      additions,
      deletions,
      diff: diffHeader,
    });
  }

  return changes;
}

function fetchPRDiffViaCLI(prNumber: number): FileChange[] {
  const diffText = execSync(`gh pr diff ${prNumber}`, {
    encoding: "utf-8",
    timeout: 30000,
  });
  return parseDiff(diffText);
}

export function parseDiff(diffText: string): FileChange[] {
  if (!diffText.trim()) return [];

  const files: FileChange[] = [];
  const fileBlocks = diffText.split(/^diff --git /m).filter(Boolean);

  for (const block of fileBlocks) {
    const lines = block.split("\n");

    // Prefer +++ b/filename line, fall back to header
    const plusLine = lines.find((l) => l.startsWith("+++ b/"));
    const headerLine = lines[0] || "";
    const match = plusLine
      ? plusLine.match(/^\+\+\+ b\/(.+)$/)
      : headerLine.match(/ b\/(.+)$/);
    if (!match) continue;

    const file = match[1];
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    files.push({
      file,
      additions,
      deletions,
      diff: block,
    });
  }

  return files;
}
