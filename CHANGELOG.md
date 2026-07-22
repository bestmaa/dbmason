# Changelog

All notable changes to DBMason are recorded here. The project follows
[Semantic Versioning](https://semver.org/) while it is practical to do so.

## [Unreleased]

## [0.2.0] - 2026-07-22

### Added

- Isolated MySQL 8.4 adapter with canonical `user@host` accounts, database and
  lifecycle management, allowlisted access reconciliation, native
  observability, and guarded data/SQL workspace.
- Dedicated pinned MySQL Docker harness, real-server integration tests, and a
  serial Chromium lifecycle suite independent of the PostgreSQL harness.
- Engine-discriminated API metadata, capability-driven UI, adapter extension
  guide, and workflows for hosted CI, CodeQL, and multi-platform GHCR
  publication with SBOM and provenance.
- Fail-closed third-party provenance generation for the frozen production
  dependency graph, traced standalone runtime, Next.js compiled dependencies,
  and native libSQL/SQLite closure.

### Security

- Reject dangerous MySQL global, grant-option, role, proxy, routine, cross-
  schema, developer, and system/current-account workspace or lifecycle paths.
- Pin vetted resolved MySQL addresses while preserving TLS SNI and hostname/IP
  identity verification.
- Cap ordinary manager JSON bodies at 64 KiB and workspace bodies at 256 KiB;
  keep transient credentials out of persistence, audit records, and caches.
- Enforce zero-known-vulnerability dependency resolutions and mechanically
  prohibit both PostgreSQL and MySQL drivers in presentational UI.
- Disable unused image optimization, exclude its native optional chain and
  leaked test helpers from the standalone runtime, and enforce that boundary
  in CI and container builds.
- Require and validate the exact public origin in production, configure Payload
  CORS/CSRF and secure-cookie behavior from it, enforce 12-character account
  passwords across bootstrap/change/reset paths, and add defensive response
  headers.
- Restore authenticated top-level navigation by supplying the validated origin
  only when the read-only server render has no `Origin` header; preserve every
  caller-supplied origin so foreign-origin requests are not normalized into
  trusted requests.

### Changed

- Replace shared PostgreSQL-shaped database summaries with strict,
  engine-specific PostgreSQL and MySQL variants.
- Display exact running version, AGPL license, and corresponding-source URL in
  network-served builds.

## [0.1.1] - 2026-07-22

### Security

- Pin transitive `sharp` to 0.35.3 to address GHSA-f88m-g3jw-g9cj.
- Update the production image to the current Node.js 24 LTS Alpine image and
  pin its multi-platform manifest digest.

## [0.1.0] - 2026-07-21

### Added

- Initial PostgreSQL control-plane milestone.
- Encrypted saved connections, database and login-role creation, allowlisted
  permission presets, lifecycle controls, audit events, observability, and a
  guarded read-only data workspace.
- SQLite-backed Payload control plane, Docker deployment, real PostgreSQL 17
  integration tests, Chromium end-to-end tests, and operator documentation.

[Unreleased]: https://github.com/bestmaa/dbmason/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bestmaa/dbmason/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/bestmaa/dbmason/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bestmaa/dbmason/releases/tag/v0.1.0
