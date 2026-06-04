export type ReviewDecisionAction = 'copy' | 'skip' | 'upgrade';

export interface ReviewDecision {
  sourceKey: string;
  sourceFolder: string;
  sourceTitle: string;
  sourceYear: number | null;
  action: ReviewDecisionAction;
  targetFolder: string | null;
  updatedAt: string;
}