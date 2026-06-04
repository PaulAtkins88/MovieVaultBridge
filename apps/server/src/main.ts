import cors from '@fastify/cors';
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ExecuteCopyUseCase } from './application/copying/ExecuteCopyUseCase.js';
import { CopyExecutionJobSnapshot, CopyJobProgress } from './application/dto/CopyExecutionJob.js';
import { mapDashboardSnapshot } from './application/dto/DashboardSnapshotMapper.js';
import { MatchMovieUseCase } from './application/matching/MatchMovieUseCase.js';
import { NormalizationService } from './application/matching/NormalizationService.js';
import { PlanDryRunUseCase } from './application/planning/PlanDryRunUseCase.js';
import { ScanLibraryUseCase } from './application/scanning/ScanLibraryUseCase.js';
import { loadConfig, resolveWorkspacePath } from './config/index.js';
import { ReviewDecisionAction } from './domain/review/ReviewDecision.js';
import { NodeLibraryScanner } from './infrastructure/filesystem/NodeLibraryScanner.js';
import { NfoMetadataReader } from './infrastructure/metadata/NfoMetadataReader.js';
import { SqliteLibraryCache } from './infrastructure/persistence/SqliteLibraryCache.js';

const baseConfig = loadConfig();
const libraryCache = new SqliteLibraryCache(baseConfig.DATABASE_PATH);
let runtimePathSettings = libraryCache.getRuntimePathSettings({
  sourceRoot: baseConfig.SOURCE_ROOT,
  targetRoot: baseConfig.TARGET_ROOT,
  sandboxTargetRoot: baseConfig.SANDBOX_TARGET_ROOT
});
const normalizationService = new NormalizationService();
const metadataReader = new NfoMetadataReader();
const scanner = new NodeLibraryScanner(
  {
    sourceRoot: runtimePathSettings.sourceRoot,
    targetRoot: runtimePathSettings.targetRoot,
    targetNamingSampleSize: baseConfig.TARGET_NAMING_SAMPLE_SIZE
  },
  normalizationService,
  metadataReader
);
const matcher = new MatchMovieUseCase({
  highConfidence: baseConfig.HIGH_CONFIDENCE_THRESHOLD,
  reviewConfidence: baseConfig.REVIEW_CONFIDENCE_THRESHOLD
});
const scanLibraryUseCase = new ScanLibraryUseCase(scanner, matcher, libraryCache);
const planDryRunUseCase = new PlanDryRunUseCase(normalizationService);
const executeCopyUseCase = new ExecuteCopyUseCase();
let currentCopyJob: CopyExecutionJobSnapshot | null = null;

syncScannerSettings();

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty'
    }
  }
});

await app.register(cors, {
  origin: true
});

app.get('/api/health', async () => ({
  status: 'ok',
  copyEnabled: baseConfig.COPY_EXECUTION_ENABLED,
  realCopyEnabled: baseConfig.REAL_COPY_ENABLED,
  databasePath: baseConfig.DATABASE_PATH
}));

app.get('/api/settings', async () => ({
  ...buildSettingsResponse()
}));

const settingsUpdateSchema = z.object({
  sourceRoot: z.string().min(1),
  targetRoot: z.string().min(1),
  sandboxTargetRoot: z.string().min(1)
});

app.put('/api/settings', async (request) => {
  const body = settingsUpdateSchema.parse(request.body ?? {});
  runtimePathSettings = libraryCache.saveRuntimePathSettings({
    sourceRoot: resolveWorkspacePath(body.sourceRoot),
    targetRoot: resolveWorkspacePath(body.targetRoot),
    sandboxTargetRoot: resolveWorkspacePath(body.sandboxTargetRoot)
  });
  syncScannerSettings();

  return buildSettingsResponse();
});

