import { Command } from "commander";
import ora from "ora";
import { getDiff } from "./git.js";
import { reviewCode, type Provider } from "./ai.js";
import { printTerminal, printJSON, printMarkdown } from "./output.js";
import { loadConfig } from "./config.js";

const program = new Command();

program
  .name("reviewai")
  .description("AI-powered code review CLI")
  .version("0.1.0")
  .option("-s, --staged", "review staged changes only")
  .option("-p, --pr <number>", "review a pull request by number", parseInt)
  .option("-f, --format <format>", "output format: terminal, json, markdown", "terminal")
  .option("-m, --model <model>", "AI model (e.g. gpt-4o, claude-sonnet-4-20250514)")
  .option("--provider <provider>", "AI provider: openai or claude (auto-detected from model)")
  .option("-k, --api-key <key>", "API key (OpenAI or Anthropic)")
  .option("--base-url <url>", "custom API base URL (for proxies)")
  .action(async (opts) => {
    const config = loadConfig();

    const provider: Provider | undefined = opts.provider || config.provider;

    // Resolve API key based on provider
    let apiKey: string | undefined;
    if (provider === "claude") {
      apiKey = opts.apiKey || config.apiKey || process.env.ANTHROPIC_API_KEY;
    } else {
      apiKey = opts.apiKey || config.apiKey || process.env.OPENAI_API_KEY;
      // Fallback: if no OpenAI key but Anthropic key exists and model looks like claude
      if (!apiKey && process.env.ANTHROPIC_API_KEY && (opts.model || "").startsWith("claude")) {
        apiKey = process.env.ANTHROPIC_API_KEY;
      }
    }

    if (!apiKey) {
      console.error("Error: API key required.");
      console.error("Set OPENAI_API_KEY or ANTHROPIC_API_KEY env var, use --api-key, or add to .reviewai.yml");
      process.exit(1);
    }

    const spinner = ora("Fetching changes...").start();

    try {
      const changes = await getDiff({
        staged: opts.staged,
        pr: opts.pr,
      });

      if (changes.length === 0) {
        spinner.fail("No changes found.");
        process.exit(0);
      }

      const totalAdditions = changes.reduce((s, c) => s + c.additions, 0);
      const totalDeletions = changes.reduce((s, c) => s + c.deletions, 0);
      spinner.text = `Reviewing ${changes.length} files (+${totalAdditions}/-${totalDeletions})...`;

      const fullDiff = changes.map((c) => c.diff).join("\n");

      const result = await reviewCode(fullDiff, {
        apiKey,
        model: opts.model || config.model,
        baseURL: opts.baseURL || config.baseURL,
        provider,
      });

      spinner.stop();

      const format = opts.format || config.format || "terminal";
      switch (format) {
        case "json":
          printJSON(result);
          break;
        case "markdown":
          printMarkdown(result);
          break;
        default:
          printTerminal(result);
      }

      const hasErrors = result.issues.some((i) => i.severity === "error");
      process.exit(hasErrors ? 1 : 0);
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    }
  });

program.parse();
