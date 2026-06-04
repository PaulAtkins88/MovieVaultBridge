import { AppConfig, getConfigWarnings } from '../../config/index.js';
import { MatchAssessment } from '../../domain/matching/MatchAssessment.js';
import { MovieCandidate } from '../../domain/movies/MovieCandidate.js';
import { DashboardQueueItem, DashboardSnapshot } from './DashboardSnapshot.js';

interface ScanSummaryLike {
  sourceMovies: MovieCandidate[];
  targetMovies: MovieCandidate[];
  targetSampleMovies: MovieCandidate[];
  targetInventorySource: 'live' | 'cache';
  targetInventoryScannedAt: string;
  assessments: MatchAssessment[];
}

export function mapDashboardSnapshot(summary: ScanSummaryLike, config: AppConfig): DashboardSnapshot {
  const copyCandidates = summary.assessments.filter((item) => item.disposition === 'copy');
  const reviewCandidates = summary.assessments.filter((item) => item.disposition === 'review');
  const skipped = summary.assessments.filter((item) => item.disposition === 'skip');
  const upgrades = summary.assessments.filter(
    (item) => item.disposition === 'upgrade' || item.disposition === 'upgrade-approved'
  );

  return {
    scannedAt: new Date().toISOString(),
    snapshotSource: 'live',
    scanWarnings: getConfigWarnings(config),
    targetInventory: {
      source: summary.targetInventorySource,
      scannedAt: summary.targetInventoryScannedAt,
      totalMovies: summary.targetMovies.length,
      namingSampleSize: summary.targetSampleMovies.length
    },
    config: {
      sourceRoot: config.SOURCE_ROOT,
      targetRoot: config.TARGET_ROOT,
      sandboxTargetRoot: config.SANDBOX_TARGET_ROOT,
      databasePath: config.DATABASE_PATH,
      targetNamingSampleSize: config.TARGET_NAMING_SAMPLE_SIZE,
      highConfidenceThreshold: config.HIGH_CONFIDENCE_THRESHOLD,
      reviewConfidenceThreshold: config.REVIEW_CONFIDENCE_THRESHOLD,
      copyExecutionEnabled: config.COPY_EXECUTION_ENABLED,
      realCopyEnabled: config.REAL_COPY_ENABLED
    },
    overview: {
      sourceMovies: summary.sourceMovies.length,
      targetMovies: summary.targetMovies.length,
      copyCandidates: copyCandidates.length,
      reviewCandidates: reviewCandidates.length,
      upgrades: upgrades.length,
      skipped: skipped.length
    },
    namingInsight: {
      dominantPattern: 'Title (Year)',
      sampledTargetFolders: summary.targetSampleMovies.slice(0, 8).map((movie) => movie.folderName)
    },
    sourceSamples: summary.sourceMovies.slice(0, 8).map((movie) => ({
      folderName: movie.folderName,
      title: movie.identity.canonicalTitle,
      year: movie.identity.year,
      subtitleCount: movie.subtitles.length,
      hasMainVideo: movie.mainVideo !== null,
      evidenceSources: movie.metadataEvidence.map((evidence) => evidence.source)
    })),
    topReviewCandidates: reviewCandidates.map(mapReviewItem),
    topCopyCandidates: copyCandidates.map(mapCopyItem),
    topUpgradeCandidates: upgrades.map(mapReviewItem)
  };
}

function mapReviewItem(assessment: MatchAssessment): DashboardQueueItem {
  return {
    sourceKey: assessment.source.sourceKey,
    sourceFolder: assessment.source.folderName,
    sourceTitle: assessment.source.identity.canonicalTitle,
    sourceYear: assessment.source.identity.year,
    targetFolder: assessment.target?.folderName ?? null,
    confidence: assessment.confidence,
    suggestedDisposition: assessment.suggestedDisposition,
    decisionAction: assessment.reviewDecision?.action ?? null,
    decisionUpdatedAt: assessment.reviewDecision?.updatedAt ?? null,
    reasons: assessment.reasons
  };
}

function mapCopyItem(assessment: MatchAssessment): DashboardQueueItem {
  return {
    sourceKey: assessment.source.sourceKey,
    sourceFolder: assessment.source.folderName,
    sourceTitle: assessment.source.identity.canonicalTitle,
    sourceYear: assessment.source.identity.year,
    targetFolder: assessment.target?.folderName ?? null,
    subtitles: assessment.source.subtitles.length,
    suggestedDisposition: assessment.suggestedDisposition,
    decisionAction: assessment.reviewDecision?.action ?? null,
    decisionUpdatedAt: assessment.reviewDecision?.updatedAt ?? null,
    reasons: assessment.reasons
  };
}