const reviewDecisionSchema = z.object({
  sourceKey: z.string().min(1),
  sourceFolder: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceYear: z.number().int().nullable(),
  action: z.enum(['copy', 'skip', 'upgrade', 'clear']),
  targetFolder: z.string().nullable().optional()
});

app.post('/api/review-decisions', async (request) => {
  const body = reviewDecisionSchema.parse(request.body ?? {});

  if (body.action === 'clear') {
    libraryCache.deleteReviewDecision(body.sourceKey);
  } else {
    libraryCache.saveReviewDecision({
      sourceKey: body.sourceKey,
      sourceFolder: body.sourceFolder,
      sourceTitle: body.sourceTitle,
      sourceYear: body.sourceYear,
      action: body.action as ReviewDecisionAction,
      targetFolder: body.targetFolder ?? null,
      updatedAt: new Date().toISOString()
    });
  }

  const summary = await scanLibraryUseCase.execute();
  const snapshot = mapDashboardSnapshot(summary, getEffectiveConfig());
  libraryCache.saveDashboard(snapshot);
  return snapshot;
});

app.post('/api/dashboard/refresh', async () => {
  const summary = await scanLibraryUseCase.execute();
  const snapshot = mapDashboardSnapshot(summary, getEffectiveConfig());
  libraryCache.saveDashboard(snapshot);
  return snapshot;
});

app.post('/api/target-inventory/refresh', async () => {
  const summary = await scanLibraryUseCase.execute({ refreshTargetInventory: true });
  const snapshot = mapDashboardSnapshot(summary, getEffectiveConfig());
  libraryCache.saveDashboard(snapshot);
  return snapshot;
});

app.post('/api/dry-run-plan', async () => {
  const summary = await scanLibraryUseCase.execute();
  return planDryRunUseCase.execute(summary.assessments, runtimePathSettings.sandboxTargetRoot);
});

const copyRequestSchema = z.object({
  mode: z.enum(['sandbox', 'target']).default('sandbox'),
  confirmation: z.string().optional()
});

app.post('/api/copy/execute', async (request, reply) => {
  const body = copyRequestSchema.parse(request.body ?? {});

  if (!baseConfig.COPY_EXECUTION_ENABLED) {
    return reply.code(409).send({
      error: 'Copy execution is disabled. Set COPY_EXECUTION_ENABLED=true to allow sandbox copy execution.'
    });
  }

  if (body.mode === 'target') {
    if (!baseConfig.REAL_COPY_ENABLED) {
      return reply.code(409).send({
        error: 'Real target copy is disabled. Set REAL_COPY_ENABLED=true after sandbox validation.'
      });
    }

    if (body.confirmation !== 'COPY TO TARGET') {
      return reply.code(400).send({
        error: 'Real target copy requires confirmation="COPY TO TARGET".'
      });
    }
  }

  if (currentCopyJob && (currentCopyJob.status === 'preparing' || currentCopyJob.status === 'running')) {
    return reply.code(409).send({
      error: 'A copy job is already running. Wait for it to finish before starting another.'
    });
  }

  const destinationRoot = body.mode === 'target' ? runtimePathSettings.targetRoot : runtimePathSettings.sandboxTargetRoot;
  currentCopyJob = createCopyJob(body.mode, destinationRoot);
  void runCopyJob(body.mode, destinationRoot);

  return reply.code(202).send(currentCopyJob);
});

app.get('/api/copy/jobs/current', async () => {
  return {
    currentJob: currentCopyJob,
    latestReport: libraryCache.getLatestCopyReport()
  };
});

app.get('/api/copy/report', async () => {
  return libraryCache.getLatestCopyReport();
});

app.get('/api/dashboard', async () => {
  const cached = libraryCache.getLatestDashboard();
  if (cached) {
    return cached;
  }

  const summary = await scanLibraryUseCase.execute();
  const snapshot = mapDashboardSnapshot(summary, getEffectiveConfig());
  libraryCache.saveDashboard(snapshot);
  return snapshot;
});

