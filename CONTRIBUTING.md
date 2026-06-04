# Contributing To MovieVaultBridge

Thanks for contributing.

## Before you start

- Read the [README.md](README.md) for the product workflow and local setup.
- Read the [LICENSE.md](LICENSE.md). Contributions are accepted only under the same license terms.
- For behavior changes around matching or copy execution, prefer safety over aggressiveness.

## Development setup

```powershell
npm install
npm run dev
```

Useful commands:

```powershell
npm run build
npm run lint
npm run test
npm run typecheck
```

## Contribution rules

- Keep changes focused and minimal.
- Prefer root-cause fixes over cosmetic patches.
- Do not weaken copy safeguards without a strong technical reason.
- Do not introduce automatic overwrite behavior for new-copy items.
- Preserve persisted review decisions and operator intent.
- Document user-visible changes in [CHANGELOG.md](CHANGELOG.md).

## Pull requests

1. Open an issue first for large changes.
2. Use a short branch name that reflects the work.
3. Include tests or a validation note for the touched behavior.
4. Update docs if the workflow, API, or safety model changes.
5. Fill out the pull request template.

## Coding expectations

- TypeScript only for app code.
- Keep public APIs explicit.
- Prefer small composable functions over large stateful blocks.
- Match the existing project structure unless there is a clear reason to refactor it.

## Reporting bugs

Use the GitHub bug report template and include:

- What you expected
- What happened instead
- The folders involved
- Whether the run was dry-run, sandbox, or real target copy
- Relevant logs or screenshots

## Security-sensitive issues

Do not open a public issue for anything that could risk user data, filesystem safety, or unintended writes. Follow [SECURITY.md](SECURITY.md) instead.