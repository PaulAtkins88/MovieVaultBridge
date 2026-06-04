import { CopyExecutionResult } from './CopyExecutionResult.js';

export type CopyJobStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed';

export interface CopyJobProgress {
  totalItems: number;
  completedItems: number;
  totalFiles: number;
  completedFiles: number;
  totalBytes: number;
  copiedBytes: number;
  percent: number;
  currentItem: string | null;
  currentFile: string | null;
}

export interface CopyExecutionJobSnapshot {
  jobId: string;
  status: CopyJobStatus;
  mode: 'sandbox' | 'target';
  destinationRoot: string;
  startedAt: string;
  finishedAt: string | null;
  progress: CopyJobProgress;
  report: CopyExecutionResult | null;
  error: string | null;
}