function buildSettingsResponse() {
  const effectiveConfig = getEffectiveConfig();
  return {
    sourceRoot: effectiveConfig.SOURCE_ROOT,
    targetRoot: effectiveConfig.TARGET_ROOT,
    sandboxTargetRoot: effectiveConfig.SANDBOX_TARGET_ROOT,
    databasePath: effectiveConfig.DATABASE_PATH,
    targetNamingSampleSize: effectiveConfig.TARGET_NAMING_SAMPLE_SIZE,
    highConfidenceThreshold: effectiveConfig.HIGH_CONFIDENCE_THRESHOLD,
    reviewConfidenceThreshold: effectiveConfig.REVIEW_CONFIDENCE_THRESHOLD,
    copyEnabled: effectiveConfig.COPY_EXECUTION_ENABLED,
    copyExecutionEnabled: effectiveConfig.COPY_EXECUTION_ENABLED,
    realCopyEnabled: effectiveConfig.REAL_COPY_ENABLED
  };
}

function getEffectiveConfig() {
  return {
    ...baseConfig,
    SOURCE_ROOT: runtimePathSettings.sourceRoot,
    TARGET_ROOT: runtimePathSettings.targetRoot,
    SANDBOX_TARGET_ROOT: runtimePathSettings.sandboxTargetRoot
  };
}

function syncScannerSettings(): void {
  scanner.updateOptions({
    sourceRoot: runtimePathSettings.sourceRoot,
    targetRoot: runtimePathSettings.targetRoot,
    targetNamingSampleSize: baseConfig.TARGET_NAMING_SAMPLE_SIZE
  });
}

function createCopyJob(mode: 'sandbox' | 'target', destinationRoot: string): CopyExecutionJobSnapshot {
  return {
    jobId: randomUUID(),
    status: 'preparing',
    mode,
    destinationRoot,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: {
      totalItems: 0,
      completedItems: 0,
      totalFiles: 0,
      completedFiles: 0,
      totalBytes: 0,
      copiedBytes: 0,
      percent: 0,
      currentItem: null,
      currentFile: null
    },
    report: null,
    error: null
  };
}

async function runCopyJob(mode: 'sandbox' | 'target', destinationRoot: string): Promise<void> {
  if (!currentCopyJob) {
    return;
  }

  try {
    const summary = await scanLibraryUseCase.execute({ refreshTargetInventory: mode === 'target' });
    const plan = planDryRunUseCase.execute(summary.assessments, destinationRoot);
    currentCopyJob.progress.totalItems = plan.totalPlannedCopies;
    currentCopyJob.status = 'running';

    const result = await executeCopyUseCase.execute(plan.items, destinationRoot, mode, plan.warnings, {
      onProgress: (progress: CopyJobProgress) => {
        if (!currentCopyJob) {
          return;
        }

        currentCopyJob.status = 'running';
        currentCopyJob.progress = progress;
      }
    });

    currentCopyJob.status = 'completed';
    currentCopyJob.progress = {
      ...currentCopyJob.progress,
      percent: 100,
      currentItem: null,
      currentFile: null
    };
    currentCopyJob.finishedAt = result.executedAt;
    currentCopyJob.report = result;
    currentCopyJob.error = null;
    libraryCache.saveCopyReport(result);

    if (mode === 'target' && result.copiedCount > 0) {
      const refreshedSummary = await scanLibraryUseCase.execute({ refreshTargetInventory: true });
      const snapshot = mapDashboardSnapshot(refreshedSummary, getEffectiveConfig());
      libraryCache.saveDashboard(snapshot);
    }
  } catch (error) {
    currentCopyJob.status = 'failed';
    currentCopyJob.finishedAt = new Date().toISOString();
    currentCopyJob.error = error instanceof Error ? error.message : 'Unknown copy failure';
  }
}

try {
  await app.listen({ port: baseConfig.PORT, host: '127.0.0.1' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
