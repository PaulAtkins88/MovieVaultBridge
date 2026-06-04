# MovieVaultBridge

MovieVaultBridge is a local-first movie library merge console for scanning one library, comparing it against another, surfacing uncertain matches for review, and executing guarded copy runs with progress tracking and a persisted run report.

It is built for the case where a recovered or secondary movie folder needs to be merged into an existing curated library without blindly trusting folder names.

## Project links

- Repository: https://github.com/PaulAtkins88/MovieVaultBridge
- GitHub Pages: https://PaulAtkins88.github.io/MovieVaultBridge/

## What it does

- Scans a source movie library and a target movie library.
- Uses normalized titles, years, and local metadata evidence to identify likely duplicates.
- Separates safe copy candidates from ambiguous review items and likely quality upgrades.
- Learns the target naming style from the cached target inventory.
- Generates a dry-run plan before any real write operation.
- Supports saved review decisions so the app can reuse human calls on later scans.
- Supports sandbox copy and guarded real copy with progress tracking.
- Persists dashboard snapshots, target inventory, review decisions, runtime folder settings, and the latest copy report in SQLite.

## Stack

- Backend: Fastify + TypeScript
- Frontend: React + Vite + Tailwind CSS
- Persistence: Node built-in `node:sqlite`
- Workspace: npm workspaces monorepo

## Getting started

### Requirements

- Node.js 22 or newer
- Windows environment with access to the source and target movie roots you want to scan

### Install

```powershell
npm install
```

### Configure

Create a root `.env` from `.env.example` and adjust the paths for your machine.

Typical values:

```env
SOURCE_ROOT=C:\path\to\source-movies
TARGET_ROOT=D:\path\to\target-vault
SANDBOX_TARGET_ROOT=./data/sandbox-target
COPY_EXECUTION_ENABLED=false
REAL_COPY_ENABLED=false
```

### Run

```powershell
npm run dev
```

Then open `http://127.0.0.1:5173`.

Set the source and target roots to folders that exist on your machine. The repository does not assume any fixed local drive letters.

## Safety model

- Dry-run is the default planning workflow.
- `COPY_EXECUTION_ENABLED=true` unlocks sandbox copy execution only.
- `REAL_COPY_ENABLED=true` unlocks real target execution, but only if sandbox copy is already enabled.
- Real target execution still requires the confirmation phrase `COPY TO TARGET` in the UI.
- Real target execution refreshes the full target inventory immediately before copying.
- New-copy items do not overwrite existing files.
- Approved upgrade items are explicit replacement operations.

## Operator workflow

1. Refresh the target cache.
2. Refresh the source scan.
3. Review ambiguous matches and upgrade candidates.
4. Save decisions for `copy`, `skip`, or `upgrade`.
5. Generate a dry-run plan.
6. Execute a sandbox copy.
7. Inspect the result and last-run report.
8. Enable real copy only after sandbox validation.

## Project structure

```text
apps/
	server/   Fastify API and library scanning/copy logic
	web/      React dashboard
data/       SQLite database and sandbox output
```

## Scripts

```powershell
npm run dev
npm run dev:server
npm run dev:web
npm run build
npm run lint
npm run test
npm run typecheck
```

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md).

Please also read:

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE.md](LICENSE.md)

## Licensing

This project is source-available. Personal, educational, internal, and non-commercial use are allowed. Commercial use is not allowed under the included license.

## Branding

The project name is MovieVaultBridge.

The name reflects what the tool actually does: bridge a source movie library into a curated target vault with matching, review, planning, and guarded execution.
