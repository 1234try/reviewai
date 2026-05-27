import OpenAI from "openai";

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

export async function reviewCode(
  diff: string,
  options: {
    apiKey?: string;
    model?: string;
    baseURL?: string;
  }
): Promise<ReviewResult> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenAI API key required. Set OPENAI_API_KEY env var or use --api-key flag."
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL,
  });

  const response = await client.chat.completions.create({
    model: options.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Review these code changes:\n\n${diff}`,
      },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from AI");
  }

  try {
    return JSON.parse(content) as ReviewResult;
  } catch {
    throw new Error(`Invalid JSON response: ${content.slice(0, 200)}`);
  }
}
