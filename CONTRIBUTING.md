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
- Keep observability labels honest: PostgreSQL activity/execution time is not host CPU, and true CPU/RAM requires an explicit external telemetry adapter.
- Keep the data workspace on a transient nonprivileged, non-owner login. Raw user SQL must stay on the non-interpolated `pg-cursor` extended-protocol path, require returned row fields, and run in a rollback-only `READ ONLY` transaction; do not substitute a regex SQL classifier.
- Preserve the 256 KiB request cap, requested-row-plus-one fetch, dedicated two-active/eight-waiting workspace budget, hard socket deadline, owner/inherited-owner rejection, audit redaction, and PostgreSQL permission/RLS enforcement.
- Do not describe the 32,768-character post-decode cell truncation as an absolute input-memory bound; one exceptionally large PostgreSQL datum is decoded first.

Run before submitting:

```bash
pnpm check
pnpm test:postgres
pnpm test:e2e:mvp
pnpm build
```

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
