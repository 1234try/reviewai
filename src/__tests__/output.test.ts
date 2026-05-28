import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { printJSON, printMarkdown, printTerminal } from "../output.js";
import type { ReviewResult } from "../ai.js";

const mockResult: ReviewResult = {
  summary: "Found some issues",
  issues: [
    {
      severity: "error",
      file: "src/auth.ts",
      line: 42,
      message: "Missing input validation",
      suggestion: "Add validation",
    },
    {
      severity: "warning",
      file: "src/api.ts",
      message: "Consider rate limiting",
    },
    {
      severity: "info",
      file: "src/utils.ts",
      line: 8,
      message: "Could use Array.flatMap()",
    },
  ],
};

const emptyResult: ReviewResult = {
  summary: "All good",
  issues: [],
};

describe("printJSON", () => {
  it("outputs valid JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    printJSON(mockResult);
    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.summary).toBe("Found some issues");
    expect(output.issues).toHaveLength(3);
    spy.mockRestore();
  });
});

describe("printMarkdown", () => {
  let output: string;
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    output = "";
    spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      output += args.join(" ") + "\n";
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("includes summary", () => {
    printMarkdown(mockResult);
    expect(output).toContain("Found some issues");
  });

  it("includes all issues", () => {
    printMarkdown(mockResult);
    expect(output).toContain("🔴");
    expect(output).toContain("🟡");
    expect(output).toContain("🔵");
    expect(output).toContain("src/auth.ts:42");
    expect(output).toContain("src/api.ts");
  });

  it("shows 'no issues' for empty result", () => {
    printMarkdown(emptyResult);
    expect(output).toContain("No issues found");
  });
});

describe("printTerminal", () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("prints summary and issue count", () => {
    printTerminal(mockResult);
    const allOutput = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allOutput).toContain("Review Summary");
    expect(allOutput).toContain("Found 3 issues");
  });

  it("shows 'no issues' for empty result", () => {
    printTerminal(emptyResult);
    const allOutput = spy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(allOutput).toContain("No issues found");
  });
});
