# DBMason

> Self-hosted database access control plane.

DBMason is a lightweight, self-hosted database access manager. The first engine is PostgreSQL: save an administrator connection, inspect live databases and roles, create databases, create login roles with one-time passwords, manage their lifecycle through allowlisted access presets, inspect native PostgreSQL activity counters, and browse/query data through a guarded read-only workspace.

The application is one Payload + Next.js process with SQLite for control-plane metadata. Managed PostgreSQL servers remain the source of truth; DBMason does not copy their catalogs into SQLite or keep idle pools open.

## Start locally

Requirements: Node.js 20.9+ and pnpm 9+.

```bash
cp .env.example .env
# Replace both secrets in .env with cryptographically random values.
pnpm install
pnpm dev
```

`PORT` in `.env` controls the local port (the example uses `3010`). The dev/start scripts preload `.env` before Next chooses its listener. Open `http://localhost:3010`; on first run, create the owner account through the Payload admin screen.

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
Docker publishes its internal port `3000` on the host port selected by `PORT`.

## Local PostgreSQL test target

The dedicated test-only PostgreSQL Compose project is separate from the DB
Control application and binds to `127.0.0.1:55432` by default. Prepare its
ignored environment file, validate the configuration, and start it with:

```bash
cp .env.postgres-test.example .env.postgres-test
pnpm postgres:test:config
pnpm postgres:test:up
```

See [docs/POSTGRES_TEST_HARNESS.md](./docs/POSTGRES_TEST_HARNESS.md) for test
credentials, connection fields, logs, stop, and isolated reset commands.

The complete user workflow and production screenshots are in
[docs/USER_GUIDE.md](./docs/USER_GUIDE.md). The recorded release evidence is in
[docs/VALIDATION_REPORT.md](./docs/VALIDATION_REPORT.md).

## Quality checks

```bash
pnpm check
pnpm test:postgres
pnpm test:e2e:mvp
pnpm build
pnpm payload migrate:status
```

`pnpm check` regenerates Payload types, type-checks strict TypeScript, enforces the props-only UI boundary and 250-line frontend limit, and runs unit tests.
`pnpm build` intentionally uses an ignored build-only SQLite file; production migrations run against the configured persistent database when the server starts.

Read [ARCHITECTURE.md](./ARCHITECTURE.md), [SECURITY.md](./SECURITY.md), and [CONTRIBUTING.md](./CONTRIBUTING.md) before extending an engine or permission model.

## Current scope

- PostgreSQL connections, live database/role inventory
- Encrypted connection secrets
- Database creation
- LOGIN role creation with a password shown once
- Connect/read/write/developer access presets for the `public` schema
- Existing-role access replacement and explicit-grant revocation with `PUBLIC` warnings
- Login enable/disable, one-time password rotation, and dependency-safe role deletion
- Control-plane-only saved connection removal
- On-demand PostgreSQL connection, activity, cache, temporary-file, deadlock, size, and rendered `pg_stat_io` counters/timing
- Guarded relation browsing and row-returning read-only SQL under a transient, nonprivileged PostgreSQL login
- Payload application RBAC and append-only audit events

PostgreSQL core statistics do not expose reliable host/container CPU or RAM utilization. DBMason reports that boundary instead of inventing a percentage; an external metrics provider is required for host telemetry.

Write/DDL SQL, saved queries/history, backups, saved administrator credential rotation, multi-schema grant planning, MySQL, and HA control-plane storage remain outside the current PostgreSQL release. MySQL comes later through a separate engine adapter.

DBMason is licensed under [AGPL-3.0-only](./LICENSE). Modified network
deployments must offer their corresponding source to their users. The DBMason
name and logo remain subject to the separate [trademark policy](./TRADEMARKS.md).
