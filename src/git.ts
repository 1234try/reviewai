import simpleGit, { SimpleGit } from "simple-git";

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

  let diffText: string;

  if (options.pr) {
    // PR diff: compare with main/master
    const branches = await git.branchLocal();
    const mainBranch = branches.all.includes("main") ? "main" : "master";
    diffText = await git.diff([mainBranch]);
  } else if (options.staged) {
    diffText = await git.diff(["--cached"]);
  } else {
    diffText = await git.diff();
  }

  return parseDiff(diffText);
}

function parseDiff(diffText: string): FileChange[] {
  if (!diffText.trim()) return [];

  const files: FileChange[] = [];
  const fileBlocks = diffText.split(/^diff --git /m).filter(Boolean);

  for (const block of fileBlocks) {
    const lines = block.split("\n");

    // Extract filename from "a/path b/path"
    const headerLine = lines[0] || "";
    const match = headerLine.match(/b\/(.+)$/);
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
