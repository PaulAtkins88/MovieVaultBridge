import { constants, createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { CopyJobProgress } from '../dto/CopyExecutionJob.js';
import { CopyExecutionFileResult, CopyExecutionItemResult, CopyExecutionMode, CopyExecutionResult } from '../dto/CopyExecutionResult.js';
import { DryRunPlanFile, DryRunPlanItem } from '../dto/DryRunPlan.js';

export interface ExecuteCopyCallbacks {
  onProgress?: (progress: CopyJobProgress) => void;
}

export class ExecuteCopyUseCase {
  public async execute(
    items: DryRunPlanItem[],
    destinationRoot: string,
    mode: CopyExecutionMode,
    warnings: string[] = [],
    callbacks: ExecuteCopyCallbacks = {}
  ): Promise<CopyExecutionResult> {
    const resolvedDestinationRoot = path.resolve(destinationRoot);
    const results: CopyExecutionItemResult[] = [];
    const progress = await this.createInitialProgress(items);
    callbacks.onProgress?.(progress);

    for (const item of items) {
      progress.currentItem = item.sourceFolder;
      callbacks.onProgress?.(this.withPercent(progress));
      results.push(await this.copyItem(item, resolvedDestinationRoot, progress, callbacks));
      progress.completedItems += 1;
      progress.currentItem = null;
      callbacks.onProgress?.(this.withPercent(progress));
    }

    return {
      executedAt: new Date().toISOString(),
      mode,
      destinationRoot: resolvedDestinationRoot,
      copyEnabled: true,
      totalCandidates: items.length,
      copiedCount: results.filter((item) => item.status === 'copied').length,
      skippedCount: results.filter((item) => item.status === 'skipped').length,
      failedCount: results.filter((item) => item.status === 'failed').length,
      warnings,
      items: results
    };
  }

  private async copyItem(
    item: DryRunPlanItem,
    destinationRoot: string,
    progress: CopyJobProgress,
    callbacks: ExecuteCopyCallbacks
  ): Promise<CopyExecutionItemResult> {
    const files = item.video ? [item.video, ...item.subtitles] : [...item.subtitles];
    if (item.video === null) {
      return {
        sourceFolder: item.sourceFolder,
        title: item.title,
        year: item.year,
        destinationFolder: item.destinationFolder,
        status: 'skipped',
        copiedFiles: [],
        reasons: [...item.reasons, 'Skipped because no main video was available to copy.']
      };
    }

    try {
      this.ensurePathWithinRoot(item.destinationFolder, destinationRoot);
      for (const file of files) {
        this.ensurePathWithinRoot(file.destinationPath, destinationRoot);
      }

      const collisions = await this.getCollisionPaths(files.filter((file) => file.overwriteExisting !== true));
      if (collisions.length > 0) {
        return {
          sourceFolder: item.sourceFolder,
          title: item.title,
          year: item.year,
          destinationFolder: item.destinationFolder,
          status: 'skipped',
          copiedFiles: [],
          reasons: [...item.reasons, `Skipped because destination files already exist: ${collisions.join(', ')}`]
        };
      }

      await mkdir(item.destinationFolder, { recursive: true });
      const copiedFiles: CopyExecutionFileResult[] = [];
      for (const file of files) {
        progress.currentFile = file.destinationPath;
        callbacks.onProgress?.(this.withPercent(progress));
        await this.copyFileWithProgress(
          file,
          (bytesCopied) => {
            progress.copiedBytes += bytesCopied;
            callbacks.onProgress?.(this.withPercent(progress));
          }
        );
        progress.completedFiles += 1;
        progress.currentFile = null;
        callbacks.onProgress?.(this.withPercent(progress));
        copiedFiles.push({
          sourcePath: file.sourcePath,
          destinationPath: file.destinationPath,
          kind: file.kind
        });
      }

      return {
        sourceFolder: item.sourceFolder,
        title: item.title,
        year: item.year,
        destinationFolder: item.destinationFolder,
        status: 'copied',
        copiedFiles,
        reasons: item.reasons
      };
    } catch (error) {
      return {
        sourceFolder: item.sourceFolder,
        title: item.title,
        year: item.year,
        destinationFolder: item.destinationFolder,
        status: 'failed',
        copiedFiles: [],
        reasons: item.reasons,
        error: error instanceof Error ? error.message : 'Unknown copy failure'
      };
    }
  }

  private async createInitialProgress(items: DryRunPlanItem[]): Promise<CopyJobProgress> {
    const files = items.flatMap((item) => (item.video ? [item.video, ...item.subtitles] : [...item.subtitles]));
    let totalBytes = 0;
    for (const file of files) {
      const fileStat = await stat(file.sourcePath);
      totalBytes += fileStat.size;
    }

    return {
      totalItems: items.length,
      completedItems: 0,
      totalFiles: files.length,
      completedFiles: 0,
      totalBytes,
      copiedBytes: 0,
      percent: 0,
      currentItem: null,
      currentFile: null
    };
  }

  private withPercent(progress: CopyJobProgress): CopyJobProgress {
    return {
      ...progress,
      percent: progress.totalBytes === 0 ? 100 : Math.min(100, Math.round((progress.copiedBytes / progress.totalBytes) * 100))
    };
  }

  private async copyFileWithProgress(
    file: DryRunPlanFile,
    onBytesCopied: (bytesCopied: number) => void
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(file.sourcePath);
      const writeStream = createWriteStream(file.destinationPath, {
        flags: file.overwriteExisting === true ? 'w' : 'wx'
      });

      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        callback();
      };

      readStream.on('data', (chunk: string | Buffer) => {
        onBytesCopied(typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length);
      });
      readStream.on('error', (error) => finish(() => reject(error)));
      writeStream.on('error', (error) => finish(() => reject(error)));
      writeStream.on('close', () => finish(resolve));
      readStream.pipe(writeStream);
    });
  }

  private ensurePathWithinRoot(candidatePath: string, rootPath: string): void {
    const relativePath = path.relative(rootPath, path.resolve(candidatePath));
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Destination path escapes configured root: ${candidatePath}`);
    }
  }

  private async getCollisionPaths(files: DryRunPlanFile[]): Promise<string[]> {
    const collisions: string[] = [];
    for (const file of files) {
      try {
        await access(file.destinationPath, constants.F_OK);
        collisions.push(file.destinationPath);
      } catch {
        // Destination does not exist yet.
      }
    }

    return collisions;
  }
}