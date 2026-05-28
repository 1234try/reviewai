import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

interface ReviewIssue {
  severity: "error" | "warning" | "info";
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
}

const SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided code changes and identify issues.

For each issue found, respond in this exact JSON format:
{
  "summary": "Brief overall assessment",
  "issues": [
    {
      "severity": "error|warning|info",
      "file": "path/to/file",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ]
}

Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Code style and best practices
- Missing error handling

Be concise. Only report real issues, not style preferences.
Respond ONLY with valid JSON, no markdown fences.`;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRetryable =
        err?.status === 429 || err?.status === 500 || err?.status === 502 || err?.status === 503;
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

function formatAsMarkdown(result: ReviewResult): string {
  let md = `## ReviewAI Code Review\n\n`;
  md += `**Summary:** ${result.summary}\n\n`;

  if (result.issues.length === 0) {
    md += `No issues found!\n`;
    return md;
  }

  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const infos = result.issues.filter((i) => i.severity === "info").length;

  md += `Found **${result.issues.length}** issues: ${errors} errors, ${warnings} warnings, ${infos} info\n\n`;

  for (const issue of result.issues) {
    const icon = { error: "🔴", warning: "🟡", info: "🔵" }[issue.severity];
    const location = issue.line ? `\`${issue.file}:${issue.line}\`` : `\`${issue.file}\``;
    md += `${icon} **${location}** — ${issue.message}\n`;
    if (issue.suggestion) {
      md += `  - 💡 ${issue.suggestion}\n`;
    }
    md += "\n";
  }

  md += `---\n*Powered by [ReviewAI](https://www.npmjs.com/package/reviewai)*\n`;
  return md;
}

async function run(): Promise<void> {
  try {
    const apiKey = core.getInput("api-key", { required: true });
    const model = core.getInput("model") || "gpt-4o-mini";
    const providerInput = core.getInput("provider") || undefined;
    const postComment = core.getInput("post-comment") !== "false";

    const provider = providerInput || (model.startsWith("claude") ? "claude" : "openai");

    const { context } = github;
    if (!context.payload.pull_request) {
      core.warning("This action only works on pull requests.");
      return;
    }

    const prNumber = context.payload.pull_request.number;
    const { owner, repo } = context.repo;

    const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";
    const octokit = new Octokit({ auth: token });

    // Fetch PR files
    core.info(`Fetching PR #${prNumber} diff...`);
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const changes: string[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const file of files) {
      if (!file.patch) continue;
      totalAdditions += file.additions;
      totalDeletions += file.deletions;
      changes.push(
        `diff --git a/${file.filename} b/${file.filename}\n--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`
      );
    }

    if (changes.length === 0) {
      core.info("No reviewable changes found.");
      return;
    }

    core.info(`Reviewing ${changes.length} files (+${totalAdditions}/-${totalDeletions})...`);

    const fullDiff = changes.join("\n");

    // Call AI
    let result: ReviewResult;
    if (provider === "claude") {
      const client = new Anthropic({ apiKey });
      const response = await withRetry(() =>
        client.messages.create({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Review these code changes:\n\n${fullDiff}` }],
          temperature: 0.1,
        })
      );
      const block = response.content[0];
      if (!block || block.type !== "text") throw new Error("Empty response from Claude");
      const text = block.text.trim();
      try {
        result = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Invalid JSON from Claude");
        result = JSON.parse(match[0]);
      }
    } else {
      const client = new OpenAI({ apiKey });
      const response = await withRetry(() =>
        client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Review these code changes:\n\n${fullDiff}` },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        })
      );
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from OpenAI");
      result = JSON.parse(content);
    }

    const markdown = formatAsMarkdown(result);
    core.setOutput("review", markdown);
    core.info(markdown);

    // Post PR comment
    if (postComment && token) {
      const marker = "<!-- reviewai -->";
      const body = `${marker}\n${markdown}`;

      // Check for existing comment to update
      const { data: comments } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
      });
      const existing = comments.find((c) => c.body?.includes(marker));

      if (existing) {
        await octokit.issues.updateComment({
          owner,
          repo,
          comment_id: existing.id,
          body,
        });
        core.info("Updated existing review comment.");
      } else {
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body,
        });
        core.info("Posted review comment.");
      }
    }

    const hasErrors = result.issues.some((i) => i.severity === "error");
    if (hasErrors) {
      core.setFailed(`Review found ${result.issues.filter((i) => i.severity === "error").length} error(s).`);
    }
  } catch (error: any) {
    core.setFailed(error.message);
  }
}

run();
