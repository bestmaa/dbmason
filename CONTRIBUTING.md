# Contributing

Thank you for improving DBMason. Read `ARCHITECTURE.md`, `SECURITY.md`, and
`AGENTS.md` before editing product code. For substantial behavior or a new
database engine, open a design discussion first so its capability and security
boundaries are reviewable before implementation.

Key rules:

- Keep UI props-only; state/effects belong in hooks and I/O belongs in services.
- Keep every handwritten frontend source/style file at or below 250 lines.
- Do not add explicit `any`, arbitrary administrator/write-SQL endpoints, raw identifier interpolation, permanent pools per saved server, or plaintext credential storage.
- Keep domain contracts independent of frameworks and drivers.
- Keep every database implementation isolated under its own infrastructure
  adapter and real-database test directory. Shared layers may depend only on
  engine-neutral contracts and declared capabilities.
- Add unit tests for security-sensitive helpers and integration tests for engine behavior.
- Keep observability labels honest: database activity/status is not host CPU, and true CPU/RAM requires an explicit external telemetry adapter. Never map MySQL counters into PostgreSQL-only labels.
- Keep every data workspace on a transient, nonprivileged identity. PostgreSQL SQL stays on the non-interpolated `pg-cursor` extended-protocol path inside rollback-only `READ ONLY`; MySQL stays on `multipleStatements: false`, the streaming result path, a fail-closed `SHOW GRANTS` allowlist, and `START TRANSACTION READ ONLY`.
- Preserve the 256 KiB request cap, requested-row-plus-one fetch, dedicated two-active/eight-waiting workspace budget, hard socket deadline, per-engine principal-safety rechecks, audit redaction, and native permission enforcement.
- Do not describe the 32,768-character post-decode cell truncation as an absolute input-memory bound; one exceptionally large driver-decoded datum is processed first.
- Keep canonical MySQL `user@host` identity through every layer. MySQL has no PostgreSQL owner or per-database `CONNECT` equivalent; do not simulate either.
- Keep MySQL direct-grant reconciliation and all MySQL SQL inside `infrastructure/mysql/`. Unknown grants, role/PROXY edges, global privilege paths, or grant-option holders must fail closed.

Run before submitting:

```bash
pnpm check
pnpm test:postgres
pnpm test:mysql
pnpm test:e2e:mvp
pnpm test:e2e:mysql
pnpm build
```

The real-server harnesses are isolated. Copy `.env.postgres-test.example` and
`.env.mysql-test.example` to their ignored local files before running them. Use
`postgres:test:reset` or `mysql:test:reset` only when the corresponding dedicated
test volume may be destroyed.

Changes to Payload collections must include regenerated `src/payload-types.ts` and a production migration. Engine mutations need real-database tests; authorization or user-flow changes need browser coverage. Describe security implications and migration behavior in the pull request.

## Contribution license and provenance

All contributions are licensed under `AGPL-3.0-only`. Commits must include a
`Signed-off-by` trailer created with `git commit -s`. By signing off, you certify
the [Developer Certificate of Origin 1.1](https://developercertificate.org/):
that you have the right to submit the work under the project license and that
the contribution and its provenance may be recorded publicly.

Do not copy code, documentation, images, or generated assets from a source
whose license is incompatible or whose provenance is unclear. Mention all
third-party material and its license in the pull request.

## Pull requests

Keep each pull request focused. Include the user-visible outcome, architecture
impact, exact verification commands, screenshots for visible changes, and any
upgrade or rollback steps. Never include real credentials, private hosts,
database dumps, query results, `.env` files, SQLite files, Playwright traces, or
other generated data.
