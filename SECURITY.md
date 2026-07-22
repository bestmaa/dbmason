# Security policy

## Reporting a vulnerability

Do not open a public issue for suspected credential disclosure, authentication bypass, SQL injection, or remote-code execution. Use [GitHub private vulnerability reporting](https://github.com/bestmaa/dbmason/security/advisories/new) with the affected version, impact, reproduction, and any suggested mitigation. Do not include a live credential or production data; use a disposable reproduction. A public advisory should follow after a fix is available.

## Deployment guidance

- Generate independent random values for `PAYLOAD_SECRET` and `CONNECTION_ENCRYPTION_KEY`.
- Never commit `.env`, SQLite files, backups, or browser traces containing credentials.
- Put DBMason behind HTTPS and restrict it to trusted administrators.
- Restrict container egress to approved database networks when possible.
- Set `DATABASE_HOST_ALLOWLIST` to the exact database hosts or `*.domain` patterns the deployment may reach. DBMason also rejects metadata/link-local, unspecified, and multicast targets.
- Prefer PostgreSQL TLS certificate verification.
- Use a dedicated PostgreSQL management role with only the capabilities required by the workflows you enable; avoid a superuser when practical.
- Grant `pg_read_all_stats` only when full cluster activity counts are required. It exposes information about other sessions; without it, DBMason deliberately marks activity details restricted.
- Back up SQLite consistently and protect the backup like a password vault.
- Run one DBMason application replica while SQLite is configured.
- Treat `require` and `prefer` TLS modes as weaker exceptions; `verify-full` is the default for remote servers.

Generated database-user passwords are intentionally displayed once. Connection passwords are encrypted at rest, but a running authorized server process can decrypt them to connect; host and runtime security remain part of the trust boundary.

DNS lookups are bounded by the global operation limiter but do not yet have a separate cancellation deadline. Deployments should combine `DATABASE_HOST_ALLOWLIST` with network-level egress rules so DNS behavior alone is never the security boundary.

## PostgreSQL role lifecycle boundary

Existing-role access, login, password rotation, and drop actions fail closed when the target is the active management role or recursively belongs to it, a `pg_*` role, or any role with superuser, `CREATEDB`, `CREATEROLE`, replication, or `BYPASSRLS`. The adapter treats inherited and PostgreSQL 17 `SET`-only membership as unsafe. This prevents an operator from rotating or enabling an apparently ordinary login and then using its inherited or assumable elevated role.

## Observability boundary

The observability tab reads native PostgreSQL statistics on demand. Connection capacity, cumulative transaction/cache/temp/deadlock/session counters, database sizes, `pg_stat_io`, uptime, and primary/replica state come from PostgreSQL itself.

These values are not host telemetry. PostgreSQL active time, waiting sessions, query duration, and I/O operation counters do not equal host/container CPU, RAM, load average, network throughput, or physical-disk utilization. DBMason returns `external-provider-required` for host telemetry. Do not mount a Docker/Podman control socket into DBMason to fill that gap; use a separately authenticated, least-privileged metrics provider or platform API.

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

Workspace audit events record intent/outcome, actor, duration, sanitized error code, and a safe principal/database/relation target. They never contain the transient password, submitted SQL, result rows, raw PostgreSQL errors, or stack traces. Treat displayed result data and browser memory as sensitive and require HTTPS.

## Supported releases

Until the first stable release, security fixes target the latest main branch only.
