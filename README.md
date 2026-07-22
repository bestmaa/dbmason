# DBMason

> Self-hosted database access control plane.

DBMason is a lightweight, self-hosted database access manager for PostgreSQL and MySQL. Save an administrator connection, inspect the live catalog, create databases and restricted accounts, manage their lifecycle through allowlisted access presets, inspect honest engine-native metrics, and browse/query data through a guarded read-only workspace.

The v0.2.0 release is validated against PostgreSQL 17 and MySQL 8.4 LTS. Other
server versions are not claimed until they are added to the compatibility
matrix and real-server CI.

The application is one Payload + Next.js process with SQLite for control-plane metadata. Managed database servers remain the source of truth; DBMason does not copy their catalogs into SQLite or keep idle pools open. PostgreSQL and MySQL behavior lives in isolated adapters rather than shared SQL conditionals.

## Start locally

Requirements: Node.js 22 or 24 and pnpm 9–11.

```bash
cp .env.example .env
# Replace both secrets in .env with cryptographically random values.
pnpm install
pnpm dev
```

`PORT` in `.env` controls the local port (the example uses `3010`). The dev/start scripts preload `.env` before Next chooses its listener. `DBMASON_PUBLIC_URL` must match the exact browser-facing origin; HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]`, while every non-loopback deployment requires HTTPS. Open `http://localhost:3010`; on first run, create the owner account through the Payload admin screen with a password of at least 12 characters.

Official builds link to the GitHub tag matching the running `package.json` version. If you
publish a modified network build, set runtime variable `DBMASON_SOURCE_URL` to the public
corresponding source for that exact build. The login and application pages render that URL
beside the running version for AGPL users.

Generate suitable secrets with:

```bash
openssl rand -hex 32
```

## Docker

After preparing `.env`:

```bash
docker compose up --build -d
```

SQLite is stored in the named `db-control-data` volume. Back it up with a SQLite-consistent backup process before upgrades.
Committed Payload migrations run automatically when the production process initializes. Run only one application replica while SQLite is the control-plane store.
Docker publishes its internal port `3000` on the loopback host port selected by
`PORT`. Set `DBMASON_BIND_ADDRESS=0.0.0.0` only when direct network exposure is
intentional and protected.
The committed Compose profile also applies the tested defaults of one CPU,
384 MiB memory, 256 PIDs, no added Linux capabilities, and no privilege
escalation; tune the two resource values in `.env` when needed.

To run the published v0.2.0 image instead of building locally, set this in
`.env`, then pull and start without a build:

```dotenv
DBMASON_IMAGE=ghcr.io/bestmaa/dbmason:0.2.0
```

```bash
docker compose pull
docker compose up -d --no-build
```

For repeatable production deployment, replace the version tag with the
multi-platform digest shown on the GitHub release/package page. Keep the host
port loopback-bound behind an authenticated reverse proxy unless direct LAN
exposure is intentional.

## Local database test targets

The dedicated test-only PostgreSQL Compose project is separate from the
DBMason application and binds to `127.0.0.1:55432` by default. Prepare its
ignored environment file, validate the configuration, and start it with:

```bash
cp .env.postgres-test.example .env.postgres-test
pnpm postgres:test:config
pnpm postgres:test:up
```

See [docs/POSTGRES_TEST_HARNESS.md](./docs/POSTGRES_TEST_HARNESS.md) for test
credentials, connection fields, logs, stop, and isolated reset commands.

MySQL 8.4 uses a different Compose project, loopback port, volume, environment
file, integration suite, and browser-test control plane:

```bash
cp .env.mysql-test.example .env.mysql-test
pnpm mysql:test:config
pnpm mysql:test:up
```

See [docs/MYSQL_TEST_HARNESS.md](./docs/MYSQL_TEST_HARNESS.md). Both harnesses
are test-only; never reuse their credentials or point their cleanup commands at
a production server.

The complete user workflow and engine-labelled production screenshots are in
[docs/USER_GUIDE.md](./docs/USER_GUIDE.md). The recorded release evidence is in
[docs/VALIDATION_REPORT.md](./docs/VALIDATION_REPORT.md).

## Quality checks

```bash
pnpm check
pnpm test:postgres
pnpm test:mysql
pnpm test:e2e:mvp
pnpm test:e2e:mysql
pnpm build
pnpm payload migrate:status
```

`pnpm check` regenerates Payload types, type-checks strict TypeScript, enforces the props-only UI boundary and 250-line frontend limit, and runs unit tests.
It also validates the generated third-party provenance bundle against both the
frozen production dependency graph and the exact traced standalone runtime;
missing legal coverage fails the gate.
`pnpm build` intentionally uses an ignored build-only SQLite file; production migrations run against the configured persistent database when the server starts.
The commands above, in that order, are the authoritative release gate; the
generic `pnpm test` script is retained for the scaffold integration/browser
suite and does not replace the engine-specific gates.

Read [ARCHITECTURE.md](./ARCHITECTURE.md), [SECURITY.md](./SECURITY.md), and [CONTRIBUTING.md](./CONTRIBUTING.md) before extending an engine or permission model.

## Current scope

- PostgreSQL and MySQL connections with live database/principal inventory
- Encrypted connection secrets
- Database creation
- PostgreSQL role and canonical MySQL `user@host` account creation with a password shown once
- Engine-mapped connect/read/write/developer access presets
- Existing-principal access reconciliation, login enable/disable, one-time password rotation, and protected deletion
- Control-plane-only saved connection removal
- On-demand PostgreSQL statistics/`pg_stat_io` and MySQL server-status/schema metrics
- Guarded relation browsing and row-returning read-only SQL under a transient, nonprivileged engine account
- Payload application RBAC and append-only audit events

Neither PostgreSQL nor MySQL SQL statistics expose trustworthy host/container
CPU or RAM utilization. DBMason reports that boundary instead of inventing a
percentage; an external metrics provider is required for host telemetry.

MySQL accounts are always explicit `user@host` identities. MySQL has no
PostgreSQL-style database owner or per-database `CONNECT` grant; the connect
preset is authentication-only. The MySQL workspace rejects developer, DDL,
routine, trigger, event, temporary-table, lock, global, grant-option, role-linked,
and proxy-linked accounts. See [docs/ENGINE_ADAPTERS.md](./docs/ENGINE_ADAPTERS.md)
for the exact engine differences and limitations.

Write/DDL workspaces, saved queries/history, backups, saved administrator
credential rotation, a visual multi-schema/object grant planner, built-in host
telemetry, and HA control-plane storage remain outside v0.2.0.

DBMason is licensed under [AGPL-3.0-only](./LICENSE). Modified network
deployments must offer their corresponding source to their users. The DBMason
name and logo remain subject to the separate [trademark policy](./TRADEMARKS.md).
Dependency licenses are recorded in [third-party notices](./THIRD_PARTY_NOTICES.md).
