# Changelog

All notable changes to DBMason are recorded here. The project follows
[Semantic Versioning](https://semver.org/) while it is practical to do so.

## [Unreleased]

### Added

- Isolated MySQL engine adapter, Docker integration harness, and browser flow.
- Multi-engine connection and capability-driven interface foundations.

## [0.1.1] - 2026-07-22

### Security

- Override transitive `sharp` to 0.35.3 to remove inherited libvips
  vulnerabilities reported by GHSA-f88m-g3jw-g9cj.
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

[Unreleased]: https://github.com/bestmaa/dbmason/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/bestmaa/dbmason/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/bestmaa/dbmason/releases/tag/v0.1.0
