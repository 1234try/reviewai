import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface ReviewIssue {
  severity: "error" | "warning" | "info";
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  summary: string;
  issues: ReviewIssue[];
}

export type Provider = "openai" | "claude";

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
        err?.status === 429 ||
        err?.status === 500 ||
        err?.status === 502 ||
        err?.status === 503 ||
        err?.code === "ECONNRESET" ||
        err?.code === "ETIMEDOUT";

      if (!isRetryable || attempt === maxRetries) throw err;

      const delay = Math.min(1000 * 2 ** attempt, 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

async function reviewWithOpenAI(
  diff: string,
  options: { apiKey: string; model?: string; baseURL?: string }
): Promise<ReviewResult> {
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });

  const response = await withRetry(() =>
    client.chat.completions.create({
      model: options.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Review these code changes:\n\n${diff}` },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    })
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");

  try {
    return JSON.parse(content) as ReviewResult;
  } catch {
    throw new Error(`Invalid JSON response: ${content.slice(0, 200)}`);
  }
}

async function reviewWithClaude(
  diff: string,
  options: { apiKey: string; model?: string; baseURL?: string }
): Promise<ReviewResult> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
  });

  const response = await withRetry(() =>
    client.messages.create({
      model: options.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Review these code changes:\n\n${diff}` },
      ],
      temperature: 0.1,
    })
  );

  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Empty response from Claude");
  }

  const text = block.text.trim();

  try {
    return JSON.parse(text) as ReviewResult;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ReviewResult;
    }
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}

export async function reviewCode(
  diff: string,
  options: {
    apiKey: string;
    model?: string;
    baseURL?: string;
    provider?: Provider;
  }
): Promise<ReviewResult> {
  const provider = options.provider || detectProvider(options.model);

  if (provider === "claude") {
    return reviewWithClaude(diff, {
      apiKey: options.apiKey,
      model: options.model,
      baseURL: options.baseURL,
    });
  }

  return reviewWithOpenAI(diff, {
    apiKey: options.apiKey,
    model: options.model,
    baseURL: options.baseURL,
  });
}

function detectProvider(model?: string): Provider {
  if (!model) return "openai";
  if (model.startsWith("claude")) return "claude";
  return "openai";
}
