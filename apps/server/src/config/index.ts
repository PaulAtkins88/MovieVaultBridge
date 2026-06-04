import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

loadEnvFile(path.resolve(process.cwd(), '../../.env'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

const workspaceRoot = path.resolve(process.cwd(), '../..');

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

const configSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SOURCE_ROOT: z.string().min(1).default('data/source-library'),
  TARGET_ROOT: z.string().min(1).default('data/target-library'),
  SANDBOX_TARGET_ROOT: z.string().min(1).default('data/sandbox-target'),
  TARGET_NAMING_SAMPLE_SIZE: z.coerce.number().int().positive().default(120),
  HIGH_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
  REVIEW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
  DATABASE_PATH: z.string().min(1).default('data/movie-vault-bridge.sqlite'),
  COPY_EXECUTION_ENABLED: envBoolean.default(false),
  REAL_COPY_ENABLED: envBoolean.default(false),
  TMDB_API_TOKEN: z.string().optional(),
  OMDB_API_KEY: z.string().optional()
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const parsed = configSchema.parse(process.env);
  return {
    ...parsed,
    SANDBOX_TARGET_ROOT: resolveWorkspacePath(parsed.SANDBOX_TARGET_ROOT),
    DATABASE_PATH: resolveWorkspacePath(parsed.DATABASE_PATH)
  };
}

export function getConfigWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];

  if (!existsSync(config.SOURCE_ROOT)) {
    warnings.push(`Source root not found: ${config.SOURCE_ROOT}`);
  }

  if (!existsSync(config.TARGET_ROOT)) {
    warnings.push(`Target root not found: ${config.TARGET_ROOT}`);
  }

  return warnings;
}

export function resolveWorkspacePath(targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(workspaceRoot, targetPath);
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const fileContents = readFileSync(filePath, 'utf8');
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
