import { readFileSync, existsSync } from "fs";
import { join } from "path";
import YAML from "yaml";

export interface Config {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  format?: "terminal" | "json" | "markdown";
}

const CONFIG_FILES = [".reviewai.yml", ".reviewai.yaml", ".reviewai.json"];

export function loadConfig(cwd?: string): Config {
  const dir = cwd || process.cwd();

  for (const filename of CONFIG_FILES) {
    const filepath = join(dir, filename);
    if (existsSync(filepath)) {
      const content = readFileSync(filepath, "utf-8");
      if (filename.endsWith(".json")) {
        return JSON.parse(content);
      }
      return YAML.parse(content) as Config;
    }
  }

  return {};
}
