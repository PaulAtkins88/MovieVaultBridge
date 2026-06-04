export interface MovieIdentityProps {
  canonicalTitle: string;
  normalizedTitle: string;
  year: number | null;
  imdbId: string | undefined;
  tmdbId: string | undefined;
}

export class MovieIdentity {
  public readonly canonicalTitle: string;
  public readonly normalizedTitle: string;
  public readonly year: number | null;
  public readonly imdbId: string | undefined;
  public readonly tmdbId: string | undefined;

  public constructor(props: MovieIdentityProps) {
    this.canonicalTitle = props.canonicalTitle;
    this.normalizedTitle = props.normalizedTitle;
    this.year = props.year;
    this.imdbId = props.imdbId;
    this.tmdbId = props.tmdbId;
  }
}
