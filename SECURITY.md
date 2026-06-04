# Security Policy

## Scope

This project interacts with local and network filesystem paths. Security and safety issues include, but are not limited to:

- unintended writes outside configured roots
- overwrite or replacement behavior that bypasses safeguards
- path traversal issues
- unsafe handling of runtime-configurable paths
- exposure of sensitive local path information

## Reporting

Do not file public issues for security-sensitive findings.

Instead, use the repository security channel once it is enabled on GitHub:

- https://github.com/PaulAtkins88/MovieVaultBridge/security

## What to include

- affected version or branch
- reproduction steps
- severity and likely impact
- whether the issue affects dry-run, sandbox copy, or real copy
- any proposed fix or mitigation

## Disclosure expectations

- Give maintainers reasonable time to reproduce and fix the issue.
- Avoid public proof-of-concept material until a fix or mitigation is available.