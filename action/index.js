// action/index.ts
import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
var SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided code changes and identify issues.

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
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err?.status === 429 || err?.status === 500 || err?.status === 502 || err?.status === 503;
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.min(1e3 * 2 ** attempt, 1e4);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}
function formatAsMarkdown(result) {
  let md = `## ReviewAI Code Review

`;
  md += `**Summary:** ${result.summary}

`;
  if (result.issues.length === 0) {
    md += `No issues found!
`;
    return md;
  }
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  const infos = result.issues.filter((i) => i.severity === "info").length;
  md += `Found **${result.issues.length}** issues: ${errors} errors, ${warnings} warnings, ${infos} info

`;
  for (const issue of result.issues) {
    const icon = { error: "\u{1F534}", warning: "\u{1F7E1}", info: "\u{1F535}" }[issue.severity];
    const location = issue.line ? `\`${issue.file}:${issue.line}\`` : `\`${issue.file}\``;
    md += `${icon} **${location}** \u2014 ${issue.message}
`;
    if (issue.suggestion) {
      md += `  - \u{1F4A1} ${issue.suggestion}
`;
    }
    md += "\n";
  }
  md += `---
*Powered by [ReviewAI](https://www.npmjs.com/package/reviewai)*
`;
  return md;
}
async function run() {
  try {
    const apiKey = core.getInput("api-key", { required: true });
    const model = core.getInput("model") || "gpt-4o-mini";
    const providerInput = core.getInput("provider") || void 0;
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
    core.info(`Fetching PR #${prNumber} diff...`);
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100
    });
    const changes = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const file of files) {
      if (!file.patch) continue;
      totalAdditions += file.additions;
      totalDeletions += file.deletions;
      changes.push(
        `diff --git a/${file.filename} b/${file.filename}
--- a/${file.filename}
+++ b/${file.filename}
${file.patch}`
      );
    }
    if (changes.length === 0) {
      core.info("No reviewable changes found.");
      return;
    }
    core.info(`Reviewing ${changes.length} files (+${totalAdditions}/-${totalDeletions})...`);
    const fullDiff = changes.join("\n");
    let result;
    if (provider === "claude") {
      const client = new Anthropic({ apiKey });
      const response = await withRetry(
        () => client.messages.create({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Review these code changes:

${fullDiff}` }],
          temperature: 0.1
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
      const response = await withRetry(
        () => client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `Review these code changes:

${fullDiff}` }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        })
      );
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("Empty response from OpenAI");
      result = JSON.parse(content);
    }
    const markdown = formatAsMarkdown(result);
    core.setOutput("review", markdown);
    core.info(markdown);
    if (postComment && token) {
      const marker = "<!-- reviewai -->";
      const body = `${marker}
${markdown}`;
      const { data: comments } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number: prNumber
      });
      const existing = comments.find((c) => c.body?.includes(marker));
      if (existing) {
        await octokit.issues.updateComment({
          owner,
          repo,
          comment_id: existing.id,
          body
        });
        core.info("Updated existing review comment.");
      } else {
        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body
        });
        core.info("Posted review comment.");
      }
    }
    const hasErrors = result.issues.some((i) => i.severity === "error");
    if (hasErrors) {
      core.setFailed(`Review found ${result.issues.filter((i) => i.severity === "error").length} error(s).`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}
run();
