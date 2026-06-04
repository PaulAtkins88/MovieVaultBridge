import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Clapperboard, Database, DatabaseZap, Film, FolderSync, RefreshCw, ShieldAlert, ShieldCheck, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

interface DashboardResponse {
  scannedAt: string;
  snapshotSource: 'live' | 'cache';
  scanWarnings: string[];
  targetInventory: {
    source: 'live' | 'cache';
    scannedAt: string;
    totalMovies: number;
    namingSampleSize: number;
  };
  config: {
    sourceRoot: string;
    targetRoot: string;
    sandboxTargetRoot: string;
    databasePath: string;
    targetNamingSampleSize: number;
    highConfidenceThreshold: number;
    reviewConfidenceThreshold: number;
    copyExecutionEnabled: boolean;
    realCopyEnabled: boolean;
  };
  overview: {
    sourceMovies: number;
    targetMovies: number;
    copyCandidates: number;
    reviewCandidates: number;
    upgrades: number;
    skipped: number;
  };
  namingInsight: {
    dominantPattern: string;
    sampledTargetFolders: string[];
  };
  sourceSamples: Array<{
    folderName: string;
    title: string;
    year: number | null;
    subtitleCount: number;
    hasMainVideo: boolean;
    evidenceSources: string[];
  }>;
  topReviewCandidates: Array<{
    sourceKey: string;
    sourceFolder: string;
    sourceTitle: string;
    sourceYear: number | null;
    targetFolder: string | null;
    confidence: number;
    suggestedDisposition?: 'copy' | 'review' | 'skip' | 'upgrade' | 'upgrade-approved';
    decisionAction?: 'copy' | 'skip' | 'upgrade' | null;
    decisionUpdatedAt?: string | null;
    reasons: string[];
  }>;
  topCopyCandidates: Array<{
    sourceKey: string;
    sourceFolder: string;
    sourceTitle: string;
    sourceYear: number | null;
    targetFolder: string | null;
    subtitles: number;
    suggestedDisposition?: 'copy' | 'review' | 'skip' | 'upgrade' | 'upgrade-approved';
    decisionAction?: 'copy' | 'skip' | 'upgrade' | null;
    decisionUpdatedAt?: string | null;
    reasons: string[];
  }>;
  topUpgradeCandidates: Array<{
    sourceKey: string;
    sourceFolder: string;
    sourceTitle: string;
    sourceYear: number | null;
    targetFolder: string | null;
    confidence: number;
    suggestedDisposition?: 'copy' | 'review' | 'skip' | 'upgrade' | 'upgrade-approved';
    decisionAction?: 'copy' | 'skip' | 'upgrade' | null;
    decisionUpdatedAt?: string | null;
    reasons: string[];
  }>;
}

interface DryRunResponse {
  generatedAt: string;
  destinationRoot: string;
  mode: 'sandbox';
  copyEnabled: false;
  totalCandidateFiles: number;
  totalPlannedCopies: number;
  warnings: string[];
  items: Array<{
    sourceFolder: string;
    title: string;
    year: number | null;
    destinationFolder: string;
    video: {
      sourcePath: string;
      destinationPath: string;
      kind: 'video';
    } | null;
    subtitles: Array<{
      sourcePath: string;
      destinationPath: string;
      kind: 'subtitle';
    }>;
    reasons: string[];
  }>;
}

interface CopyExecutionResponse {
  jobId?: string;
  executedAt: string;
  mode: 'sandbox' | 'target';
  destinationRoot: string;
  copyEnabled: true;
  totalCandidates: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  warnings: string[];
  items: Array<{
    sourceFolder: string;
    title: string;
    year: number | null;
    destinationFolder: string;
    status: 'copied' | 'skipped' | 'failed';
    copiedFiles: Array<{
      sourcePath: string;
      destinationPath: string;
      kind: 'video' | 'subtitle';
    }>;
    reasons: string[];
    error?: string;
  }>;
}

interface CopyJobSnapshot {
  jobId: string;
  status: 'idle' | 'preparing' | 'running' | 'completed' | 'failed';
  mode: 'sandbox' | 'target';
  destinationRoot: string;
  startedAt: string;
  finishedAt: string | null;
  progress: {
    totalItems: number;
    completedItems: number;
    totalFiles: number;
    completedFiles: number;
    totalBytes: number;
    copiedBytes: number;
    percent: number;
    currentItem: string | null;
    currentFile: string | null;
  };
  report: CopyExecutionResponse | null;
  error: string | null;
}

interface CopyStateResponse {
  currentJob: CopyJobSnapshot | null;
  latestReport: CopyExecutionResponse | null;
}

