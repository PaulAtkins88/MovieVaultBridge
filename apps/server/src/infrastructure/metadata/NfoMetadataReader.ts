import { XMLParser } from 'fast-xml-parser';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { MetadataEvidence } from '../../domain/movies/MovieCandidate.js';

const POSSIBLE_METADATA_FILES = ['movie.nfo', 'movie.xml'];

export class NfoMetadataReader {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true
  });

  public async read(folderPath: string): Promise<MetadataEvidence[]> {
    const evidences: MetadataEvidence[] = [];

    for (const fileName of POSSIBLE_METADATA_FILES) {
      const filePath = path.join(folderPath, fileName);
      try {
        await access(filePath);
      } catch {
        continue;
      }

      const fileContents = await readFile(filePath, 'utf8');
      const parsed = this.parser.parse(fileContents) as Record<string, unknown>;
      const movieNode = (parsed.movie ?? parsed) as Record<string, unknown>;
      evidences.push({
        source: fileName.endsWith('.nfo') ? 'nfo' : 'movie.xml',
        title: this.asString(movieNode.title),
        year: this.asYear(movieNode.year),
        imdbId: this.asString(movieNode.imdbid),
        tmdbId: this.extractTmdbId(movieNode)
      });
    }

    const folderNfos = await this.readFolderSpecificNfo(folderPath);
    evidences.push(...folderNfos);

    return evidences;
  }

  private async readFolderSpecificNfo(folderPath: string): Promise<MetadataEvidence[]> {
    const folderName = path.basename(folderPath);
    const candidates = [`${folderName}.nfo`, `${folderName}.xml`];
    const result: MetadataEvidence[] = [];

    for (const fileName of candidates) {
      const filePath = path.join(folderPath, fileName);
      try {
        await access(filePath);
      } catch {
        continue;
      }

      const fileContents = await readFile(filePath, 'utf8');
      const parsed = this.parser.parse(fileContents) as Record<string, unknown>;
      const movieNode = (parsed.movie ?? parsed) as Record<string, unknown>;
      result.push({
        source: fileName.endsWith('.nfo') ? 'nfo' : 'movie.xml',
        title: this.asString(movieNode.title),
        year: this.asYear(movieNode.year),
        imdbId: this.asString(movieNode.imdbid),
        tmdbId: this.extractTmdbId(movieNode)
      });
    }

    return result;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private asYear(value: unknown): number | null | undefined {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value : null;
    }

    if (typeof value !== 'string' || value.trim().length === 0) {
      return undefined;
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  private extractTmdbId(movieNode: Record<string, unknown>): string | undefined {
    const tmdbId = this.asString(movieNode.tmdbid);
    if (tmdbId) {
      return tmdbId;
    }

    const uniqueIds = movieNode.uniqueid;
    if (!uniqueIds) {
      return undefined;
    }

    const nodes = Array.isArray(uniqueIds) ? uniqueIds : [uniqueIds];
    for (const node of nodes) {
      if (typeof node === 'object' && node !== null) {
        const record = node as Record<string, unknown>;
        if (record['@_type'] === 'tmdb') {
          return this.asString(record['#text']);
        }
      }
    }

    return undefined;
  }
}
