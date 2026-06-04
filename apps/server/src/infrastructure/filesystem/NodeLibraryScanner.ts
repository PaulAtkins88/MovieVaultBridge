import { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { NormalizationService } from '../../application/matching/NormalizationService.js';
import { MediaAsset, MetadataEvidence, MovieCandidate, SubtitleAsset } from '../../domain/movies/MovieCandidate.js';
import { MovieIdentity } from '../../domain/movies/MovieIdentity.js';
import { NfoMetadataReader } from '../metadata/NfoMetadataReader.js';

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.m2ts', '.mov']);
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.sub', '.ass', '.ssa', '.vtt']);
const IGNORED_VIDEO_MARKERS = ['-trailer', ' trailer', 'sample'];

export interface ScannerOptions {
  sourceRoot: string;
  targetRoot: string;
  targetNamingSampleSize: number;
}

export class NodeLibraryScanner {
  public constructor(
    private readonly options: ScannerOptions,
    private readonly normalizationService: NormalizationService,
    private readonly metadataReader: NfoMetadataReader
  ) {}

  public updateOptions(options: Partial<ScannerOptions>): void {
    if (options.sourceRoot) {
      this.options.sourceRoot = options.sourceRoot;
    }

    if (options.targetRoot) {
      this.options.targetRoot = options.targetRoot;
    }

    if (options.targetNamingSampleSize) {
      this.options.targetNamingSampleSize = options.targetNamingSampleSize;
    }
  }

  public getSourceRoot(): string {
    return this.options.sourceRoot;
  }

  public scanSourceLibrary(): Promise<MovieCandidate[]> {
    return this.scanLibrary(this.options.sourceRoot);
  }

  public async scanTargetLibrary(): Promise<MovieCandidate[]> {
    return this.scanLibrary(this.options.targetRoot);
  }

  public sampleTargetLibrary(movies: MovieCandidate[]): MovieCandidate[] {
    return movies.slice(0, this.options.targetNamingSampleSize);
  }

  public getTargetRoot(): string {
    return this.options.targetRoot;
  }

  private async scanLibrary(rootPath: string): Promise<MovieCandidate[]> {
    const entries = await this.getMovieDirectories(rootPath);
    const movies = await Promise.all(entries.map((entry) => this.buildCandidate(rootPath, entry)));
    return movies.filter((movie): movie is MovieCandidate => movie !== null);
  }

  private async getMovieDirectories(rootPath: string): Promise<Dirent[]> {
    try {
      const entries = await readdir(rootPath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch {
      return [];
    }
  }

  private async buildCandidate(rootPath: string, entry: Dirent): Promise<MovieCandidate | null> {
    const folderPath = path.join(rootPath, entry.name);
    let nestedEntries: Dirent[] = [];
    try {
      nestedEntries = await readdir(folderPath, { withFileTypes: true });
    } catch {
      return null;
    }
    const metadataEvidence = await this.collectMetadata(folderPath);
    const parsedFromFolder = this.normalizationService.parseFolderName(entry.name);
    const folderEvidence: MetadataEvidence = {
      source: 'folder-name',
      title: parsedFromFolder.title,
      year: parsedFromFolder.year,
      imdbId: undefined,
      tmdbId: undefined
    };
    metadataEvidence.unshift(folderEvidence);

    const preferredMetadata = metadataEvidence.filter((item) => item.source !== 'folder-name');
    const title = preferredMetadata.find((item) => item.title)?.title ?? folderEvidence.title ?? parsedFromFolder.title;
    const year = preferredMetadata.find((item) => item.year !== undefined)?.year ?? folderEvidence.year ?? parsedFromFolder.year;
    const imdbId = preferredMetadata.find((item) => item.imdbId)?.imdbId;
    const tmdbId = preferredMetadata.find((item) => item.tmdbId)?.tmdbId;

    const mainVideo = await this.findMainVideo(folderPath, nestedEntries);
    const subtitles = this.findSubtitles(folderPath, nestedEntries);

    const identity = new MovieIdentity({
      canonicalTitle: title,
      normalizedTitle: this.normalizationService.normalizeTitle(title),
      year,
      imdbId,
      tmdbId
    });

    return new MovieCandidate({
      rootPath,
      folderName: entry.name,
      folderPath,
      identity,
      mainVideo,
      subtitles,
      metadataEvidence
    });
  }

  private async collectMetadata(folderPath: string): Promise<MetadataEvidence[]> {
    return this.metadataReader.read(folderPath);
  }

  private async findMainVideo(folderPath: string, entries: Dirent[]): Promise<MediaAsset | null> {
    const videoFiles = entries.filter((entry) => {
      if (!entry.isFile()) {
        return false;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) {
        return false;
      }

      const normalizedName = entry.name.toLowerCase();
      return !IGNORED_VIDEO_MARKERS.some((marker) => normalizedName.includes(marker));
    });

    if (videoFiles.length === 0) {
      return null;
    }

    let biggestFile: MediaAsset | null = null;
    for (const video of videoFiles) {
      const filePath = path.join(folderPath, video.name);
      const fileStats = await stat(filePath);
      const current: MediaAsset = {
        path: filePath,
        extension: path.extname(video.name).toLowerCase(),
        sizeInBytes: fileStats.size
      };

      if (!biggestFile || current.sizeInBytes > biggestFile.sizeInBytes) {
        biggestFile = current;
      }
    }

    return biggestFile;
  }

  private findSubtitles(folderPath: string, entries: Dirent[]): SubtitleAsset[] {
    return entries
      .filter((entry) => entry.isFile())
      .filter((entry) => SUBTITLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({
        path: path.join(folderPath, entry.name),
        extension: path.extname(entry.name).toLowerCase(),
        languageHint: this.parseLanguageHint(entry.name)
      }));
  }

  private parseLanguageHint(fileName: string): string | null {
    const nameWithoutExtension = fileName.replace(/\.[^.]+$/, '');
    const parts = nameWithoutExtension.split(/[.\s_-]+/).filter(Boolean);
    const lastPart = parts.at(-1);
    if (!lastPart) {
      return null;
    }

    return /^[a-z]{2,3}$/i.test(lastPart) ? lastPart.toLowerCase() : null;
  }
}
