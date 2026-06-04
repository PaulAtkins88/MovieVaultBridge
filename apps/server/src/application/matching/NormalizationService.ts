const STOP_WORDS = new Set(['the', 'a', 'an']);
const NOISE_TOKENS = [
  'extended',
  'directors cut',
  'director s cut',
  'unrated',
  'remastered',
  'special edition',
  'ultimate cut',
  'trailer',
  'bluray',
  'webrip',
  'web-dl',
  '1080p',
  '2160p',
  '720p'
];

export interface ParsedFolderName {
  title: string;
  year: number | null;
}

export class NormalizationService {
  public parseFolderName(folderName: string): ParsedFolderName {
    const match = /^(.*?)\s*\((\d{4})?\)\s*$/.exec(folderName.trim());
    if (!match) {
      return { title: this.cleanTitle(folderName), year: null };
    }

    const [, rawTitle, rawYear] = match;
    return {
      title: this.cleanTitle(rawTitle ?? folderName),
      year: rawYear ? Number(rawYear) : null
    };
  }

  public cleanTitle(value: string): string {
    const normalizedNoise = NOISE_TOKENS.reduce(
      (title, token) => title.replace(new RegExp(token, 'ig'), ' '),
      value
    );

    return normalizedNoise
      .replace(/[._]/g, ' ')
      .replace(/&/g, ' and ')
      .replace(/[-:]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public normalizeTitle(value: string): string {
    return this.cleanTitle(value)
      .toLowerCase()
      .split(' ')
      .filter((token) => token.length > 0)
      .filter((token) => !STOP_WORDS.has(token))
      .join(' ');
  }

  public formatTargetFolderName(title: string, year: number | null): string {
    return year ? `${this.cleanTitle(title)} (${year})` : this.cleanTitle(title);
  }
}
