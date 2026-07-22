# Security policy

## Reporting a vulnerability

Do not open a public issue for suspected credential disclosure, authentication bypass, SQL injection, or remote-code execution. Use [GitHub private vulnerability reporting](https://github.com/bestmaa/dbmason/security/advisories/new) with the affected version, impact, reproduction, and any suggested mitigation. Do not include a live credential or production data; use a disposable reproduction. A public advisory should follow after a fix is available.

## Deployment guidance

- Generate independent random values for `PAYLOAD_SECRET` and `CONNECTION_ENCRYPTION_KEY`.
- Never commit `.env`, SQLite files, backups, or browser traces containing credentials.
- Put DBMason behind HTTPS and restrict it to trusted administrators.
- Restrict container egress to approved database networks when possible.
- Set `DATABASE_HOST_ALLOWLIST` to the exact database hosts or `*.domain` patterns the deployment may reach. DBMason also rejects metadata/link-local, unspecified, and multicast targets.
- Prefer `verify-full` TLS certificate and hostname verification for every remote PostgreSQL or MySQL target.
- Use a dedicated engine management principal with only the capabilities required by the workflows you enable; avoid PostgreSQL superuser or MySQL `root` in production when practical.
- Grant `pg_read_all_stats` only when full cluster activity counts are required. It exposes information about other sessions; without it, DBMason deliberately marks activity details restricted.
- Back up SQLite consistently and protect the backup like a password vault.
- Run one DBMason application replica while SQLite is configured.
- Treat `require` and `prefer` TLS modes as weaker exceptions; `verify-full` is the default for remote servers.

Generated database-user passwords are intentionally displayed once. Connection passwords are encrypted at rest, but a running authorized server process can decrypt them to connect; host and runtime security remain part of the trust boundary.

DNS lookups are bounded by the global operation limiter but do not yet have a separate cancellation deadline. Deployments should combine `DATABASE_HOST_ALLOWLIST` with network-level egress rules so DNS behavior alone is never the security boundary.

## PostgreSQL role lifecycle boundary

Existing-role access, login, password rotation, and drop actions fail closed when the target is the active management role or recursively belongs to it, a `pg_*` role, or any role with superuser, `CREATEDB`, `CREATEROLE`, replication, or `BYPASSRLS`. The adapter treats inherited and PostgreSQL 17 `SET`-only membership as unsafe. This prevents an operator from rotating or enabling an apparently ordinary login and then using its inherited or assumable elevated role.

## MySQL account lifecycle boundary

MySQL identities are explicit `user@host` values; selecting a user name without
its host is rejected. Before access, login, password, or drop mutations, the
adapter rejects the current/system account, any global privilege, grant option
at schema/table/column/routine scope, either side of a role edge, and either side
of a `PROXY` edge. These checks intentionally require access to MySQL privilege
metadata and fail closed when it cannot be inspected.

MySQL access replacement inventories and validates direct schema, table, column,
and routine grants on the selected database before revoking them and applying an
allowlisted preset. Unsupported grant shapes stop before mutation. DCL is not
transactional, so a later server failure can leave the account with reduced
access; DBMason does not pretend cross-statement atomicity. Global, inherited,
role, and proxy privileges are never silently rewritten.

## Observability boundary

The observability tab reads native engine statistics on demand. PostgreSQL
returns connection capacity, cumulative transaction/cache/temp/deadlock/session
counters, database sizes, `pg_stat_io`, uptime, and primary/replica state. MySQL
returns server-status counters, connection capacity, uptime/read-only state, and
visible schema size/charset/collation. PostgreSQL-only fields are never inferred
from MySQL counters.

These values are not host telemetry. Database activity, query duration, status,
and I/O counters do not equal host/container CPU, RAM, load average, network
throughput, or physical-disk utilization. DBMason returns
`external-provider-required` for host telemetry. Do not mount a Docker/Podman
control socket into DBMason to fill that gap; use a separately authenticated,
least-privileged metrics provider or platform API.

Routine observability snapshots are not stored in SQLite or mutation audits. Responses remain same-origin, authenticated, and `Cache-Control: no-store`.

## Read-only data workspace

The data workspace is an operator feature, not an administrator SQL console:

- Only DBMason owners, admins, and operators may call its endpoints; viewers receive `403`.
- The browser supplies a transient nonprivileged PostgreSQL login and password. The password is kept only in active React state, cleared on disconnect/connection change, sent over the request transport, and never persisted or audited.
- The saved PostgreSQL administrator credential is used only to reject unsafe workspace roles. SQL and catalog reads run through a new connection authenticated as the transient role.
- The role must have `LOGIN` and cannot be the saved administrator, a superuser, `CREATEDB`, `CREATEROLE`, replication, or `BYPASSRLS`; have any direct/recursive membership, including `SET`-only membership, in the saved administrator, a privileged role, or a `pg_*` role; or directly/indirectly own the selected database or one of its non-system relations.
- Submitted SQL is sent without interpolation through `pg-cursor` and PostgreSQL's extended query protocol. PostgreSQL rejects stacked statements at the one-prepared-statement boundary, and DBMason accepts only statements that return row fields; it does not depend on a regex classifier or parenthesized SQL wrapper.
- Every workspace operation starts a server-enforced `READ ONLY` transaction, enables `row_security`, and issues `ROLLBACK` on success as well as failure. PostgreSQL permissions, memberships, and RLS policies remain authoritative, so use a dedicated non-owner role with only the intended schema `USAGE` and relation `SELECT` grants.
- `READ ONLY` blocks database writes; it is not a process/network sandbox. Do not grant the workspace role `EXECUTE` on untrusted user functions or extensions that can cause external side effects, because those effects cannot be undone by `ROLLBACK`.
- JSON request bodies are limited to 256 KiB. A five-second statement timeout, one-second lock timeout, 4 MiB `work_mem`, requested-row-plus-one cursor fetch, 200-row cap, 1 MiB serialized-response cap, and cell/query length limits reduce abuse. A separate workspace budget permits two active and eight waiting operations, and a seven-second hard deadline destroys a stuck workspace socket.
- Cell truncation is post-decode. One exceptionally large PostgreSQL datum may therefore consume more input memory before DBMason truncates its displayed representation to 32,768 characters; the cell/response caps are not absolute peak-allocation guarantees. Retain PostgreSQL-side resource controls and monitoring.

Workspace audit events record intent/outcome, actor, duration, sanitized error code, and a safe principal/database/relation target. They never contain the transient password, submitted SQL, result rows, raw database errors, or stack traces. Treat displayed result data and browser memory as sensitive and require HTTPS.

### MySQL-specific workspace rules

- The transient identity is a canonical `user@host`; `CURRENT_USER()` must match it after login.
- Administrator preflight rejects dangerous privileges across all schemas. The transient session then applies a fail-closed `SHOW GRANTS` allowlist: only `USAGE` plus directly scoped `SELECT`, `SHOW VIEW`, `INSERT`, `UPDATE`, and `DELETE` grants are accepted. Global, grant-option, role/default-role, proxy, DDL, routine, trigger, event, temporary-table, lock, and unclassified grants are rejected.
- MySQL `START TRANSACTION READ ONLY`, `multipleStatements: false`, a row-returning result requirement, five-second server deadline, seven-second socket deadline, one-row streaming high-water mark, and the shared row/body/response/concurrency limits form the database-write and resource boundary.
- Developer accounts receive database `ALL PRIVILEGES` and therefore cannot use the workspace. MySQL's authentication-only `connect` preset has no database read access.
- Routine privileges are rejected because a stored routine/plugin can cause an external side effect that rollback cannot undo. Temporary-table capability is rejected because MySQL permits some temporary-table changes in a read-only transaction.
- Catalog browsing stays in the selected database, but a safe query may read another explicitly qualified schema when native grants allow it. The selected database is not a confidentiality boundary; grant only intended data access on every schema.

For both engines, result-cell truncation occurs after the driver decodes a value,
so the 32,768-character display limit is not an absolute peak-input-memory cap.

## TLS and network identity

The host allowlist and address classifier run before either adapter connects.
For MySQL, DBMason connects its socket to the vetted resolved address while
retaining the configured hostname for TLS SNI/verification, then explicitly
checks the peer identity in `verify-full` mode, including literal-IP SANs. A DNS
answer can still change between requests, and DNS resolution has no independent
cancellation deadline; enforce deployment egress rules as the final boundary.

`require` encrypts without verifying server identity. `prefer` is a legacy mode
that falls back to plaintext only for an explicit unsupported-TLS handshake.
Use those modes only for a reviewed local/legacy exception. A MySQL account host
of `%` increases reliance on TLS, MySQL bind/firewall policy, and network scope.

## Supported releases

Until the first stable release, security fixes target the latest main branch only.
