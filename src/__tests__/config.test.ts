import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "reviewai-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns empty config when no config file exists", () => {
    const config = loadConfig(testDir);
    expect(config).toEqual({});
  });

  it("loads .reviewai.yml", () => {
    writeFileSync(
      join(testDir, ".reviewai.yml"),
      "model: gpt-4o\nformat: json\nprovider: openai\n"
    );
    const config = loadConfig(testDir);
    expect(config.model).toBe("gpt-4o");
    expect(config.format).toBe("json");
    expect(config.provider).toBe("openai");
  });

  it("loads .reviewai.yaml", () => {
    writeFileSync(join(testDir, ".reviewai.yaml"), "model: claude-sonnet-4-20250514\n");
    const config = loadConfig(testDir);
    expect(config.model).toBe("claude-sonnet-4-20250514");
  });

  it("loads .reviewai.json", () => {
    writeFileSync(
      join(testDir, ".reviewai.json"),
      JSON.stringify({ model: "gpt-4o", format: "markdown" })
    );
    const config = loadConfig(testDir);
    expect(config.model).toBe("gpt-4o");
    expect(config.format).toBe("markdown");
  });

  it("prefers .reviewai.yml over .reviewai.json", () => {
    writeFileSync(join(testDir, ".reviewai.yml"), "model: from-yml\n");
    writeFileSync(join(testDir, ".reviewai.json"), JSON.stringify({ model: "from-json" }));
    const config = loadConfig(testDir);
    expect(config.model).toBe("from-yml");
  });
});
