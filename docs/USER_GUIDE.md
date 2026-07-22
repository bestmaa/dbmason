# DBMason user guide

DBMason uses one Payload + Next.js process, SQLite for local control-plane metadata, and short-lived PostgreSQL connections for live inventory and management. PostgreSQL remains the source of truth for databases, roles, and grants.

The screenshots in this guide are credential-free. The production captures were taken from the non-root Docker image; the focused form captures show the same UI in the isolated app-test environment. Test-only database, role, query, and row values may be visible, but no generated or saved password is included.

## 1. Configure the application

Run commands from the repository root. Create `.env` only when it does not already exist:

```bash
test -f .env || cp .env.example .env
```

Set these values:

```dotenv
PORT=3010
DATABASE_URL=file:./data/control-plane.db
PAYLOAD_SECRET=<at-least-32-random-characters>
CONNECTION_ENCRYPTION_KEY=<64-hex-characters>
DATABASE_HOST_ALLOWLIST=
```

Generate independent secrets with `openssl rand -base64 48` and `openssl rand -hex 32`. Keep `.env` and SQLite files out of source control. Set `DATABASE_HOST_ALLOWLIST` to exact hosts or deliberate wildcard domains in production.

`PORT` is read when the process starts. Change it and restart when that port is already occupied; do not kill an unknown process without first verifying its PID and working directory.

## 2. Start DBMason

For local development:

```bash
pnpm install
pnpm dev
```

For the single-container production build:

```bash
docker compose up --build -d
```

The container runs as a non-root user, stores SQLite in the `db-control-data` volume, and publishes its internal port `3000` on the host `PORT` from `.env`. Run one replica while SQLite is the control-plane database.

For a disposable local PostgreSQL target, follow the [test harness guide](POSTGRES_TEST_HARNESS.md):

```bash
test -f .env.postgres-test || cp .env.postgres-test.example .env.postgres-test
pnpm postgres:test:config
pnpm postgres:test:up
pnpm postgres:test:status
```

## 3. Create the first owner

Open the configured application URL. A new control plane shows one bootstrap action:

![Production first-run screen](images/10-production-first-run.png)

1. Select **Create owner account**.
2. Enter a unique email, strong password, and display name.
3. Submit once. Concurrent bootstrap attempts are serialized, and only the first account becomes the initial owner.

Payload Admin then exposes Users, Database Connections, Access Profiles, and Audit Events:

![Production owner dashboard](images/11-production-owner-dashboard.png)

Use separate DBMason accounts for people. Do not share a PostgreSQL administrator credential.

## 4. Add PostgreSQL

1. Return to the product UI and select **Add connection**.
2. Enter a display name, host, port, maintenance database, administrator username, and password.
3. Choose TLS deliberately:
   - **Verify certificate** is the default and validates encryption, certificate trust, and hostname.
   - **Require TLS** encrypts without verifying server identity.
   - **Legacy prefer** tries TLS and may fall back to plaintext only when the server explicitly does not support TLS.
   - **Disabled** is for a trusted local target such as the loopback test harness.
4. Select **Test & save**.

![Connection form](images/03-add-connection.png)

The password is encrypted with AES-256-GCM before it reaches SQLite and is never returned by the connection API. A successful save loads the live PostgreSQL catalog:

![Production connected overview](images/12-production-connected-overview.png)

A DBMason container cannot reach a host-published PostgreSQL port through its own `127.0.0.1`. Give containers deliberate network routing or use an approved host gateway/DNS name, and include that name in `DATABASE_HOST_ALLOWLIST`.

## 5. Inspect PostgreSQL observability

Open **Observability** for the selected connection. DBMason collects one on-demand, read-only PostgreSQL statistics snapshot when the tab opens and when you select **Refresh metrics**; it does not poll the server in the background.

The page shows:

