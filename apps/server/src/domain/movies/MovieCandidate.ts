import { MovieIdentity } from './MovieIdentity.js';

export interface MediaAsset {
  path: string;
  extension: string;
  sizeInBytes: number;
}

export interface SubtitleAsset {
  path: string;
  extension: string;
  languageHint: string | null;
}

export interface MetadataEvidence {
  source: 'folder-name' | 'nfo' | 'movie.xml';
  title: string | undefined;
  year: number | null | undefined;
  imdbId: string | undefined;
  tmdbId: string | undefined;
}

export interface MovieCandidateProps {
  rootPath: string;
  folderName: string;
  folderPath: string;
  identity: MovieIdentity;
  mainVideo: MediaAsset | null;
  subtitles: SubtitleAsset[];
  metadataEvidence: MetadataEvidence[];
}

export interface SerializedMovieCandidate {
  rootPath: string;
  folderName: string;
  folderPath: string;
  identity: {
    canonicalTitle: string;
    normalizedTitle: string;
    year: number | null;
    imdbId: string | undefined;
    tmdbId: string | undefined;
  };
  mainVideo: MediaAsset | null;
  subtitles: SubtitleAsset[];
  metadataEvidence: MetadataEvidence[];
}

export class MovieCandidate {
  public readonly rootPath: string;
  public readonly folderName: string;
  public readonly folderPath: string;
  public readonly identity: MovieIdentity;
  public readonly mainVideo: MediaAsset | null;
  public readonly subtitles: SubtitleAsset[];
  public readonly metadataEvidence: MetadataEvidence[];

  public constructor(props: MovieCandidateProps) {
    this.rootPath = props.rootPath;
    this.folderName = props.folderName;
    this.folderPath = props.folderPath;
    this.identity = props.identity;
    this.mainVideo = props.mainVideo;
    this.subtitles = props.subtitles;
    this.metadataEvidence = props.metadataEvidence;
  }

  public get sourceKey(): string {
    return `${this.rootPath}::${this.folderPath}`.toLowerCase();
  }

  public static fromSerialized(candidate: SerializedMovieCandidate): MovieCandidate {
    return new MovieCandidate({
      rootPath: candidate.rootPath,
      folderName: candidate.folderName,
      folderPath: candidate.folderPath,
      identity: new MovieIdentity(candidate.identity),
      mainVideo: candidate.mainVideo,
      subtitles: candidate.subtitles,
      metadataEvidence: candidate.metadataEvidence
    });
  }

  public toSerialized(): SerializedMovieCandidate {
    return {
      rootPath: this.rootPath,
      folderName: this.folderName,
      folderPath: this.folderPath,
      identity: {
        canonicalTitle: this.identity.canonicalTitle,
        normalizedTitle: this.identity.normalizedTitle,
        year: this.identity.year,
        imdbId: this.identity.imdbId,
        tmdbId: this.identity.tmdbId
      },
      mainVideo: this.mainVideo,
      subtitles: this.subtitles,
      metadataEvidence: this.metadataEvidence
    };
  }
}
