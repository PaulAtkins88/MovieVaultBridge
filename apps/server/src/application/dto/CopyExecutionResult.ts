export type CopyExecutionMode = 'sandbox' | 'target';
export type CopyExecutionStatus = 'copied' | 'skipped' | 'failed';

export interface CopyExecutionFileResult {
  sourcePath: string;
  destinationPath: string;
  kind: 'video' | 'subtitle';
}

export interface CopyExecutionItemResult {
  sourceFolder: string;
  title: string;
  year: number | null;
  destinationFolder: string;
  status: CopyExecutionStatus;
  copiedFiles: CopyExecutionFileResult[];
  reasons: string[];
  error?: string;
}

export interface CopyExecutionResult {
  executedAt: string;
  mode: CopyExecutionMode;
  destinationRoot: string;
  copyEnabled: true;
  totalCandidates: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  warnings: string[];
  items: CopyExecutionItemResult[];
}