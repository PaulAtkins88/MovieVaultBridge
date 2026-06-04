# Changelog

All notable changes to this project will be documented in this file.

The format is loosely based on Keep a Changelog and uses calendar dates where that reads better for an internal-first tool.

## [Unreleased]

### Changed

- Project branding was renamed to MovieVaultBridge across the documentation, UI title, and public repo assets.
- Added an SVG logo and a lightweight GitHub Pages landing site.

### Added

- Browser-editable source, target, and sandbox folder settings.
- Async copy job tracking with live progress snapshots.
- Persisted latest copy report for post-run review.
- Saved review decisions for ambiguous matches and quality upgrades.
- Separate source refresh and target inventory refresh flows.
- SQLite-backed dashboard snapshots, target inventory cache, runtime settings, and review runbook.
- Matching now relies more heavily on local metadata evidence when available.
- Low-evidence cases are held back for manual review instead of auto-copy.
- Real copy is protected by both environment flags and an explicit typed confirmation.

## [0.1.0] - 2026-06-04

### Added

- Initial monorepo structure with Fastify backend and React frontend.
- Local movie scanning and target inventory comparison.
- Dry-run planning for missing titles.
- Sandbox copy execution.
- Guarded real copy execution.
- Cinematic dashboard UI.