# Local PostgreSQL test harness

This Compose project is an integration-test target for DBMason. It is not a
production database and it does not join the application's Compose network.

## Isolation and safety

- The project name is `db-control-postgres-test`.
- The image is the digest-pinned PostgreSQL 17 Alpine manifest recorded in
  `docker-compose.postgres-test.yml`.
- PostgreSQL is published only on the loopback address at `127.0.0.1:55432`.
- The bridge network and data volume belong only to this Compose project.
- Credentials are conspicuously test-only and must never be reused.
- `down` preserves database data; `reset` removes only this harness's volume.

PostgreSQL has no user named `root`. `POSTGRES_TEST_USER` is the test-only
PostgreSQL superuser created by the official image on first initialization.

## Prerequisites and setup

Start the Docker engine. Compose v2 is preferred, but the lifecycle helper
automatically falls back to `docker-compose` v1.29 or newer:

```bash
docker version
docker compose version
# Older installations may instead provide:
docker-compose version
```

Create the ignored local settings file if it is missing:

```bash
cp .env.postgres-test.example .env.postgres-test
```

Port `55432` was free when this harness was added. If another process later
claims it, change `POSTGRES_TEST_PORT` in `.env.postgres-test` before startup.

## Lifecycle commands

Validate the rendered Compose configuration without starting a container:

```bash
pnpm postgres:test:config
```

Start PostgreSQL and wait until its readiness check passes. The helper performs
the wait itself, so the command works with both Compose v1 and v2:

```bash
pnpm postgres:test:up
```

Run the real PostgreSQL integration suite. This command starts the harness if
needed, creates uniquely named temporary databases and roles, verifies SCRAM
login plus connect/read/write/default privileges, lifecycle operations, and
failure compensation. It also exercises native observability snapshots and the
guarded workspace against PostgreSQL 17: precise counters, sampler exclusion,
restricted activity visibility, catalog permissions, relation browsing,
extended-protocol row-returning reads, result truncation, credential rejection, and
server-enforced write blocking. Exact test-only resources are removed afterward:

```bash
pnpm test:postgres
```

Run the isolated Chromium suite with its own SQLite control plane and high
application port:

```bash
pnpm test:e2e:mvp
```

The browser harness refuses non-loopback PostgreSQL hosts, requires the
maintenance database name to contain `test`, and only creates or removes
identifiers prefixed with `dbcontrol_e2e_`.

The suite deliberately confirms PostgreSQL's default `PUBLIC CONNECT` behavior
on an unselected database. DBMason reports that effective access in its
snapshot; it does not silently revoke cluster-wide defaults.

Observability tests distinguish PostgreSQL-native database statistics from
host/container CPU and RAM. The latter remain explicitly unavailable without
an external provider. Workspace tests authenticate with temporary
nonprivileged roles; they never execute user SQL through the harness
superuser. Workspace safety coverage includes direct and inherited ownership
rejection. One safety case invokes a test-only volatile function inside a
rollback-only `READ ONLY` transaction and verifies that PostgreSQL blocks the
write.

Inspect status or follow logs:

```bash
pnpm postgres:test:status
pnpm postgres:test:logs
```

Stop the harness while preserving its database volume:

```bash
pnpm postgres:test:down
```

Reset is destructive for this test database only. It removes the isolated
volume, recreates PostgreSQL, and waits for a healthy server:

```bash
pnpm postgres:test:reset
```

Changing the database, username, or password after first initialization does
not update the existing PostgreSQL cluster. Run `postgres:test:reset` to apply
new bootstrap values.

## Connect DBMason

Run DBMason locally, then add a PostgreSQL connection with:

| Field                  | Value                                   |
| ---------------------- | --------------------------------------- |
| Name                   | Local PostgreSQL test                   |
| Host                   | `127.0.0.1`                             |
| Port                   | `55432`                                 |
| Maintenance database   | `db_control_manager_test`               |
| Administrator username | `db_control_test_admin`                 |
| Password               | `TEST_ONLY_DoNotReuse_7gN4sR9kT2xP6vW8` |
| TLS mode               | Disable/local-only option               |

Equivalent local URL:

```text
postgresql://db_control_test_admin:TEST_ONLY_DoNotReuse_7gN4sR9kT2xP6vW8@127.0.0.1:55432/db_control_manager_test
```

The loopback address is correct when DBMason runs with `pnpm dev` on the
host. A DBMason container has a different network namespace and cannot use
its own `127.0.0.1` to reach this PostgreSQL container.

For a manual Data & SQL check, first create a standard login through DBMason
and copy its one-time password. Use that restricted role in the workspace; do
not enter the test administrator password into the workspace gate. For a full
activity snapshot, the test administrator has the required visibility, while
an ordinary role should produce the explicit restricted-activity state.
