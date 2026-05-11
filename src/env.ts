import fs from 'node:fs';
import path from 'node:path';

const MAX_DEPTH = 5;

export function loadDotEnvFiles(startDirectory = process.cwd()): void {
  let currentDirectory = path.resolve(startDirectory);
  const visited = new Set<string>();

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const envPath = path.join(currentDirectory, '.env');
    if (!visited.has(envPath) && fs.existsSync(envPath)) {
      loadDotEnvFile(envPath);
      visited.add(envPath);
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      break;
    }

    currentDirectory = parentDirectory;
  }
}

function loadDotEnvFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    process.env[key] = value;
  }
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return value.slice(1, -1);
    }
  }

  return value;
}
