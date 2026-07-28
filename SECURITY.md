# Security policy

## Reporting a vulnerability

Do not open a public issue for suspected credential disclosure, authentication bypass, SQL injection, or remote-code execution. Use [GitHub private vulnerability reporting](https://github.com/bestmaa/dbmason/security/advisories/new) with the affected version, impact, reproduction, and any suggested mitigation. Do not include a live credential or production data; use a disposable reproduction. A public advisory should follow after a fix is available.

## Deployment guidance

- Generate independent random values for `PAYLOAD_SECRET` and `CONNECTION_ENCRYPTION_KEY`.
- Never commit `.env`, SQLite files, backups, or browser traces containing credentials.
- Put DBMason behind HTTPS and restrict it to trusted administrators.
- Set `DBMASON_PUBLIC_URL` to the exact browser-facing origin. Only exact loopback hosts may use HTTP; all other origins require HTTPS.
- Payload account passwords are rejected below 12 characters on bootstrap, direct changes, and reset flows.
- Strongly recommend RFC 6238 authenticator 2FA for owners and admins. It is opt-in per account; store the one-use recovery codes offline.
- Restrict container egress to approved database networks when possible.
- Set `DATABASE_HOST_ALLOWLIST` to the exact database hosts or `*.domain` patterns the deployment may reach. DBMason also rejects metadata/link-local, unspecified, and multicast targets.
- Prefer `verify-full` TLS certificate and hostname verification for every remote PostgreSQL or MySQL target.
- Use a dedicated engine management principal with only the capabilities required by the workflows you enable; avoid PostgreSQL superuser or MySQL `root` in production when practical.
- Grant `pg_read_all_stats` only when full cluster activity counts are required. It exposes information about other sessions; without it, DBMason deliberately marks activity details restricted.
- Back up SQLite consistently and protect the backup like a password vault.
- Run one DBMason application replica while SQLite is configured.
- Treat `require` and `prefer` TLS modes as weaker exceptions; `verify-full` is the default for remote servers.

Generated database-user passwords are intentionally displayed once. Connection passwords are encrypted at rest, but a running authorized server process can decrypt them to connect; host and runtime security remain part of the trust boundary.

Ordinary manager JSON request bodies are rejected above 64 KiB. The
credential-bearing workspace uses a separate 256 KiB cap and the tighter
query/result limits described below.

DNS lookups are bounded by the global operation limiter but do not yet have a separate cancellation deadline. Deployments should combine `DATABASE_HOST_ALLOWLIST` with network-level egress rules so DNS behavior alone is never the security boundary.

## Application two-factor authentication

DBMason offers optional per-account six-digit, 30-second TOTP compatible with
Google Authenticator, Microsoft Authenticator, and other RFC 6238 applications. Setup
QR codes are generated inside DBMason; the `otpauth://` URI is never sent to an
external image service. TOTP seeds use AES-256-GCM with user-bound associated
data and an HKDF-derived subkey of `CONNECTION_ENCRYPTION_KEY`. Recovery codes
are generated with cryptographic randomness, shown once, stored only as keyed
hashes, and removed after use.

Password checks use Payload's existing five-attempt lockout. Authenticator and
recovery failures have a separate five-attempt, ten-minute account lock plus a
short-lived one-use login challenge. Accepted TOTP counters are recorded so the
same time-step code cannot be replayed. Direct calls to Payload's ordinary
login endpoint fail closed because only the server-created, factor-verified
flow may issue a session. Accounts with 2FA disabled receive a password-only
session through that same exact-origin flow. Enabling or disabling 2FA revokes
all of the account's existing sessions before requiring a fresh sign-in.
Authentication mutations are serialized inside the
single supported SQLite application replica so concurrent requests cannot
reuse a challenge, recovery code, or stale failure counter.

The historical 2FA schema migration deletes sessions issued by older builds so
they cannot outlive the authentication upgrade. Back up the SQLite volume
before upgrading, then expect every user to sign in again. Password-reset auto-login remains fail closed
until a factor-aware reset screen is implemented; do not bypass the login hook
for reset tokens, because Payload otherwise returns an authenticated session.
If both the authenticator and recovery codes are lost, recovery requires an
operator with protected host-level access to the control-plane database.
The current password is required to start enrollment. Disabling requires both
the current password and a valid authenticator or recovery code. An account
that remains opted out is protected only by its password, so restrict DBMason
to trusted networks and enable 2FA for high-privilege users. Keep
`CONNECTION_ENCRYPTION_KEY` stable and recoverably backed up: changing it
without migrating encrypted values makes saved connection credentials and TOTP
seeds unreadable.

TOTP reduces the impact of a stolen password. It does not protect a session
already stolen from the browser, malicious code running in the application
origin, phishing that relays a live code, or a compromised server runtime.

## Displayed database connection URLs

The connection-details dialog treats the saved management `host:port` as an
internal endpoint. An external endpoint is optional owner/admin-maintained
metadata; DBMason cannot discover Dockploy port publishing and saving this
metadata does not expose a port or change a database server. Only owners and
admins can open connection details; lower roles receive redacted external
endpoint fields from connection-list responses.

URL templates use a selected standard login account from live inventory. The
saved encrypted administrator password is never decrypted or returned for this
feature. A complete URL can be copied only after the owner or admin enters the
selected restricted account's password into transient browser state; the
rendered page continues to show a `PASSWORD` placeholder, and the transient
password is cleared when the dialog or connection changes.

## Origin, CSRF, and server-rendered authentication

Production startup requires a validated `DBMASON_PUBLIC_URL`. Payload CORS and
CSRF trust exactly that origin rather than a wildcard, and authentication
cookies are marked secure when the configured origin uses HTTPS.

A normal top-level browser navigation does not send an `Origin` header. For the
read-only server render of the product home page, DBMason fills that missing
header from the already validated public origin before asking Payload for the
current account. It never replaces an `Origin` supplied by the request, so a
foreign origin remains foreign and fails Payload's normal check. This fallback
is not used to authorize manager mutations or workspace calls; those endpoints
retain exact-origin CSRF enforcement plus application-role authorization.

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

| Release line            | Security support                                  |
| ----------------------- | ------------------------------------------------- |
| Latest `0.2.x` patch    | Supported.                                        |
| Older `0.2.x` patches   | Unsupported; upgrade to the latest `0.2.x` patch. |
| `0.1.x`                 | Unsupported; upgrade to the latest `0.2.x` patch. |
| Earlier/untagged builds | Not supported.                                    |

Security fixes land only on the latest `0.2.x` patch; older release lines do not
receive backports. Any support-policy change will be announced in a security
advisory.
