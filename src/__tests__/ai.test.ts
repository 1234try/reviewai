import { describe, it, expect } from "vitest";
import { reviewCode } from "../ai.js";

describe("reviewCode", () => {
  it("auto-detects claude provider from model name", async () => {
    await expect(
      reviewCode("some diff", {
        apiKey: "sk-ant-invalid",
        model: "claude-sonnet-4-20250514",
      })
    ).rejects.toThrow();
  }, 15000);
});
