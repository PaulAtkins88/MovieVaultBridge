import { MovieCandidate } from '../movies/MovieCandidate.js';
import { ReviewDecision } from '../review/ReviewDecision.js';

export type MatchDisposition = 'copy' | 'review' | 'skip' | 'upgrade' | 'upgrade-approved';

export interface MatchAssessmentProps {
  source: MovieCandidate;
  target: MovieCandidate | null;
  confidence: number;
  disposition: MatchDisposition;
  reasons: string[];
  suggestedDisposition?: MatchDisposition;
  reviewDecision?: ReviewDecision | null;
}

export class MatchAssessment {
  public readonly source: MovieCandidate;
  public readonly target: MovieCandidate | null;
  public readonly confidence: number;
  public readonly disposition: MatchDisposition;
  public readonly reasons: string[];
  public readonly suggestedDisposition: MatchDisposition;
  public readonly reviewDecision: ReviewDecision | null;

  public constructor(props: MatchAssessmentProps) {
    this.source = props.source;
    this.target = props.target;
    this.confidence = props.confidence;
    this.disposition = props.disposition;
    this.reasons = props.reasons;
    this.suggestedDisposition = props.suggestedDisposition ?? props.disposition;
    this.reviewDecision = props.reviewDecision ?? null;
  }
}
