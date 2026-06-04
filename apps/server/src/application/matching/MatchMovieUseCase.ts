import { MatchAssessment } from '../../domain/matching/MatchAssessment.js';
import { MovieCandidate } from '../../domain/movies/MovieCandidate.js';

export interface MatchThresholds {
  highConfidence: number;
  reviewConfidence: number;
}

export class MatchMovieUseCase {
  public constructor(private readonly thresholds: MatchThresholds) {}

  public execute(sourceMovies: MovieCandidate[], targetMovies: MovieCandidate[]): MatchAssessment[] {
    return sourceMovies.map((source) => this.matchSingle(source, targetMovies));
  }

  private matchSingle(source: MovieCandidate, targetMovies: MovieCandidate[]): MatchAssessment {
    let bestTarget: MovieCandidate | null = null;
    let bestScore = 0;
    let reasons: string[] = ['No convincing match found'];

    for (const candidate of targetMovies) {
      const { score, scoreReasons } = this.scorePair(source, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestTarget = candidate;
        reasons = scoreReasons;
      }
    }

    if (!bestTarget || bestScore < this.thresholds.reviewConfidence) {
      const safeToAutoCopy = this.isSafeToAutoCopy(source, bestScore, bestTarget);
      return new MatchAssessment({
        source,
        target: bestTarget,
        confidence: Number(bestScore.toFixed(2)),
        disposition: safeToAutoCopy ? 'copy' : 'review',
        reasons: safeToAutoCopy
          ? ['No target duplicate found. Ready to copy as a new movie.']
          : this.buildLowEvidenceReasons(source, bestTarget, bestScore)
      });
    }

    if (bestScore >= this.thresholds.highConfidence) {
      const upgrade = this.isLikelyUpgrade(source, bestTarget);
      return new MatchAssessment({
        source,
        target: bestTarget,
        confidence: Number(bestScore.toFixed(2)),
        disposition: upgrade ? 'upgrade' : 'skip',
        reasons: upgrade ? [...reasons, 'Source file looks larger than the target and may be an upgrade.'] : reasons
      });
    }

    return new MatchAssessment({
      source,
      target: bestTarget,
      confidence: Number(bestScore.toFixed(2)),
      disposition: 'review',
      reasons
    });
  }

  private scorePair(source: MovieCandidate, target: MovieCandidate): { score: number; scoreReasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    if (source.identity.imdbId && target.identity.imdbId && source.identity.imdbId === target.identity.imdbId) {
      score += 0.75;
      reasons.push('IMDb IDs match.');
    }

    if (source.identity.tmdbId && target.identity.tmdbId && source.identity.tmdbId === target.identity.tmdbId) {
      score += 0.75;
      reasons.push('TMDb IDs match.');
    }

    if (source.identity.normalizedTitle === target.identity.normalizedTitle) {
      score += 0.67;
      reasons.push('Normalized titles match exactly.');
    } else {
      const similarity = this.calculateTokenSimilarity(
        source.identity.normalizedTitle,
        target.identity.normalizedTitle
      );
      if (similarity > 0.55) {
        score += similarity * 0.5;
        reasons.push(`Titles are ${Math.round(similarity * 100)}% similar.`);
      }
    }

    if (source.identity.year && target.identity.year) {
      const yearGap = Math.abs(source.identity.year - target.identity.year);
      if (yearGap === 0) {
        score += 0.28;
        reasons.push('Years match.');
      } else if (yearGap === 1) {
        score += 0.08;
        reasons.push('Years are one year apart.');
      }
    }

    return { score: Math.min(1, score), scoreReasons: reasons.length > 0 ? reasons : ['Weak similarity only.'] };
  }

  private calculateTokenSimilarity(left: string, right: string): number {
    const leftTokens = new Set(left.split(' ').filter(Boolean));
    const rightTokens = new Set(right.split(' ').filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) {
      return 0;
    }

    let shared = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        shared += 1;
      }
    }

    return (2 * shared) / (leftTokens.size + rightTokens.size);
  }

  private isLikelyUpgrade(source: MovieCandidate, target: MovieCandidate): boolean {
    if (!source.mainVideo || !target.mainVideo) {
      return false;
    }

    return source.mainVideo.sizeInBytes > target.mainVideo.sizeInBytes * 1.1;
  }

  private isSafeToAutoCopy(source: MovieCandidate, bestScore: number, bestTarget: MovieCandidate | null): boolean {
    if (!source.mainVideo) {
      return false;
    }

    const hasCanonicalId = Boolean(source.identity.imdbId || source.identity.tmdbId);
    const hasYear = source.identity.year !== null;
    if (!hasCanonicalId && !hasYear) {
      return false;
    }

    if (bestTarget && bestScore >= 0.45) {
      return false;
    }

    return true;
  }

  private buildLowEvidenceReasons(source: MovieCandidate, bestTarget: MovieCandidate | null, bestScore: number): string[] {
    const reasons: string[] = [];

    if (!source.mainVideo) {
      reasons.push('No main video file was identified, so this cannot be auto-copied.');
    }

    if (!source.identity.year && !source.identity.imdbId && !source.identity.tmdbId) {
      reasons.push('This movie has no year or metadata ID, so it requires manual review before any copy plan.');
    }

    if (bestTarget && bestScore >= 0.45) {
      reasons.push(`A nearby target match exists at ${Math.round(bestScore * 100)}% confidence, so this requires manual review.`);
    }

    return reasons.length > 0 ? reasons : ['This movie does not have enough evidence for unattended copy planning.'];
  }
}
