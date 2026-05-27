import chalk from "chalk";
import type { ReviewResult, ReviewIssue } from "./ai.js";

export function printTerminal(result: ReviewResult): void {
  console.log();
  console.log(chalk.bold("Review Summary:"));
  console.log(result.summary);
  console.log();

  if (result.issues.length === 0) {
    console.log(chalk.green("No issues found!"));
    return;
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const infos = result.issues.filter((i) => i.severity === "info");

  console.log(
    chalk.bold(
      `Found ${result.issues.length} issues: ` +
        `${chalk.red(`${errors.length} errors`)}, ` +
        `${chalk.yellow(`${warnings.length} warnings`)}, ` +
        `${chalk.blue(`${infos.length} info`)}`
    )
  );
  console.log();

  for (const issue of result.issues) {
    printIssue(issue);
  }
}

function printIssue(issue: ReviewIssue): void {
  const icon = {
    error: chalk.red("✖"),
    warning: chalk.yellow("⚠"),
    info: chalk.blue("ℹ"),
  }[issue.severity];

  const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
  console.log(`${icon} ${chalk.bold(location)}`);
  console.log(`  ${issue.message}`);
  if (issue.suggestion) {
    console.log(`  ${chalk.green("→")} ${chalk.dim(issue.suggestion)}`);
  }
  console.log();
}

export function printJSON(result: ReviewResult): void {
  console.log(JSON.stringify(result, null, 2));
}

export function printMarkdown(result: ReviewResult): void {
  console.log("## Code Review\n");
  console.log(`**Summary:** ${result.summary}\n`);

  if (result.issues.length === 0) {
    console.log("No issues found!");
    return;
  }

  console.log(`### Issues (${result.issues.length})\n`);

  for (const issue of result.issues) {
    const icon = { error: "🔴", warning: "🟡", info: "🔵" }[issue.severity];
    const location = issue.line
      ? `\`${issue.file}:${issue.line}\``
      : `\`${issue.file}\``;
    console.log(`${icon} **${location}** — ${issue.message}`);
    if (issue.suggestion) {
      console.log(`  - 💡 ${issue.suggestion}`);
    }
    console.log();
  }
}
