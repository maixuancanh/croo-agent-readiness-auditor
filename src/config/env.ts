import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnv(path = ".env.local"): void {
  const envPath = resolve(process.cwd(), path);
  if (!existsSync(envPath)) {
    return;
  }

  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
