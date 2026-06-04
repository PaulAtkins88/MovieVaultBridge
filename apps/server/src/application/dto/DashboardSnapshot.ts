export interface DashboardQueueItem {
  sourceKey: string;
  sourceFolder: string;
  sourceTitle?: string;
  sourceYear?: number | null;
  targetFolder: string | null;
  confidence?: number;
  subtitles?: number;
  suggestedDisposition?: 'copy' | 'review' | 'skip' | 'upgrade' | 'upgrade-approved';
  decisionAction?: 'copy' | 'skip' | 'upgrade' | null;
  decisionUpdatedAt?: string | null;
  reasons: string[];
}

export interface DashboardSourceSample {
  folderName: string;
  title: string;
  year: number | null;
  subtitleCount: number;
  hasMainVideo: boolean;
  evidenceSources: string[];
}

export interface DashboardSnapshot {
  scannedAt: string;
  snapshotSource: 'live' | 'cache';
  scanWarnings: string[];
  targetInventory: {
    source: 'live' | 'cache';
    scannedAt: string;
    totalMovies: number;
    namingSampleSize: number;
  };
  config: {
    sourceRoot: string;
    targetRoot: string;
    sandboxTargetRoot: string;
    databasePath: string;
    targetNamingSampleSize: number;
    highConfidenceThreshold: number;
    reviewConfidenceThreshold: number;
    copyExecutionEnabled: boolean;
    realCopyEnabled: boolean;
  };
  overview: {
    sourceMovies: number;
    targetMovies: number;
    copyCandidates: number;
    reviewCandidates: number;
    upgrades: number;
    skipped: number;
  };
  namingInsight: {
    dominantPattern: string;
    sampledTargetFolders: string[];
  };
  sourceSamples: DashboardSourceSample[];
  topReviewCandidates: DashboardQueueItem[];
  topCopyCandidates: DashboardQueueItem[];
  topUpgradeCandidates: DashboardQueueItem[];
}
