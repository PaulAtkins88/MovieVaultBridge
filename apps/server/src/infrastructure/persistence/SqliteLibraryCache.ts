import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CopyExecutionResult } from '../../application/dto/CopyExecutionResult.js';
import { DashboardSnapshot } from '../../application/dto/DashboardSnapshot.js';
import { MovieCandidate, SerializedMovieCandidate } from '../../domain/movies/MovieCandidate.js';
import { ReviewDecision, ReviewDecisionAction } from '../../domain/review/ReviewDecision.js';

interface SerializedTargetInventory {
  rootPath: string;
  capturedAt: string;
  movies: SerializedMovieCandidate[];
}

interface SerializedSnapshotRow {
  captured_at: string;
  payload: string;
}

interface SerializedInventoryRow {
  root_path: string;
  captured_at: string;
  payload: string;
}

interface ReviewDecisionRow {
  source_key: string;
  source_folder: string;
  source_title: string;
  source_year: number | null;
  action: ReviewDecisionAction;
  target_folder: string | null;
  updated_at: string;
}

interface AppSettingRow {
  setting_key: string;
  setting_value: string;
}

interface CopyExecutionReportRow {
  captured_at: string;
  payload: string;
}

export interface RuntimePathSettings {
  sourceRoot: string;
  targetRoot: string;
  sandboxTargetRoot: string;
}

export interface TargetInventorySnapshot {
  rootPath: string;
  capturedAt: string;
  movies: MovieCandidate[];
  source: 'cache' | 'live';
}

export class SqliteLibraryCache {
  private readonly database: DatabaseSync;

  public constructor(databasePath: string) {
    const resolvedPath = path.resolve(databasePath);
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.database = new DatabaseSync(resolvedPath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS target_inventory_snapshots (
        root_path TEXT PRIMARY KEY,
        captured_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS review_decisions (
        source_key TEXT PRIMARY KEY,
        source_folder TEXT NOT NULL,
        source_title TEXT NOT NULL,
        source_year INTEGER NULL,
        action TEXT NOT NULL,
        target_folder TEXT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS copy_execution_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        captured_at TEXT NOT NULL,
        payload TEXT NOT NULL
      );
    `);
  }

  public getLatestDashboard(): DashboardSnapshot | null {
    const row = this.database
      .prepare('SELECT captured_at, payload FROM dashboard_snapshots ORDER BY id DESC LIMIT 1')
      .get() as SerializedSnapshotRow | undefined;

    if (!row) {
      return null;
    }

    const snapshot = JSON.parse(row.payload) as DashboardSnapshot;
    return {
      ...snapshot,
      scannedAt: row.captured_at,
      snapshotSource: 'cache'
    };
  }

  public saveDashboard(snapshot: DashboardSnapshot): void {
    this.database
      .prepare('INSERT INTO dashboard_snapshots (captured_at, payload) VALUES (?, ?)')
      .run(snapshot.scannedAt, JSON.stringify(snapshot));
  }

  public getTargetInventory(rootPath: string): TargetInventorySnapshot | null {
    const row = this.database
      .prepare('SELECT root_path, captured_at, payload FROM target_inventory_snapshots WHERE root_path = ?')
      .get(rootPath) as SerializedInventoryRow | undefined;

    if (!row) {
      return null;
    }

    const payload = JSON.parse(row.payload) as SerializedTargetInventory;
    return {
      rootPath: payload.rootPath,
      capturedAt: row.captured_at,
      movies: payload.movies.map((movie) => MovieCandidate.fromSerialized(movie)),
      source: 'cache'
    };
  }

  public saveTargetInventory(rootPath: string, movies: MovieCandidate[]): TargetInventorySnapshot {
    const capturedAt = new Date().toISOString();
    const payload: SerializedTargetInventory = {
      rootPath,
      capturedAt,
      movies: movies.map((movie) => movie.toSerialized())
    };

    this.database
      .prepare(`
        INSERT INTO target_inventory_snapshots (root_path, captured_at, payload)
        VALUES (?, ?, ?)
        ON CONFLICT(root_path) DO UPDATE SET captured_at = excluded.captured_at, payload = excluded.payload
      `)
      .run(rootPath, capturedAt, JSON.stringify(payload));

    return {
      rootPath,
      capturedAt,
      movies,
      source: 'live'
    };
  }

  public getReviewDecisions(): Map<string, ReviewDecision> {
    const rows = this.database
      .prepare('SELECT source_key, source_folder, source_title, source_year, action, target_folder, updated_at FROM review_decisions')
      .all() as unknown as ReviewDecisionRow[];

    return new Map(
      rows.map((row) => [
        row.source_key,
        {
          sourceKey: row.source_key,
          sourceFolder: row.source_folder,
          sourceTitle: row.source_title,
          sourceYear: row.source_year,
          action: row.action,
          targetFolder: row.target_folder,
          updatedAt: row.updated_at
        }
      ])
    );
  }

  public saveReviewDecision(decision: ReviewDecision): ReviewDecision {
    this.database
      .prepare(`
        INSERT INTO review_decisions (source_key, source_folder, source_title, source_year, action, target_folder, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          source_folder = excluded.source_folder,
          source_title = excluded.source_title,
          source_year = excluded.source_year,
          action = excluded.action,
          target_folder = excluded.target_folder,
          updated_at = excluded.updated_at
      `)
      .run(
        decision.sourceKey,
        decision.sourceFolder,
        decision.sourceTitle,
        decision.sourceYear,
        decision.action,
        decision.targetFolder,
        decision.updatedAt
      );

    return decision;
  }

  public deleteReviewDecision(sourceKey: string): void {
    this.database.prepare('DELETE FROM review_decisions WHERE source_key = ?').run(sourceKey);
  }

  public getRuntimePathSettings(defaults: RuntimePathSettings): RuntimePathSettings {
    const rows = this.database
      .prepare('SELECT setting_key, setting_value FROM app_settings WHERE setting_key IN (?, ?, ?)')
      .all('sourceRoot', 'targetRoot', 'sandboxTargetRoot') as unknown as AppSettingRow[];

    const settings = new Map(rows.map((row) => [row.setting_key, row.setting_value]));
    return {
      sourceRoot: settings.get('sourceRoot') ?? defaults.sourceRoot,
      targetRoot: settings.get('targetRoot') ?? defaults.targetRoot,
      sandboxTargetRoot: settings.get('sandboxTargetRoot') ?? defaults.sandboxTargetRoot
    };
  }

  public saveRuntimePathSettings(settings: RuntimePathSettings): RuntimePathSettings {
    const statement = this.database.prepare(`
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    `);

    statement.run('sourceRoot', settings.sourceRoot);
    statement.run('targetRoot', settings.targetRoot);
    statement.run('sandboxTargetRoot', settings.sandboxTargetRoot);

    return settings;
  }

  public getLatestCopyReport(): CopyExecutionResult | null {
    const row = this.database
      .prepare('SELECT captured_at, payload FROM copy_execution_reports ORDER BY id DESC LIMIT 1')
      .get() as CopyExecutionReportRow | undefined;

    if (!row) {
      return null;
    }

    const report = JSON.parse(row.payload) as CopyExecutionResult;
    return {
      ...report,
      executedAt: row.captured_at
    };
  }

  public saveCopyReport(report: CopyExecutionResult): void {
    this.database
      .prepare('INSERT INTO copy_execution_reports (captured_at, payload) VALUES (?, ?)')
      .run(report.executedAt, JSON.stringify(report));
  }
}