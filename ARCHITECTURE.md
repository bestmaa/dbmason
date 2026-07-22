# DBMason architecture

## Goals

DBMason is an open-source, browser-based database access manager with four priorities:

1. Safe user, role, database, and permission management.
2. A small self-hosted footprint and one application container.
3. A replaceable frontend with no business logic inside presentation components.
4. Engine boundaries that allow MySQL and other databases without redesigning the product.

PostgreSQL is the only implemented engine in v1. SQLite stores the control plane; managed servers remain authoritative for databases, principals, and grants.

## Runtime topology

```text
Browser
  |
  | same-origin HTTPS
  v
Next.js + Payload process
  |-- custom product UI
  |-- Payload authentication/RBAC
  |-- custom manager endpoints
  |-- AES-GCM credential vault
  |-- SQLite control plane
  |
  | on-demand PostgreSQL client (bounded globally)
  v
Managed PostgreSQL server(s)
```

There is no Go service, no MongoDB sidecar, no permanent pool per saved server, and no background catalog polling.

## Dependency direction

```text
Presentational UI
        ^ props and callbacks
Connector (only client boundary)
        ^
Controller hook
        ^
Browser API service
        ^ HTTP
Payload endpoint
        ^
Application service/use case
        ^ ports/contracts
Domain
        ^
Infrastructure adapters
  |-- Payload/SQLite
  |-- credential vault
  `-- PostgreSQL
```

Dependencies point inward. Domain contracts do not import React, Next.js, Payload, or `pg`. SQL does not leave the PostgreSQL adapter.

## Frontend architecture

The product UI is separate from Payload Admin. Payload Admin is reserved for owner account bootstrap, application-user administration, access profiles, connection metadata inspection, and audit inspection.

```text
DatabaseManagerConnector
  -> useDatabaseManager
      -> useResourceCreation
      -> usePrincipalManagement
      -> useConnectionRemoval
      -> useObservability
      -> usePostgresWorkspace
      -> browser API clients
  -> DatabaseManagerView(props)
      -> ConnectionRail(props)
      -> WorkspaceHeader(props)
      -> ResourcePanel(props)
          -> ObservabilityPanel(props)
          -> DataWorkspacePanel(props)
      -> dialogs(props)
