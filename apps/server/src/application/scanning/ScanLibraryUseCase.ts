import { MatchAssessment, MatchDisposition } from '../../domain/matching/MatchAssessment.js';
import { MovieCandidate } from '../../domain/movies/MovieCandidate.js';
import { ReviewDecision } from '../../domain/review/ReviewDecision.js';
import { NodeLibraryScanner } from '../../infrastructure/filesystem/NodeLibraryScanner.js';
import { SqliteLibraryCache, TargetInventorySnapshot } from '../../infrastructure/persistence/SqliteLibraryCache.js';
import { MatchMovieUseCase } from '../matching/MatchMovieUseCase.js';

export interface ScanSummary {
  sourceMovies: MovieCandidate[];
  targetMovies: MovieCandidate[];
  targetSampleMovies: MovieCandidate[];
  targetInventorySource: 'live' | 'cache';
  targetInventoryScannedAt: string;
  assessments: ReturnType<MatchMovieUseCase['execute']>;
}

export interface ScanOptions {
  refreshTargetInventory?: boolean;
}

export class ScanLibraryUseCase {
  public constructor(
    private readonly scanner: NodeLibraryScanner,
    private readonly matcher: MatchMovieUseCase,
    private readonly libraryCache: SqliteLibraryCache
  ) {}

  public async execute(options: ScanOptions = {}): Promise<ScanSummary> {
    const [sourceMovies, targetInventory] = await Promise.all([
      this.scanner.scanSourceLibrary(),
      this.getTargetInventory(options.refreshTargetInventory === true)
    ]);
    const targetSampleMovies = this.scanner.sampleTargetLibrary(targetInventory.movies);
    const automaticAssessments = this.matcher.execute(sourceMovies, targetInventory.movies);
    const assessments = this.applyReviewDecisions(automaticAssessments, this.libraryCache.getReviewDecisions());

    return {
      sourceMovies,
      targetMovies: targetInventory.movies,
      targetSampleMovies,
      targetInventorySource: targetInventory.source,
      targetInventoryScannedAt: targetInventory.capturedAt,
      assessments
    };
  }

  private applyReviewDecisions(
    assessments: MatchAssessment[],
    decisions: Map<string, ReviewDecision>
  ): MatchAssessment[] {
    return assessments.map((assessment) => {
      const decision = decisions.get(assessment.source.sourceKey) ?? null;
      if (!decision) {
        return new MatchAssessment({
          source: assessment.source,
          target: assessment.target,
          confidence: assessment.confidence,
          disposition: assessment.disposition,
          reasons: assessment.reasons,
          suggestedDisposition: assessment.disposition,
          reviewDecision: null
        });
      }

      const disposition = this.resolveDecisionDisposition(assessment, decision);
      const manualReason =
        decision.action === 'copy'
          ? 'Manual decision: approved to copy.'
          : decision.action === 'skip'
            ? 'Manual decision: marked as duplicate or skip.'
            : 'Manual decision: approved as a quality upgrade.';

      return new MatchAssessment({
        source: assessment.source,
        target: assessment.target,
        confidence: assessment.confidence,
        disposition,
        reasons: [...assessment.reasons, manualReason],
        suggestedDisposition: assessment.disposition,
        reviewDecision: decision
      });
    });
  }

  private resolveDecisionDisposition(assessment: MatchAssessment, decision: ReviewDecision): MatchDisposition {
    if (decision.action === 'skip') {
      return 'skip';
    }

    if (decision.action === 'upgrade') {
      return assessment.target ? 'upgrade-approved' : 'copy';
    }

    return 'copy';
  }

  private async getTargetInventory(forceRefresh: boolean): Promise<TargetInventorySnapshot> {
    if (!forceRefresh) {
      const cached = this.libraryCache.getTargetInventory(this.scanner.getTargetRoot());
      if (cached) {
        return cached;
      }
    }

    const movies = await this.scanner.scanTargetLibrary();
    return this.libraryCache.saveTargetInventory(this.scanner.getTargetRoot(), movies);
  }
}