const statCards: Array<{
  key: keyof DashboardResponse['overview'];
  label: string;
  icon: typeof Film;
}> = [
  { key: 'sourceMovies', label: 'Source titles', icon: FolderSync },
  { key: 'targetMovies', label: 'Cached target titles', icon: Film },
  { key: 'copyCandidates', label: 'Ready to copy', icon: Clapperboard },
  { key: 'reviewCandidates', label: 'Need review', icon: ShieldCheck },
  { key: 'upgrades', label: 'Possible upgrades', icon: DatabaseZap },
  { key: 'skipped', label: 'Likely duplicates', icon: ArrowRight }
];

type BusyTask = 'initial' | 'source-scan' | 'target-scan' | 'dry-run' | 'sandbox-copy' | 'target-copy' | 'settings';
type DecisionAction = 'copy' | 'skip' | 'upgrade' | 'clear';
type DecisionQueueItem = DashboardResponse['topReviewCandidates'][number];

function App() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [copyResult, setCopyResult] = useState<CopyExecutionResponse | null>(null);
  const [copyJob, setCopyJob] = useState<CopyJobSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingTarget, setRefreshingTarget] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [executingSandboxCopy, setExecutingSandboxCopy] = useState(false);
  const [executingTargetCopy, setExecutingTargetCopy] = useState(false);
  const [savingDecisionKey, setSavingDecisionKey] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sourceRootDraft, setSourceRootDraft] = useState('');
  const [targetRootDraft, setTargetRootDraft] = useState('');
  const [sandboxTargetRootDraft, setSandboxTargetRootDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const copyJobRunning = copyJob !== null && (copyJob.status === 'preparing' || copyJob.status === 'running');
  const activeTask: BusyTask | null = loading
    ? 'initial'
    : savingSettings
      ? 'settings'
      : copyJobRunning
        ? copyJob?.mode === 'target'
          ? 'target-copy'
          : 'sandbox-copy'
        : executingTargetCopy
          ? 'target-copy'
          : executingSandboxCopy
            ? 'sandbox-copy'
            : savingDecisionKey !== null
              ? 'dry-run'
              : refreshingTarget
                ? 'target-scan'
                : refreshing
                  ? 'source-scan'
                  : planning
                    ? 'dry-run'
                    : null;
  const controlsLocked = activeTask !== null;
  const busyMessage =
    activeTask === 'target-copy'
      ? copyJobRunning
        ? `Copying into ${copyJob?.destinationRoot ?? 'target'} · ${copyJob?.progress.completedItems ?? 0} of ${copyJob?.progress.totalItems ?? 0} items complete.`
        : 'Copying approved files into the configured target vault after a fresh inventory refresh.'
      : activeTask === 'sandbox-copy'
        ? copyJobRunning
          ? `Copying into ${copyJob?.destinationRoot ?? 'sandbox'} · ${copyJob?.progress.completedItems ?? 0} of ${copyJob?.progress.totalItems ?? 0} items complete.`
          : 'Copying approved files into the sandbox target so the full write path can be verified safely.'
        : activeTask === 'settings'
          ? 'Saving folder settings and preparing the next dashboard refresh.'
        : savingDecisionKey !== null
          ? 'Saving your review decision into the SQLite runbook and recalculating the dashboard.'
        : activeTask === 'target-scan'
      ? 'Refreshing the configured target cache and updating SQLite inventory.'
      : activeTask === 'source-scan'
        ? 'Scanning the configured source library against the cached target inventory.'
        : activeTask === 'dry-run'
          ? 'Generating a dry-run plan from the current dashboard snapshot.'
          : 'Loading the latest dashboard snapshot.';
  const busyTitle =
    activeTask === 'target-copy'
      ? 'Executing real copy'
      : activeTask === 'sandbox-copy'
        ? 'Executing sandbox copy'
        : activeTask === 'settings'
          ? 'Saving settings'
        : savingDecisionKey !== null
          ? 'Saving decision'
        : activeTask === 'target-scan'
          ? 'Refreshing target cache'
          : activeTask === 'source-scan'
            ? 'Refreshing source scan'
            : activeTask === 'dry-run'
              ? 'Generating dry run'
              : 'Loading dashboard';

  const load = async (mode: 'initial' | 'refresh') => {
    const setPending = mode === 'initial' ? setLoading : setRefreshing;
    setPending(true);
    setError(null);

    try {
      const endpoint = mode === 'refresh' ? '/api/dashboard/refresh' : '/api/dashboard';
      const response = await fetch(endpoint, {
        method: mode === 'refresh' ? 'POST' : 'GET'
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as DashboardResponse;
      setData(payload);
      setSourceRootDraft(payload.config.sourceRoot);
      setTargetRootDraft(payload.config.targetRoot);
      setSandboxTargetRootDraft(payload.config.sandboxTargetRoot);
      await loadCopyState();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
    } finally {
      setPending(false);
    }
  };

  const loadCopyState = async () => {
    const response = await fetch('/api/copy/jobs/current');
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as CopyStateResponse;
    setCopyJob(payload.currentJob);
    if (payload.latestReport) {
      setCopyResult(payload.latestReport);
    }
  };

  const generateDryRun = async () => {
    setError(null);
    setPlanning(true);
    try {
      const response = await fetch('/api/dry-run-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{}'
      });

      if (!response.ok) {
        throw new Error(`Dry-run request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as DryRunResponse;
      setDryRun(payload);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'Unknown error');
    } finally {
      setPlanning(false);
    }
  };

  const executeCopy = async (mode: 'sandbox' | 'target') => {
    if (mode === 'target') {
      const approved = window.confirm('This will copy approved files to the real target root. Continue to the final confirmation?');
      if (!approved) {
        return;
      }

      const confirmation = window.prompt('Type COPY TO TARGET to allow the real copy run.');
      if (confirmation !== 'COPY TO TARGET') {
        setError('Real copy cancelled because the confirmation phrase did not match.');
        return;
      }

      setExecutingTargetCopy(true);
      setError(null);
      try {
        const response = await fetch('/api/copy/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ mode, confirmation })
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(typeof payload?.error === 'string' ? payload.error : `Copy request failed with status ${response.status}`);
        }

        setCopyJob(payload as CopyJobSnapshot);
        setCopyResult(null);
      } catch (copyError) {
        setError(copyError instanceof Error ? copyError.message : 'Unknown error');
      } finally {
        setExecutingTargetCopy(false);
      }

      return;
    }

    setExecutingSandboxCopy(true);
    setError(null);
    try {
      const response = await fetch('/api/copy/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ mode })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : `Copy request failed with status ${response.status}`);
      }

      setCopyJob(payload as CopyJobSnapshot);
      setCopyResult(null);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Unknown error');
    } finally {
      setExecutingSandboxCopy(false);
    }
  };

  const saveSettings = async () => {
    setError(null);
    setSavingSettings(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceRoot: sourceRootDraft,
          targetRoot: targetRootDraft,
          sandboxTargetRoot: sandboxTargetRootDraft
        })
      });

      if (!response.ok) {
        throw new Error(`Settings request failed with status ${response.status}`);
      }

      await load('refresh');
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Unknown error');
    } finally {
      setSavingSettings(false);
    }
  };

  const refreshTargetInventory = async () => {
    setError(null);
    setRefreshingTarget(true);
    try {
      const response = await fetch('/api/target-inventory/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{}'
      });

      if (!response.ok) {
        throw new Error(`Target refresh failed with status ${response.status}`);
      }

      const payload = (await response.json()) as DashboardResponse;
      setData(payload);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unknown error');
    } finally {
      setRefreshingTarget(false);
    }
  };

  const saveDecision = async (item: DecisionQueueItem, action: DecisionAction) => {
    setError(null);
    setSavingDecisionKey(item.sourceKey);

    try {
      const response = await fetch('/api/review-decisions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceKey: item.sourceKey,
          sourceFolder: item.sourceFolder,
          sourceTitle: item.sourceTitle,
          sourceYear: item.sourceYear,
          targetFolder: item.targetFolder,
          action
        })
      });

      if (!response.ok) {
        throw new Error(`Decision request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as DashboardResponse;
      setData(payload);
      setDryRun(null);
      setCopyResult(null);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Unknown error');
    } finally {
      setSavingDecisionKey(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialLoad = async () => {
      await load('initial');
      if (cancelled) {
        return;
      }
    };

    void initialLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!copyJobRunning) {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch('/api/copy/jobs/current');
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as CopyStateResponse;
        setCopyJob(payload.currentJob);
        if (payload.latestReport) {
          setCopyResult(payload.latestReport);
        }

        if (payload.currentJob && (payload.currentJob.status === 'completed' || payload.currentJob.status === 'failed')) {
          await load('initial');
        }
      } catch {
        // Keep the last known progress if polling fails temporarily.
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [copyJobRunning]);

  const scanTimestamp = data ? new Date(data.scannedAt).toLocaleString() : null;
  const targetInventoryTimestamp = data ? new Date(data.targetInventory.scannedAt).toLocaleString() : null;
  const dryRunTimestamp = dryRun ? new Date(dryRun.generatedAt).toLocaleString() : null;
  const copyTimestamp = copyResult ? new Date(copyResult.executedAt).toLocaleString() : null;

  return (
    <div
      aria-busy={activeTask !== null}
      className="relative min-h-screen bg-[radial-gradient(circle_at_top,_rgba(252,211,77,0.14),_transparent_28%),linear-gradient(160deg,_#120f0d_0%,_#171412_35%,_#0c0b0d_100%)] text-stone-100"
    >
      <AnimatePresence>
        {activeTask !== null ? (
          <motion.div
            key={activeTask}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className="w-full max-w-lg rounded-[2rem] border border-amber-300/20 bg-stone-950/90 p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.5)]"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 text-amber-100">
                <RefreshCw className="h-7 w-7 animate-spin" />
              </div>
              <div className="mt-6 text-xs uppercase tracking-[0.35em] text-amber-200/80">Scanner busy</div>
              <h2 className="mt-3 text-3xl text-white">{busyTitle}</h2>
              <p className="mt-4 text-sm leading-7 text-stone-300">{busyMessage}</p>
              {copyJobRunning ? (
                <div className="mt-6 text-left">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-stone-300">
                    <span>{copyJob?.progress.completedItems ?? 0} / {copyJob?.progress.totalItems ?? 0} items</span>
                    <span>{copyJob?.progress.percent ?? 0}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[linear-gradient(90deg,_#fbbf24,_#34d399)] transition-all duration-300" style={{ width: `${copyJob?.progress.percent ?? 0}%` }} />
                  </div>
                  <div className="mt-3 text-sm text-stone-300">{copyJob?.progress.currentItem ?? 'Preparing files'}</div>
                </div>
              ) : null}
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-xs uppercase tracking-[0.24em] text-stone-300">
                Controls are temporarily locked until this finishes.
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-8 lg:px-12">
        <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 px-8 py-10 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(255,255,255,0.08),_transparent_35%,_rgba(251,191,36,0.08)_70%,_transparent_100%)]" />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
            className="relative grid gap-8 lg:grid-cols-[1.4fr_0.8fr]"
          >
            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.35em] text-amber-200">
                <img src="/movie-vault-bridge-logo.svg" alt="MovieVaultBridge logo" className="h-6 w-6" />
                MovieVaultBridge
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Bridge a source movie folder into your curated library without trusting brittle file names.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                  MovieVaultBridge scans your source library, profiles the target naming style, scores duplicate confidence,
                  and separates ready-to-copy movies from review candidates and possible upgrades.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-stone-400">Source root</div>
                  <input
                    value={sourceRootDraft}
                    onChange={(event) => setSourceRootDraft(event.target.value)}
                    disabled={controlsLocked}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition focus:border-amber-300/40 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <div className="text-xs uppercase tracking-[0.28em] text-stone-400">Target root</div>
                  <input
                    value={targetRootDraft}
                    onChange={(event) => setTargetRootDraft(event.target.value)}
                    disabled={controlsLocked}
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition focus:border-sky-300/40 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/20 p-5 sm:col-span-2">
                  <div className="text-xs uppercase tracking-[0.28em] text-stone-400">Sandbox target root</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <input
                      value={sandboxTargetRootDraft}
                      onChange={(event) => setSandboxTargetRootDraft(event.target.value)}
                      disabled={controlsLocked}
                      className="min-w-[20rem] flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                    <button
                      type="button"
                      onClick={() => void saveSettings()}
                      disabled={controlsLocked}
                      className="inline-flex items-center rounded-full border border-white/10 bg-white/8 px-5 py-3 text-sm text-stone-100 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingSettings ? 'Saving settings' : 'Save folders'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void load('refresh')}
                  disabled={controlsLocked}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/12 px-5 py-3 text-sm text-amber-100 transition hover:bg-amber-300/18 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? 'Refreshing source scan' : 'Refresh source scan'}
                </button>
                <button
                  type="button"
                  onClick={() => void refreshTargetInventory()}
                  disabled={controlsLocked}
                  className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-300/10 px-5 py-3 text-sm text-sky-100 transition hover:bg-sky-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Database className={`h-4 w-4 ${refreshingTarget ? 'animate-pulse' : ''}`} />
                  {refreshingTarget ? 'Refreshing target cache' : 'Refresh target cache'}
                </button>
                <div className="rounded-full border border-white/10 bg-black/20 px-4 py-3 text-xs uppercase tracking-[0.24em] text-stone-300">
                  {data?.config.copyExecutionEnabled ? 'Copy execution enabled' : 'Copy execution locked'}
                </div>
                <button
                  type="button"
                  onClick={() => void generateDryRun()}
                  disabled={controlsLocked}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-5 py-3 text-sm text-stone-100 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <WandSparkles className={`h-4 w-4 ${planning ? 'animate-pulse' : ''}`} />
                  {planning ? 'Generating dry run' : 'Generate dry run'}
                </button>
                <button
                  type="button"
                  onClick={() => void executeCopy('sandbox')}
                  disabled={controlsLocked || !data?.config.copyExecutionEnabled}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-3 text-sm text-emerald-100 transition hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Clapperboard className={`h-4 w-4 ${executingSandboxCopy ? 'animate-pulse' : ''}`} />
                  {executingSandboxCopy ? 'Executing sandbox copy' : 'Execute sandbox copy'}
                </button>
                <button
                  type="button"
                  onClick={() => void executeCopy('target')}
                  disabled={controlsLocked || !data?.config.copyExecutionEnabled || !data?.config.realCopyEnabled}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-300/10 px-5 py-3 text-sm text-rose-100 transition hover:bg-rose-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ShieldAlert className={`h-4 w-4 ${executingTargetCopy ? 'animate-pulse' : ''}`} />
                  {executingTargetCopy ? 'Executing real copy' : 'Execute real copy'}
                </button>
                <div className="rounded-full border border-white/10 bg-white/6 px-4 py-3 text-xs uppercase tracking-[0.24em] text-stone-300">
                  {activeTask === null ? 'Status: ready' : `Status: ${busyMessage}`}
                </div>
              </div>
            </div>

            <div className="grid gap-4 rounded-[1.75rem] border border-white/10 bg-black/25 p-6">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Target convention</div>
                <div className="mt-3 text-3xl text-white">{data?.namingInsight.dominantPattern ?? 'Title (Year)'}</div>
              </div>
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Observed samples</div>
                <div className="flex flex-wrap gap-2">
                  {(data?.namingInsight.sampledTargetFolders ?? []).slice(0, 6).map((sample) => (
                    <span key={sample} className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs text-stone-200">
                      {sample}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Snapshot status</div>
                <div className="mt-2 text-base text-white">{data ? `${data.snapshotSource === 'live' ? 'Live scan' : 'Cached snapshot'}${scanTimestamp ? ` · ${scanTimestamp}` : ''}` : 'Waiting for scan'}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Target inventory cache</div>
                <div className="mt-2 text-base text-white">
                  {data ? `${data.targetInventory.source === 'live' ? 'Fresh full target scan' : 'SQLite cache'} · ${data.targetInventory.totalMovies} titles` : 'Waiting for cache'}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                  {data ? `${targetInventoryTimestamp} · naming sample ${data.targetInventory.namingSampleSize}` : 'No cached target inventory yet'}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Dry-run target</div>
                <div className="mt-2 text-base text-white">{dryRun?.destinationRoot ?? data?.config.sandboxTargetRoot ?? 'Not generated yet'}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                  {dryRun ? `Sandbox plan · ${dryRunTimestamp}` : 'Generate a dry-run plan to preview destination file names'}
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Copy gates</div>
                <div className="mt-2 text-base text-white">
                  {data ? `${data.config.copyExecutionEnabled ? 'Sandbox copy unlocked' : 'Copy execution disabled'} · ${data.config.realCopyEnabled ? 'Real copy unlocked' : 'Real copy still locked'}` : 'Waiting for config'}
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                  Real copy also requires typing COPY TO TARGET in the confirmation prompt.
                </div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Copy progress</div>
                {copyJobRunning ? (
                  <>
                    <div className="mt-2 text-base text-white">{copyJob?.progress.percent ?? 0}% complete</div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,_#fbbf24,_#34d399)] transition-all duration-300" style={{ width: `${copyJob?.progress.percent ?? 0}%` }} />
                    </div>
                    <div className="mt-3 text-xs uppercase tracking-[0.24em] text-stone-400">
                      {copyJob?.progress.completedItems ?? 0} of {copyJob?.progress.totalItems ?? 0} items · {copyJob?.progress.completedFiles ?? 0} of {copyJob?.progress.totalFiles ?? 0} files
                    </div>
                    <div className="mt-2 text-sm text-stone-300">{copyJob?.progress.currentItem ?? 'Preparing files'}</div>
                  </>
                ) : (
                  <>
                    <div className="mt-2 text-base text-white">{copyResult ? 'Last run complete' : 'No active copy job'}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                      {copyResult ? `${copyTimestamp} · ${copyResult.copiedCount} copied, ${copyResult.skippedCount} skipped, ${copyResult.failedCount} failed` : 'Progress appears here while sandbox or real copy is running'}
                    </div>
                  </>
                )}
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-4 text-sm text-stone-200">
                <div className="text-xs uppercase tracking-[0.3em] text-stone-400">Database</div>
                <div className="mt-2 break-all text-base text-white">{data?.config.databasePath ?? 'Waiting for config'}</div>
              </div>
            </div>
          </motion.div>
        </header>

        <main className="flex-1 py-8">
          {data && data.scanWarnings.length > 0 ? (
            <section className="mb-6 rounded-[1.75rem] border border-rose-300/20 bg-rose-500/10 p-5 text-rose-100">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-200" />
                <div>
                  <div className="text-sm uppercase tracking-[0.3em] text-rose-200/80">Scan warnings</div>
                  <ul className="mt-3 space-y-2 text-sm leading-7 text-rose-100/90">
                    {data.scanWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid gap-6 lg:grid-cols-3"
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-36 animate-pulse rounded-[1.75rem] border border-white/10 bg-white/6" />
                ))}
              </motion.div>
            ) : error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="rounded-[1.75rem] border border-rose-300/20 bg-rose-500/10 p-8 text-rose-100"
              >
                <div className="text-sm uppercase tracking-[0.3em] text-rose-200/70">Backend status</div>
                <h2 className="mt-3 text-2xl text-white">Dashboard data is unavailable.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-rose-100/80">{error}</p>
              </motion.div>
            ) : data ? (
              <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {statCards.map((card, index) => {
                    const Icon = card.icon;
                    return (
                      <motion.article
                        key={card.key}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.04 * index, duration: 0.4 }}
                        className="rounded-[1.75rem] border border-white/10 bg-white/6 p-5 shadow-[0_25px_60px_rgba(0,0,0,0.25)] backdrop-blur-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs uppercase tracking-[0.3em] text-stone-400">{card.label}</div>
                          <Icon className="h-5 w-5 text-amber-200" />
                        </div>
                        <div className="mt-5 text-4xl font-semibold tracking-tight text-white">{data.overview[card.key]}</div>
                      </motion.article>
                    );
                  })}
                </section>

                <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <Panel
                    eyebrow="Review queue"
                    title="Ambiguous matches worth your attention"
                    subtitle="These source folders look similar to something already on the target, but not enough to trust unattended copying. Save a runbook decision here so future dry-runs and copy executions follow your call."
                  >
                    <DecisionQueueList
                      items={data.topReviewCandidates}
                      kind="review"
                      pendingKey={savingDecisionKey}
                      controlsLocked={controlsLocked}
                      onDecision={saveDecision}
                      emptyMessage="No review items in the current sample."
                    />
                  </Panel>

                  <Panel
                    eyebrow="Source intelligence"
                    title="What the source scanner is extracting"
                    subtitle="Folder-name parsing is already being corrected by local metadata when it exists, so bad source names do not automatically poison matching."
                  >
                    <div className="space-y-3">
                      {data.sourceSamples.map((movie) => (
                        <div key={movie.folderName} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-base text-white">{movie.title}{movie.year ? ` (${movie.year})` : ''}</div>
                              <div className="mt-1 text-xs uppercase tracking-[0.28em] text-stone-400">{movie.folderName}</div>
                            </div>
                            <div className="text-right text-xs text-stone-300">
                              <div>{movie.subtitleCount} subtitles</div>
                              <div>{movie.hasMainVideo ? 'Main video found' : 'No main video yet'}</div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {movie.evidenceSources.map((source) => (
                              <span key={`${movie.folderName}-${source}`} className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-200">
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Panel>
                </section>

                <section className="mt-8 grid gap-6 xl:grid-cols-2">
                  <Panel
                    eyebrow="Ready to copy"
                    title="High-confidence new arrivals"
                    subtitle="These items currently look absent from the cached full target inventory and are the only items eligible for sandbox or real copy execution. Existing target titles are never overwritten by this flow."
                  >
                    <QueueList
                      items={data.topCopyCandidates.map((item) => ({
                        title: `${item.sourceTitle ?? item.sourceFolder}${item.sourceYear ? ` (${item.sourceYear})` : ''}`,
                        badge: `${item.subtitles} subtitles`,
                        meta: item.sourceFolder,
                        reasons: item.reasons
                      }))}
                      emptyMessage="No new-copy candidates found yet."
                    />
                  </Panel>

                  <Panel
                    eyebrow="Upgrade lane"
                    title="Potential quality upgrades"
                    subtitle="When the app sees a likely duplicate with a materially larger local file, it will not replace anything automatically. Approving an upgrade saves that decision and lets the execution plan replace the target video and matching subtitles deliberately."
                  >
                    <DecisionQueueList
                      items={data.topUpgradeCandidates}
                      kind="upgrade"
                      pendingKey={savingDecisionKey}
                      controlsLocked={controlsLocked}
                      onDecision={saveDecision}
                      emptyMessage="No upgrade candidates in the current sample."
                    />
                  </Panel>
                </section>

                <section className="mt-8">
                  <Panel
                    eyebrow="Dry-run planner"
                    title="Preview and execute the copy plan with explicit gates"
                    subtitle="Dry-run still previews the sandbox destination first. It now includes your saved review and upgrade decisions, so the generated plan becomes the app's persisted runbook for later execution."
                  >
                    {dryRun ? (
                      <div className="space-y-4">
                        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                            <div className="text-xs uppercase tracking-[0.28em] text-stone-400">Planned copies</div>
                            <div className="mt-3 text-4xl text-white">{dryRun.totalPlannedCopies}</div>
                            <div className="mt-3 text-sm text-stone-300">Destination root: {dryRun.destinationRoot}</div>
                            <div className="mt-2 text-sm text-stone-300">Candidate files: {dryRun.totalCandidateFiles}</div>
                          </div>
                          <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                            <div className="text-xs uppercase tracking-[0.28em] text-stone-400">Planner warnings</div>
                            {dryRun.warnings.length > 0 ? (
                              <ul className="mt-3 space-y-2 text-sm text-stone-300">
                                {dryRun.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : (
                              <div className="mt-3 text-sm text-stone-300">No warnings. This plan is preview-only.</div>
                            )}
                          </div>
                        </div>
                        {copyResult ? (
                          <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-stone-200">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.28em] text-emerald-100/80">Last execution</div>
                                <div className="mt-2 text-lg text-white">
                                  {copyResult.mode === 'target' ? 'Real target copy' : 'Sandbox copy'} · {new Date(copyResult.executedAt).toLocaleString()}
                                </div>
                              </div>
                              <div className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.24em] text-stone-200">
                                {copyResult.copiedCount} copied · {copyResult.skippedCount} skipped · {copyResult.failedCount} failed
                              </div>
                            </div>
                            {copyResult.warnings.length > 0 ? (
                              <ul className="mt-4 space-y-2 text-sm text-stone-300">
                                {copyResult.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : null}
                            <div className="mt-4 space-y-3">
                              {copyResult.items.slice(0, 6).map((item) => (
                                <div key={`${item.sourceFolder}-${item.destinationFolder}-${item.status}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="text-base text-white">{item.title}{item.year ? ` (${item.year})` : ''}</div>
                                      <div className="mt-1 text-sm text-stone-300">{item.sourceFolder}</div>
                                    </div>
                                    <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.24em] text-stone-100">
                                      {item.status}
                                    </div>
                                  </div>
                                  {item.error ? <div className="mt-3 text-sm text-rose-200">{item.error}</div> : null}
                                  <ul className="mt-3 space-y-2 text-sm text-stone-300">
                                    {item.reasons.map((reason) => (
                                      <li key={reason}>{reason}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-3">
                          {dryRun.items.slice(0, 8).map((item) => (
                            <div key={`${item.sourceFolder}-${item.destinationFolder}`} className="rounded-3xl border border-white/10 bg-black/20 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                  <div className="text-base text-white">{item.title}{item.year ? ` (${item.year})` : ''}</div>
                                  <div className="mt-1 text-sm text-stone-300">{item.sourceFolder}</div>
                                </div>
                                <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-emerald-100">
                                  {item.subtitles.length} subtitle{item.subtitles.length === 1 ? '' : 's'}
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                <PathCard label="Destination folder" value={item.destinationFolder} />
                                <PathCard label="Planned video" value={item.video?.destinationPath ?? 'No main video found'} />
                              </div>
                              {item.subtitles.length > 0 ? (
                                <div className="mt-4 space-y-2">
                                  <div className="text-xs uppercase tracking-[0.24em] text-stone-400">Planned subtitles</div>
                                  {item.subtitles.slice(0, 3).map((subtitle) => (
                                    <PathCard key={subtitle.destinationPath} label="Subtitle" value={subtitle.destinationPath} />
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 p-6 text-sm text-stone-300">
                        Generate the dry-run plan to inspect proposed destination folders and filenames in the sandbox target root.
                      </div>
                    )}
                  </Panel>
                </section>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function PathCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
      <div className="text-[11px] uppercase tracking-[0.24em] text-stone-400">{label}</div>
      <div className="mt-2 break-all text-sm text-stone-200">{value}</div>
    </div>
  );
}

interface PanelProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

function Panel({ eyebrow, title, subtitle, children }: PanelProps) {
  return (
    <section className="rounded-[1.9rem] border border-white/10 bg-white/6 p-6 shadow-[0_25px_80px_rgba(0,0,0,0.25)] backdrop-blur-md">
      <div className="text-xs uppercase tracking-[0.3em] text-stone-400">{eyebrow}</div>
      <h2 className="mt-3 text-2xl text-white">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">{subtitle}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

interface QueueItem {
  title: string;
  badge: string;
  meta: string;
  reasons: string[];
}

interface DecisionQueueListProps {
  items: DashboardResponse['topReviewCandidates'];
  kind: 'review' | 'upgrade';
  pendingKey: string | null;
  controlsLocked: boolean;
  onDecision: (item: DecisionQueueItem, action: DecisionAction) => Promise<void>;
  emptyMessage: string;
}

function DecisionQueueList({ items, kind, pendingKey, controlsLocked, onDecision, emptyMessage }: DecisionQueueListProps) {
  if (items.length === 0) {
    return <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 p-6 text-sm text-stone-300">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isPending = pendingKey === item.sourceKey;
        const decisionLabel =
          item.decisionAction === 'copy'
            ? 'Approved copy'
            : item.decisionAction === 'skip'
              ? kind === 'review'
                ? 'Marked duplicate'
                : 'Left as-is'
              : item.decisionAction === 'upgrade'
                ? 'Approved upgrade'
                : 'No saved decision';

        return (
          <div key={item.sourceKey} className="rounded-3xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base text-white">{item.sourceTitle}{item.sourceYear ? ` (${item.sourceYear})` : ''}</div>
                <div className="mt-1 text-sm text-stone-300">{item.sourceFolder}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.24em] text-stone-400">
                  {kind === 'review'
                    ? item.targetFolder
                      ? `Closest target: ${item.targetFolder}`
                      : 'No closest target captured'
                    : item.targetFolder
                      ? `Existing target: ${item.targetFolder}`
                      : 'No target folder captured'}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100">
                  {Math.round(item.confidence * 100)}%
                </div>
                <div className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-200">
                  {decisionLabel}
                </div>
              </div>
            </div>
            {item.decisionUpdatedAt ? (
              <div className="mt-3 text-xs uppercase tracking-[0.22em] text-stone-500">
                Saved {new Date(item.decisionUpdatedAt).toLocaleString()}
              </div>
            ) : null}
            <ul className="mt-4 space-y-2 text-sm text-stone-300">
              {item.reasons.map((reason) => (
                <li key={reason} className="rounded-2xl bg-white/5 px-3 py-2">
                  {reason}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {kind === 'review' ? (
                <>
                  <button
                    type="button"
                    onClick={() => void onDecision(item, 'copy')}
                    disabled={controlsLocked || isPending}
                    className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-emerald-100 transition hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPending ? 'Saving' : 'Approve copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDecision(item, 'skip')}
                    disabled={controlsLocked || isPending}
                    className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-amber-100 transition hover:bg-amber-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Mark duplicate
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void onDecision(item, 'upgrade')}
                    disabled={controlsLocked || isPending}
                    className="rounded-full border border-rose-300/20 bg-rose-300/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-rose-100 transition hover:bg-rose-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPending ? 'Saving' : 'Approve upgrade'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDecision(item, 'skip')}
                    disabled={controlsLocked || isPending}
                    className="rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs uppercase tracking-[0.24em] text-amber-100 transition hover:bg-amber-300/16 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Leave target as-is
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void onDecision(item, 'clear')}
                disabled={controlsLocked || isPending || item.decisionAction === null || item.decisionAction === undefined}
                className="rounded-full border border-white/10 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.24em] text-stone-100 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Clear decision
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QueueList({ items, emptyMessage }: { items: QueueItem[]; emptyMessage: string }) {
  if (items.length === 0) {
    return <div className="rounded-3xl border border-dashed border-white/12 bg-black/20 p-6 text-sm text-stone-300">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={`${item.title}-${item.meta}`} className="rounded-3xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-base text-white">{item.title}</div>
              <div className="mt-1 text-sm text-stone-300">{item.meta}</div>
            </div>
            <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100">
              {item.badge}
            </div>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-stone-300">
            {item.reasons.map((reason) => (
              <li key={reason} className="rounded-2xl bg-white/5 px-3 py-2">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default App;
