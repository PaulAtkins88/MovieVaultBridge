export interface DryRunPlanFile {
  sourcePath: string;
  destinationPath: string;
  kind: 'video' | 'subtitle';
  overwriteExisting?: boolean;
}

export interface DryRunPlanItem {
  action: 'copy' | 'upgrade';
  sourceFolder: string;
  title: string;
  year: number | null;
  destinationFolder: string;
  video: DryRunPlanFile | null;
  subtitles: DryRunPlanFile[];
  reasons: string[];
}

export interface DryRunPlan {
  generatedAt: string;
  destinationRoot: string;
  mode: 'sandbox';
  copyEnabled: false;
  totalCandidateFiles: number;
  totalPlannedCopies: number;
  items: DryRunPlanItem[];
  warnings: string[];
}