- observed connections versus PostgreSQL's configured maximum and reserved slots
- active, idle, lock-blocked, waiting, and long-running session counts
- primary/replica mode and server uptime
- per-database cumulative commits/rollbacks, PostgreSQL buffer-cache hit ratio, temporary bytes/files, deadlocks, and size
- PostgreSQL 17 `pg_stat_io` physical reads, writes, cache hits, evictions, writebacks, extends, fsyncs, and buffer reuses
- cumulative `pg_stat_io` read, write, and fsync timing when `track_io_timing` is enabled
- whether activity and database counters are enabled

These are native PostgreSQL statistics. They can lag by about one second, and cumulative counters are totals since the PostgreSQL statistics reset—not transactions per second. I/O timing is marked unavailable when `track_io_timing` is disabled.

Full cross-session activity needs the saved PostgreSQL management role to be a superuser or inherit `pg_read_all_stats`. When it does not, DBMason shows **Restricted** instead of misleading zeroes. Grant `pg_read_all_stats` only after reviewing its information exposure; DBMason never grants it automatically.

PostgreSQL core does not report reliable host/container CPU percentage or RAM utilization. The page states **External provider** for host telemetry. Active sessions and execution time are workload signals, not CPU. Do not expose the Docker socket to DBMason; integrate a separately secured metrics provider when host telemetry is required.

![Production PostgreSQL observability with pg_stat_io counters](images/16-production-observability.png)

## 6. Use the guarded Data & SQL workspace

Owners, admins, and operators can open **Data & SQL**. Viewers cannot see or call this workspace. It deliberately does not execute user queries with the saved administrator credential.

1. Choose a database that accepts connections.
2. Choose a restricted PostgreSQL login role. Roles known by inventory to be the active administrator, superuser, `CREATEDB`, or `CREATEROLE` are omitted; the server also rejects privileged memberships and direct/inherited owners of the selected database or any non-system relation in it.
3. Enter that role's password and select **Open read-only workspace**.
4. Browse relations visible through the role's schema `USAGE` and relation `SELECT` permissions, or run one row-returning PostgreSQL statement.
5. Select **Disconnect & forget password** when finished.

The password remains only in the active browser state, is sent to the same-origin endpoint for each workspace request, and is never saved in SQLite or audit events. Changing the connection/role or disconnecting clears it.

The SQL guard uses PostgreSQL itself, not a regex allowlist. DBMason sends the submitted text without interpolation through `pg-cursor` and PostgreSQL's extended query protocol. PostgreSQL accepts one prepared statement at that boundary, DBMason requires returned row fields, and a server-side `READ ONLY` transaction blocks writes—including writes attempted through functions. The transaction is always ended with `ROLLBACK`. Native PostgreSQL permissions and row-level-security policies still decide which rows the selected role may see, so use a dedicated least-privileged non-owner role.

`READ ONLY` is a database-write boundary, not a general process or network sandbox. Revoke `EXECUTE` on untrusted user functions and extensions for the workspace role: an external side effect outside PostgreSQL cannot be undone by `ROLLBACK`.

Workspace limits are intentionally small:

- a row-returning statement and at most 32,768 SQL characters
- a 256 KiB JSON request-body cap
- five-second statement and one-second lock timeout, plus a seven-second hard socket deadline
- 4 MiB transaction-local `work_mem`
- 100-row relation pages and at most 200 query rows; the cursor fetches one extra row only to detect truncation
- catalog capped at 500 relations, offset capped at 100,000
- approximately 1 MiB of serialized rows and 32,768 characters per cell
- a separate budget of two active workspace operations and eight waiting operations

Truncation is shown in the result instead of returning an unbounded payload. The per-cell limit is applied after the PostgreSQL driver decodes a value, so one exceptionally large datum can temporarily allocate more input memory before its displayed form is truncated; this is not an absolute peak-memory bound. Query text, passwords, and returned rows never appear in audit records.

The production browser pass opened the catalog as the restricted login, browsed only the granted relation, and returned its visible rows:

