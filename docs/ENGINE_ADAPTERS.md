# Engine adapter guide

DBMason is a control plane with engine-neutral application workflows and
engine-owned database behavior. A new engine is an adapter, not a collection of
conditionals inserted into an existing adapter.

## Dependency direction

```text
transport / Payload / frontend
            ↓
engine-neutral application service
            ↓
domain contracts and capabilities
            ↑
infrastructure/<engine> adapter
            ↓
that engine's driver and allowlisted SQL
```

Domain code never imports React, Next.js, Payload, or a database driver. The
registry is the only place that constructs concrete engine adapters. SQL for an
engine exists only below that engine's infrastructure directory.

Current boundaries:

```text
src/modules/database-manager/infrastructure/
├── engines/       # registry only
├── mysql/         # MySQL driver, identifiers, accounts, SQL, workspace, metrics
├── postgresql/    # PostgreSQL driver, identifiers, roles, SQL, workspace, metrics
├── payload/       # control-plane persistence
└── security/      # engine-neutral credential encryption/password generation

tests/
├── mysql/         # real MySQL adapter tests
└── postgres/      # real PostgreSQL adapter tests
```

The only shared database-network code is the engine-neutral host resolution,
address rejection, and allowlist policy under `infrastructure/network/`.
Drivers, connection/TLS mapping, identifiers, principal safety, SQL, metrics,
workspace behavior, and operation limiters remain engine-owned.

## Capability contract

Every snapshot declares what its adapter actually supports. The UI and
application service use these capabilities; they do not guess support from an
engine name. An unsupported operation must be hidden or rejected with a stable
typed error, never emulated with unrelated SQL.

Shared concepts are deliberately narrow:

- a saved administrator connection;
- database/schema inventory as represented by the engine;
- principal/account inventory;
- database creation when the engine supports it;
- allowlisted access presets;
- lifecycle operations that can be made safe for that engine;
- engine-native observability with honest unavailable sections; and
- a bounded read-only workspace authenticated as a transient nonprivileged
  principal.

Names that only look similar are not automatically the same concept. A
PostgreSQL role is not a MySQL `user@host` account. PostgreSQL database ownership
and `PUBLIC CONNECT` have no direct MySQL equivalent. MySQL status variables are
not `pg_stat_io`. Host CPU/RAM is not a native database counter in either
adapter.

## Adapter safety requirements

Each adapter must:

1. use the engine's official identity model end to end;
2. validate and quote identifiers with engine-owned helpers;
3. parameterize values wherever the protocol supports it and use a reviewed
   driver escape primitive where account-management grammar does not;
4. keep multi-statement execution disabled;
5. protect the active administrator, system identities, global/elevated
   principals, grant-option holders, owners, and equivalent privilege paths;
6. preflight all targets before a multi-step mutation and compensate only work
   created by the failed request;
7. open connections on demand under the global operation budget and close or
   destroy them on every path;
8. return sanitized stable errors while keeping raw driver messages out of the
   browser and audit trail;
9. run workspace SQL as the supplied restricted identity under the engine's
   server-enforced read-only mode, result/size/deadline bounds, and single-
   statement protocol boundary; and
10. verify behavior against a dedicated real database version in Docker.

Read-only database transactions do not sandbox stored functions, plugins,
extensions, or network/filesystem side effects. Documentation must tell
operators not to grant execution of untrusted routines to workspace accounts.

## PostgreSQL mapping

- Identity: PostgreSQL role, maximum 63 UTF-8 bytes.
- Database semantics: owner and `PUBLIC CONNECT`/temporary access are native and
  displayed explicitly.
- Presets: database `CONNECT`, `public` schema/object grants, and best-effort
  owner default privileges for future objects.
- Workspace: transient login through `pg-cursor` extended protocol in a
  rollback-only `READ ONLY` transaction with RLS enabled; owners and privileged
  membership closures are rejected.
- Observability: PostgreSQL statistics and `pg_stat_io`, never host telemetry.

## MySQL mapping

- Identity: canonical `user@host`; user names are at most 32 bytes, identifiers
  at most 64 bytes, and the host is explicit. `%` is supported with a security
  warning; partial host wildcards are rejected.
- Database semantics: a MySQL database maps to a schema. There is no
  PostgreSQL-style owner and no per-database `CONNECT` privilege, so owner is
  unsupported and `connect` is authentication-only with a warning.
- Presets: `read` is `SELECT, SHOW VIEW`; `write` adds
  `INSERT, UPDATE, DELETE`; `developer` is database-scoped `ALL PRIVILEGES` and
  is deliberately barred from workspace use.
- Reconciliation: before replacement, the adapter validates and revokes direct
  schema, table, column, and routine grants for that database. Unknown shapes
  stop before mutation. MySQL DCL is not transactional, so an interrupted later
  step can leave reduced access. Global/role/`PROXY` authority is protected,
  not rewritten.
- Lifecycle safety: current/system accounts, global privileges, every scope of
  grant option, either side of a role edge, and either side of a `PROXY` edge
  fail closed before login/password/access/drop actions.
- Workspace: `CURRENT_USER()` must match, administrator catalog checks cover
  dangerous grants across all schemas, and the transient session repeats a
  fail-closed `SHOW GRANTS` allowlist after login. Only `USAGE` and directly
  scoped read/DML grants are accepted before `START TRANSACTION READ ONLY`.
  Routine/DDL/trigger/event/temp-table/lock authority is rejected. Browsing is
  selected-database-only, but native cross-schema read grants still apply to
  explicitly qualified queries.
- TLS/network: the socket is pinned to the vetted DNS result while the original
  hostname is preserved for SNI and certificate verification; `verify-full`
  explicitly checks DNS or IP identity. Deployment egress remains required.
- Observability: genuine MySQL server-status, activity availability, connection,
  and visible schema metrics. CPU/RAM remains external-only, and PostgreSQL-only
  counters are absent.

## Verification

```bash
pnpm check
pnpm test:postgres
pnpm test:mysql
pnpm test:e2e:mvp
pnpm test:e2e:mysql
```

The MySQL and PostgreSQL Compose projects use different loopback ports,
networks, volumes, environment files, Vitest configs, Playwright configs, and
SQLite control planes. See `POSTGRES_TEST_HARNESS.md` and
`MYSQL_TEST_HARNESS.md`. A browser workflow is not release evidence until its
run and screenshots are recorded in `VALIDATION_REPORT.md`.

## Adding another engine

For MongoDB or another future engine:

1. add the engine ID and capability metadata to engine-neutral contracts;
2. create a new `infrastructure/<engine>/` directory and driver dependency;
3. implement the complete adapter contract without importing another engine;
4. add engine-specific input defaults and copy through view-model strategies;
5. add an isolated Compose project, environment example, real integration
   suite, and serial Chromium workflow;
6. document identity, privilege, observability, TLS, transaction, and cleanup
   semantics specific to that engine;
7. run all existing engine suites to prove there is no regression; and
8. ship it in its own feature branch, changelog section, semantic version, tag,
   and GitHub release.

Never add an arbitrary administrator-SQL endpoint as an adapter shortcut.
