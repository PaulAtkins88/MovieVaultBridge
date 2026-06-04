import { existsSync } from 'node:fs';
import path from 'node:path';
import { MatchAssessment } from '../../domain/matching/MatchAssessment.js';
import { MovieCandidate, SubtitleAsset } from '../../domain/movies/MovieCandidate.js';
import { DryRunPlan, DryRunPlanFile, DryRunPlanItem } from '../dto/DryRunPlan.js';
import { NormalizationService } from '../matching/NormalizationService.js';

export class PlanDryRunUseCase {
  public constructor(private readonly normalizationService: NormalizationService) {}

  public execute(
    assessments: MatchAssessment[],
    destinationRoot: string
  ): DryRunPlan {
    const resolvedDestinationRoot = path.resolve(destinationRoot);
    const items = assessments
      .filter(
        (assessment) => assessment.disposition === 'copy' || assessment.disposition === 'upgrade-approved'
      )
      .map((assessment) => this.planItem(assessment, resolvedDestinationRoot))
      .filter((item): item is DryRunPlanItem => item !== null);

    const warnings: string[] = [];
    if (!existsSync(resolvedDestinationRoot)) {
      warnings.push(
        `Sandbox target does not exist yet. This is expected until copy execution is implemented: ${resolvedDestinationRoot}`
      );
    }
    if (items.length === 0) {
      warnings.push('No copy candidates are currently available for dry-run planning.');
    }

    return {
      generatedAt: new Date().toISOString(),
      destinationRoot: resolvedDestinationRoot,
      mode: 'sandbox',
      copyEnabled: false,
      totalCandidateFiles: items.reduce((total, item) => total + (item.video ? 1 : 0) + item.subtitles.length, 0),
      totalPlannedCopies: items.length,
      items,
      warnings
    };
  }

  private planItem(assessment: MatchAssessment, destinationRoot: string): DryRunPlanItem | null {
    if (assessment.disposition === 'upgrade-approved') {
      return this.planUpgradeItem(assessment, destinationRoot);
    }

    return this.planCopyItem(assessment.source, assessment.reasons, destinationRoot);
  }

  private planCopyItem(source: MovieCandidate, reasons: string[], destinationRoot: string): DryRunPlanItem | null {
    if (!source.mainVideo) {
      return null;
    }

    const destinationFolderName = this.normalizationService.formatTargetFolderName(
      source.identity.canonicalTitle,
      source.identity.year
    );
    const destinationFolder = path.join(destinationRoot, destinationFolderName);
    const videoBaseName = destinationFolderName;
    const video: DryRunPlanFile = {
      kind: 'video',
      sourcePath: source.mainVideo.path,
      destinationPath: path.join(destinationFolder, `${videoBaseName}${source.mainVideo.extension}`)
    };

    const subtitles = source.subtitles.map((subtitle) =>
      this.planSubtitle(subtitle, destinationFolder, videoBaseName)
    );

    return {
      action: 'copy',
      sourceFolder: source.folderName,
      title: source.identity.canonicalTitle,
      year: source.identity.year,
      destinationFolder,
      video,
      subtitles,
      reasons
    };
  }

  private planUpgradeItem(assessment: MatchAssessment, destinationRoot: string): DryRunPlanItem | null {
    if (!assessment.source.mainVideo || !assessment.target) {
      return null;
    }

    const targetFolder = this.resolveUpgradeDestinationFolder(assessment.target, destinationRoot);
    const targetVideoBaseName = assessment.target.mainVideo
      ? path.basename(assessment.target.mainVideo.path, assessment.target.mainVideo.extension)
      : assessment.target.folderName;
    const targetVideoFileName = assessment.target.mainVideo
      ? path.basename(assessment.target.mainVideo.path)
      : `${targetVideoBaseName}${assessment.source.mainVideo.extension}`;
    const videoDestinationPath = path.join(targetFolder, targetVideoFileName);
    const video: DryRunPlanFile = {
      kind: 'video',
      sourcePath: assessment.source.mainVideo.path,
      destinationPath: videoDestinationPath,
      overwriteExisting: true
    };

    const subtitles = assessment.source.subtitles.map((subtitle) => ({
      ...this.planSubtitle(subtitle, targetFolder, targetVideoBaseName),
      overwriteExisting: true
    }));

    return {
      action: 'upgrade',
      sourceFolder: assessment.source.folderName,
      title: assessment.source.identity.canonicalTitle,
      year: assessment.source.identity.year,
      destinationFolder: targetFolder,
      video,
      subtitles,
      reasons: assessment.reasons
    };
  }

  private resolveUpgradeDestinationFolder(target: MovieCandidate, destinationRoot: string): string {
    return path.resolve(destinationRoot) === path.resolve(target.rootPath)
      ? target.folderPath
      : path.join(destinationRoot, target.folderName);
  }

  private planSubtitle(subtitle: SubtitleAsset, destinationFolder: string, videoBaseName: string): DryRunPlanFile {
    const languageSuffix = subtitle.languageHint ? `.${subtitle.languageHint}` : '';

    return {
      kind: 'subtitle',
      sourcePath: subtitle.path,
      destinationPath: path.join(destinationFolder, `${videoBaseName}${languageSuffix}${subtitle.extension}`)
    };
  }
}