![Production restricted catalog and relation browse](images/17-production-data-workspace.png)

A safe `SELECT` reported the restricted role as `current_user`, confirming that user SQL did not run with the saved administrator credential:

![Production SQL query executed as the restricted role](images/18-production-sql-query.png)

A writable CTE was rejected by PostgreSQL's read-only transaction. A direct PostgreSQL read afterward confirmed that the source row was unchanged:

![Production workspace write blocked](images/19-production-write-blocked.png)

## 7. Create a database

1. Confirm the selected connection in the left rail.
2. Select **Database**.
3. Enter the new database name and, optionally, an existing owner role.
4. Submit and verify the refreshed row.

![Created database in the live catalog](images/05-database-created.png)

Identifiers are validated and quoted by the PostgreSQL adapter. DBMason has no arbitrary admin-SQL endpoint.

## 8. Create a login role

1. Select **Create user**.
2. Enter the PostgreSQL role name.
3. Optionally choose a database and one allowlisted preset: connect, read, write, or developer.
4. Submit, copy the generated password into an approved secret manager, and close the one-time reveal.

![Create database user form](images/06-create-user-form.png)

The password is generated on the server, converted to a SCRAM-SHA-256 verifier before SQL execution, displayed once, and never stored by DBMason. Credential reveals are deliberately absent from screenshots and documentation.

If a multi-database creation fails partway through, DBMason removes earlier managed grants and attempts to drop the new role. The real PostgreSQL suite verifies this compensation path.

## 9. Manage an existing PostgreSQL role

Open **Users & roles**, then select the action button for a standard role. The active connection role, superusers, replication/bypass-RLS roles, and roles with elevated create capabilities are protected from lifecycle mutations.

![Production role lifecycle dialog](images/13-production-role-lifecycle.png)

The active management role and any direct, inherited, or `SET`-only member of it, a privileged role, or a `pg_*` role are rejected server-side before every lifecycle mutation.

The dialog supports:

- **Disable/enable login** without discarding the current credential.
- **Rotate password**, which invalidates the old password and shows the replacement once.
- **Apply preset**, which validates the database before replacing DBMason-managed grants.
- **Revoke explicit access**, including default privileges DBMason can safely alter.
- **Drop role**, gated by exact-name confirmation; PostgreSQL refuses the drop while owned objects or dependent grants remain.

PostgreSQL cannot transactionally coordinate two databases. Access replacement therefore fails closed: if applying the new preset fails, partial new grants are cleared and the original safe error is returned.

## 10. Understand `PUBLIC` access

PostgreSQL commonly grants database `CONNECT` and temporary-table capability to `PUBLIC`. Every role inherits `PUBLIC`, so an explicit revoke is not proof that the role can no longer connect.

DBMason shows effective `PUBLIC` grants in the database table and repeats the caveat in the lifecycle dialog. A revoke response also warns when `PUBLIC` or role membership still permits connection.

![PUBLIC grants in inventory](images/08-public-access-visible.png)

DBMason does not silently change cluster-wide `PUBLIC` defaults because that could break existing applications. Review those ACLs through your organization's approved PostgreSQL change process.

## 11. Give application users read-only access

Owners manage DBMason accounts under Payload Admin **Users**. A `viewer` can inspect saved connections, live inventory, and aggregate observability but cannot open Data & SQL, add/remove a saved connection, create a database, create/manage a PostgreSQL role, or read other application-user records.

![Production viewer observability without workspace or mutation controls](images/20-production-viewer-observability.png)

The same viewer flow was checked at a 375-pixel viewport with no horizontal page overflow:

![Mobile viewer observability at 375 pixels](images/21-mobile-viewer-observability.png)

The UI removes mutation controls, and the API independently returns `403` for viewer mutations. Never treat hidden buttons as the authorization boundary.

## 12. Review audit events