```

Rules enforced by ESLint and `scripts/check-source-lines.mjs`:

- Presentational UI imports no hooks, services, Payload, `pg`, or navigation APIs.
- UI owns no `useState`, `useEffect`, reducer, storage, fetch, or domain validation.
- The connector calls one composed hook and spreads its result into the view.
- Hooks own React state/effects and orchestration.
- Browser services own HTTP and browser APIs such as clipboard.
- Every handwritten frontend TypeScript and stylesheet is at most 250 physical lines.
- Explicit `any` is an error. External values begin as `unknown` and are validated.

## Control-plane data

### `users`

Payload authentication plus application roles:

- `owner`: account and system administration
- `admin`: users and manager configuration
- `operator`: database mutations
- `viewer`: read-only inventory

The first account is promoted to owner. Roles are saved into the Payload JWT to make checks cheap.

### `database-connections`

Stores only connection metadata and a versioned encrypted credential envelope:

- public UUID, display name, engine
- host, port, maintenance database, administrator username
- TLS mode
- status, last health time/latency, server version
- creator relationship
- AES-256-GCM envelope (never readable through collection access)

Remote databases and roles are never mirrored here. Connection passwords are never returned to the browser.

The data workspace does not reuse the saved administrator password for user SQL. Its selected database, restricted PostgreSQL login name, and password are request-scoped inputs. The password stays in React state for the active browser tab, is cleared on disconnect/connection change, and is never written to SQLite or audit data.

### `access-profiles`

Stores reusable, engine-specific access profiles. The first UI uses code-defined connect/read/write/developer presets; the collection provides the extension point for user-defined profiles.

### `audit-events`

Append-only intent/result records:

- request ID, actor, connection, action, target
- `requested`, `succeeded`, or `failed`
- duration and a sanitized error code

Passwords, raw DSNs, cookies, SQL statements, stack traces, and raw PostgreSQL errors are forbidden.

## PostgreSQL execution

`PostgresEngine` implements the engine-neutral `DatabaseEngine` contract.

Each operation:

1. Acquires one slot from the global concurrency limiter.
2. Creates a `pg.Client` with connection/query/statement timeouts.
3. Connects to the maintenance or selected database.
4. Executes only a typed, allowlisted operation.
5. Closes the client in `finally` and releases the slot.

Two hundred saved connections therefore create zero idle PostgreSQL sockets.

Server-level actions use the maintenance database. Schema/table grants open a separate connection to the target database. `CREATE DATABASE` deliberately runs outside a transaction because PostgreSQL requires it.

Identifiers cannot be query parameters. The adapter rejects empty/NUL/over-63-byte names and quotes every identifier by doubling embedded quotes. No administration endpoint accepts arbitrary SQL or a client-provided privilege token outside the typed allowlist. The sole SQL-text endpoint is the separately authorized, transient-role, read-only workspace described below.

Generated role passwords use 24 cryptographically random bytes encoded as base64url. They are returned once, held only in transient hook state, and never stored or audited.

Before any existing-role access, login, password-rotation, or drop mutation, the PostgreSQL adapter recursively expands `pg_auth_members`. It rejects the active management role and every target whose membership closure contains that role, a `pg_*` role, or a role with superuser, `CREATEDB`, `CREATEROLE`, replication, or `BYPASSRLS`. All membership edges are treated as unsafe here, including PostgreSQL 17 `SET`-only membership, so lifecycle actions cannot reveal or enable a credential that can assume elevated access.

Role creation compensates earlier grants and drops the new role if a later target fails. Access replacement validates the target before revoking current grants and clears partial new grants on failure. PostgreSQL cannot atomically transact across multiple databases, so these paths deliberately fail closed and are covered against the real test server.

## PostgreSQL observability

Observability is an on-demand, read-only PostgreSQL statistics snapshot. It opens one bounded client, begins a short `READ ONLY` transaction, selects a consistent statistics snapshot, and closes the client. There is no background polling or control-plane metrics history.

The adapter exposes engine-neutral typed data backed by PostgreSQL 17 views and functions:

- connection use and configured/reserved capacity
- active, idle, waiting, lock-blocked, and long-running session counts
- per-database cumulative transactions, cache hits, temporary bytes/files, deadlocks, recovery conflicts, checksums, sessions, and size
- cluster `pg_stat_io` operation counters and optional timing
- server start time, primary/replica state, and tracking settings

The observability UI renders the `pg_stat_io` read, write, cache-hit, eviction, writeback, extend, fsync, and reuse counters. When `track_io_timing` is enabled it also renders cumulative read, write, and fsync timing; otherwise the timing state remains explicitly unavailable.

PostgreSQL counters remain decimal strings at the API boundary so long-running totals are not truncated by JavaScript's safe-integer limit. The sampler connection is removed from displayed connection/activity counts. Statistics can lag by roughly one second, and cumulative counters are not presented as per-second rates.

Full session-state fields require the connected PostgreSQL administrator to be a superuser or inherit `pg_read_all_stats`. Without that remote privilege, DBMason returns an explicit unavailable activity section rather than partial zeroes. I/O timing is likewise marked unavailable when `track_io_timing` is off.

Core PostgreSQL SQL does not expose reliable host/container CPU percentage, RAM utilization, load average, network throughput, or physical-device utilization. The response therefore contains `hostTelemetry: { status: 'unavailable', reason: 'external-provider-required' }`. A future provider/exporter adapter must supply those metrics; DBMason never relabels active time or query duration as CPU.

## Guarded data and SQL workspace

The workspace is available to DBMason owners, admins, and operators, never viewers. Every request supplies a transient database, PostgreSQL login role, and password. The saved administrator connection is used only to verify that the selected role exists and is not the active administrator, a superuser, `CREATEDB`, `CREATEROLE`, replication, `BYPASSRLS`, a role inheriting a privileged/`pg_*` membership, or the direct/inherited owner of the selected database or any non-system relation in it. The actual catalog, browse, and SQL operation connects as the selected restricted login and repeats the safety checks inside that session.

The workspace does not attempt to classify PostgreSQL grammar with regexes. It trims the submitted SQL and removes at most one trailing semicolon, then gives the raw text to `pg-cursor` through PostgreSQL's extended query protocol. It does not interpolate the SQL into a parenthesized wrapper. Extended-protocol preparation accepts one statement, so stacked statements are rejected by PostgreSQL, and DBMason rejects statements that return no row fields. Relation browsing uses the same cursor boundary with quoted relation identifiers and parameterized paging values.

Every operation starts `BEGIN READ ONLY`, sets a five-second statement timeout, one-second lock timeout, eight-second idle-in-transaction timeout, 4 MiB `work_mem`, and `row_security = on`, and ends by issuing `ROLLBACK` on both success and failure. The cursor fetches the requested maximum plus one row, allowing DBMason to report truncation without accepting an unbounded result. PostgreSQL's read-only transaction remains the write boundary for writable CTEs, functions, DDL, or other server-parsed paths.

Catalog discovery returns only non-system relations for which the transient role has schema `USAGE` and relation `SELECT`. Relation identifiers use the existing validation/quoting boundary; paging values and row limits are parameters. PostgreSQL permissions and row-level-security policies remain authoritative.

Workspace JSON request bodies are capped at 256 KiB. Other fixed bounds are 32,768 SQL characters, 500 catalog relations, 200 result rows, offset at most 100,000, 32,768 characters per cell, and about 1 MiB of serialized rows. Oversized cells/results are marked truncated. A dedicated limiter permits two active workspace operations and eight waiting operations, with a three-second queue wait; it supplements the global PostgreSQL limiter. A seven-second hard operation deadline destroys the workspace socket if the normal PostgreSQL timeout path does not finish.

Cell truncation happens after the PostgreSQL driver decodes a datum. Consequently, one exceptionally large PostgreSQL datum can allocate more input memory before its displayed value is reduced to 32,768 characters; the cell and serialized-response limits are not an absolute peak-input-allocation bound. PostgreSQL-side resource policy remains necessary.

Workspace passwords, submitted SQL, and returned data never enter audit records; audits contain only the actor, action, safe principal/database/relation target, outcome, duration, and sanitized code.

## Access preset behavior

- `connect`: database `CONNECT`
- `read`: `CONNECT`, schema `USAGE`, existing table `SELECT`, sequence read access
- `write`: read plus table insert/update/delete and sequence usage/update
- `developer`: schema create plus all privileges on existing public-schema tables/sequences

The adapter attempts future-object grants using `ALTER DEFAULT PRIVILEGES FOR ROLE <database owner>`. If the connected administrator cannot alter that owner's defaults, the operation returns a warning rather than pretending future objects are covered.

Current v1 targets the `public` schema. A later access planner will discover schemas/object owners, show a dry-run plan, and apply per-step results.

## API surface

```text
GET  /api/db-manager/v1/connections
POST /api/db-manager/v1/connections
POST /api/db-manager/v1/connections/:id/test
GET  /api/db-manager/v1/connections/:id/snapshot
GET  /api/db-manager/v1/connections/:id/observability
POST /api/db-manager/v1/connections/:id/databases
POST /api/db-manager/v1/connections/:id/principals
POST /api/db-manager/v1/connections/:id/principals/:name/access
DELETE /api/db-manager/v1/connections/:id/principals/:name/access
PATCH /api/db-manager/v1/connections/:id/principals/:name/login
POST /api/db-manager/v1/connections/:id/principals/:name/password
DELETE /api/db-manager/v1/connections/:id/principals/:name
DELETE /api/db-manager/v1/connections/:id
POST /api/db-manager/v1/connections/:id/workspace/catalog
POST /api/db-manager/v1/connections/:id/workspace/rows
POST /api/db-manager/v1/connections/:id/workspace/query
```

Payload custom endpoints are not authenticated automatically. Every manager endpoint explicitly authenticates; mutation and workspace endpoints also enforce their application-role allowlist. Request bodies are parsed from `unknown` with Zod, workspace JSON bodies are rejected above 256 KiB, every response uses `Cache-Control: no-store`, and infrastructure errors become safe response codes. Observability is available to every authenticated application role, while workspace endpoints allow only owner, admin, and operator.

Local API calls acting for a user use `overrideAccess: false`. Intentional system writes (encrypted connection records and audits) use privileged Local API only after explicit endpoint authorization and thread `req` through nested operations.

## Adding another database engine

An engine must implement the same domain contract and register in the engine registry:

```text
testConnection
getSnapshot
getObservability
loadWorkspaceCatalog
browseWorkspaceRelation
runWorkspaceReadOnlyQuery
createDatabase
createPrincipal
setPrincipalAccess
revokePrincipalAccess
setPrincipalLogin
rotatePrincipalPassword
dropPrincipal
```

The frontend consumes neutral concepts: connection, database, principal, capability, access level, observability snapshot, and guarded workspace result. Engine adapters map those concepts to PostgreSQL roles, MySQL users, or future terminology. Engine capability flags control which UI actions appear.

Adding MySQL should require a new infrastructure directory, input mapping, and tests—not changes to Payload auth, UI boundaries, credential encryption, audits, or endpoint semantics.

## Resource model

- One Node/Payload application replica when using SQLite.
- SQLite on a local persistent volume, never a shared network filesystem.
- Generated migrations are committed and passed through `prodMigrations`, so a production container applies pending schema changes before Payload finishes initializing.
- The Next.js build targets an ignored scratch SQLite file, preventing build-time initialization from touching development or production control-plane data.
- SQLite WAL is enabled with full synchronization, a 16 MiB journal limit, and a five-second busy timeout.
- Manual refresh and post-mutation refresh only; no fleet-wide polling.
- Observability loads only when its tab is opened or manually refreshed; snapshots are not persisted.
- Workspace credentials/results live only in the active browser state and bounded request/response lifecycle.
- Live remote catalog data is not cached in SQLite.
- On-demand PostgreSQL clients, globally capped at eight concurrent operations.
- Workspace operations also use a dedicated two-active/eight-waiting limiter and a seven-second hard socket deadline.
- Production Next.js standalone output and a non-root container.

If HA or multiple app replicas become necessary, migrate Payload metadata to PostgreSQL before scaling horizontally. Do not share one SQLite file between replicas.

## Security boundaries and known risks

- Saved target hosts create an outbound-network/SSRF surface. The application rejects metadata/link-local, unspecified, multicast, IPv4-mapped, and malformed zone-scoped targets and supports an exact/wildcard `DATABASE_HOST_ALLOWLIST`. Deployment-level egress restrictions remain the final network boundary.
- DNS resolution currently has no independent cancellation deadline. The global eight-operation limiter bounds exposure, but a future resolver timeout should make that bound time-based as well as concurrent.
- TLS `verify-full` is the strongest mode and the default. `require` encrypts without certificate verification. `prefer` tries TLS first and falls back only for the driver's explicit unsupported-TLS response, so it remains a legacy/weaker choice.
- Remote DDL and local audit writes cannot be one atomic transaction. A requested event precedes work and a terminal event follows; interrupted operations may require reconciliation.
- PostgreSQL may grant `CONNECT` to `PUBLIC`. Inventory and revoke results expose this effective access instead of claiming exclusive isolation.
- Observability is database-engine telemetry, not host telemetry. Do not grant Docker-socket access to obtain CPU/RAM; use an explicitly scoped external provider.
- A read-only transaction prevents database writes but does not grant confidentiality. The workspace rejects direct and inherited owners of the selected database or its non-system relations, while the transient role's remaining native grants, memberships, and RLS behavior still determine which rows it can see; use a dedicated non-owner, least-privileged login.
- `READ ONLY` is a database-write boundary, not a general-purpose sandbox. Revoke `EXECUTE` on untrusted user functions/extensions because PostgreSQL cannot roll back an external side effect that occurs outside the database.
- Read-only SQL can still consume database resources within the enforced time, concurrency, row, and response limits. In particular, the PostgreSQL driver decodes an individual datum before the 32,768-character display truncation, so the documented cell cap is not an absolute input-allocation ceiling. PostgreSQL-side role/database resource policy remains part of the deployment boundary.
- SQLite supports this single-instance product well, but is not the HA storage option.

See `SECURITY.md` for reporting and operational guidance.

## Near-term roadmap

1. Saved connection editing and administrator credential rotation.
2. Multi-schema/object-owner discovery, dry-run grant plans, and per-step reconciliation.
3. PostgreSQL integration and Chromium MVP gates in hosted CI.
4. Cancellable DNS resolution and configurable CIDR egress policy.
5. MySQL engine adapter, including separately mapped observability/workspace capabilities.
6. Optional Payload PostgreSQL control-plane adapter for HA deployments.