Every remote mutation first persists a `requested` event. A terminal `succeeded` or sanitized `failed` event follows. Audit rows contain a request ID, actor, action, safe target, outcome, and duration; they exclude passwords, cookies, DSNs, raw SQL, PostgreSQL detail, and stack traces.

Workspace catalog, relation, and query reads use the same requested/terminal audit pattern, but the target contains only safe principal/database/relation identifiers. Submitted SQL, transient credentials, and result data are excluded. Routine observability snapshots are on-demand reads and are not written to the mutation audit log.

![Production workspace audit targets without SQL or passwords](images/22-production-workspace-audit.png)

Requested-audit persistence is fail-closed: remote work does not start when the intent record cannot be written. A terminal audit transport failure is logged but does not falsely report an already-completed remote operation as failed.

## 13. Remove a saved connection

Owners and admins can select **Remove**, type the saved connection name, and confirm. This deletes only the encrypted control-plane record. It does not drop PostgreSQL databases, roles, objects, or grants.

To change a saved administrator password today, create and validate a replacement saved connection before removing the old record. In-place saved credential rotation is a later feature.

## 14. Run the release checks

```bash
pnpm check
pnpm test:postgres
pnpm test:e2e:mvp
pnpm build
```

The PostgreSQL and browser suites refuse unsafe remote targets and use exact test-only names. See the [validation report](VALIDATION_REPORT.md) for the final automated, production-container, and manual browser evidence.

Stop the PostgreSQL harness while preserving its volume:

```bash
pnpm postgres:test:down
```

Only when the isolated test data may be destroyed, reset that exact harness:

```bash
pnpm postgres:test:reset
```

## Troubleshooting

### The application port is already in use

Choose a free `PORT` in `.env` and restart. `pnpm dev:app-test` uses `.env.app-test`, a separate port, SQLite file, and Next output directory.

### PostgreSQL port `55432` is already in use

Stop the harness, change `POSTGRES_TEST_PORT` in `.env.postgres-test`, restart it, and use the same port in DBMason.

### Connection test fails

Run `pnpm postgres:test:status` and `pnpm postgres:test:logs`. Confirm the host route, allowlist, maintenance database, username, password, and TLS mode. Production remote servers should use certificate verification.

### Activity cards say `Restricted`

Aggregate database/I/O counters can still be valid. Cross-session activity fields require the remote management role to inherit PostgreSQL `pg_read_all_stats` (or be a superuser). Prefer the predefined monitoring role over making the account a superuser, and review its visibility before granting it.

### Host CPU or RAM says `External provider`

This is expected. PostgreSQL core SQL does not expose trustworthy host/container CPU or memory utilization. Configure a separately secured platform/exporter integration when that feature is added; active sessions are not a substitute for CPU percentage.

### Data & SQL rejects the selected role

Use a separate `LOGIN` role without superuser, `CREATEDB`, `CREATEROLE`, replication, `BYPASSRLS`, privileged/`pg_*` memberships, equality with the saved management role, or direct/inherited ownership of the selected database or its non-system relations. Grant only the intended database `CONNECT`, schema `USAGE`, relation `SELECT`, and applicable RLS access.

### A workspace query is blocked or truncated

The workspace accepts one row-returning PostgreSQL statement through the extended query protocol and always rolls back its five-second `READ ONLY` transaction. Writes, DDL, non-row-returning commands, stacked statements, permission failures, and lock timeouts are intentionally rejected. A seven-second hard deadline closes a stuck socket. Results stop at 200 rows, about 1 MiB, or the post-decode per-cell limit; narrow the query instead of raising the browser payload without a security review.

### A role can connect after explicit access was revoked

Inspect the database's **PUBLIC grants** and the revoke warning. `PUBLIC CONNECT` or role membership may still be effective even when the role's direct grant is gone.

### A role cannot be dropped

PostgreSQL is protecting dependencies. Reassign or remove owned objects and dependent grants through an approved process, refresh DBMason, and retry only when deletion is intended.
