# DBMason validation report

**PostgreSQL production MVP status:** Passed.

**MySQL 8.4 adapter real-server status:** Passed. MySQL production/manual
browser screenshots are not claimed in this report yet.

**Evidence window:** 20–22 July 2026.

This final release pass covered the production Docker image, isolated SQLite control planes, a dedicated PostgreSQL 17 container, real privilege/login behavior, Payload application RBAC, native observability, the guarded Data & SQL workspace, serial Chromium workflows, audit visibility, responsive layout, and runtime footprint. Existing development services and unrelated Docker containers were not stopped or modified.

## Validated topology

```text
Chrome
  -> non-root DBMason production container (host port 39115)
      -> SQLite named volume
      -> isolated Docker network
          -> PostgreSQL 17 test container
```

The automated Chromium suite used its own SQLite file and application port `39112`. PostgreSQL remained bound to host loopback for host-side tests. The final-source production validation container joined only the dedicated PostgreSQL test network, used the service DNS name allowlisted for that run, and passed an internal TCP reachability check to PostgreSQL. The manual screenshot pass used the preceding hardened validation container on port `39114`; the final server-side membership hardening and prop-only auth-gate cleanup were then covered by the repeated strict gates, 40/40 PostgreSQL tests, and current-source 7/7 Chromium rerun.

## PostgreSQL production browser evidence

| ID  | Scenario                                                                                                  | Result | Evidence                                                              |
| --- | --------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| B01 | Empty production control plane exposes one secure owner-bootstrap action                                  | Pass   | [First-run screen](images/10-production-first-run.png)                |
| B02 | First account becomes owner and reaches the expected Payload collections                                  | Pass   | [Owner dashboard](images/11-production-owner-dashboard.png)           |
| B03 | Owner saves the isolated PostgreSQL 17 connection and sees live databases, roles, and `PUBLIC` grants     | Pass   | [Connected overview](images/12-production-connected-overview.png)     |
| B04 | Owner creates the test database/role; active and privileged roles remain protected                        | Pass   | [Role lifecycle](images/13-production-role-lifecycle.png)             |
| B05 | Observability renders native capacity/activity/database counters and PostgreSQL 17 `pg_stat_io`           | Pass   | [Observability](images/16-production-observability.png)               |
| B06 | Restricted transient role unlocks its granted catalog and browses visible rows                            | Pass   | [Restricted workspace](images/17-production-data-workspace.png)       |
| B07 | Safe `SELECT` executes as the restricted role rather than the saved administrator                         | Pass   | [SQL result](images/18-production-sql-query.png)                      |
| B08 | Writable CTE is blocked; a direct PostgreSQL read confirms the source row remains unchanged               | Pass   | [Write blocked](images/19-production-write-blocked.png)               |
| B09 | Reload clears the transient workspace password and returns the Data & SQL tab to its locked state         | Pass   | Manual production-browser reload check                                |
| B10 | Viewer has observability but no Data & SQL tab or connection/database/role mutation controls              | Pass   | [Viewer observability](images/20-production-viewer-observability.png) |
| B11 | Viewer API authorization remains server-enforced independently of hidden controls                         | Pass   | Serial Chromium direct workspace/API checks                           |
| B12 | Viewer observability at a 375-pixel viewport has no horizontal page overflow                              | Pass   | [Mobile viewer](images/21-mobile-viewer-observability.png)            |
| B13 | Workspace audits show safe principal/database/relation targets without SQL or passwords                   | Pass   | [Workspace audit](images/22-production-workspace-audit.png)           |
| B14 | General audit detail attributes actor, request ID, safe target, outcome, and duration without credentials | Pass   | [Audit detail](images/15-production-audit-trail.png)                  |

The manual in-app production-browser pass completed with zero console warnings and zero console errors. All new screenshots were inspected before inclusion; none contains a generated or saved password.

## Recorded PostgreSQL MVP release gates (20–21 July)

| Gate                                               | Command              | Recorded result                                                                     |
| -------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| Types, lint, line limits, unit/RBAC/security tests | `pnpm check`         | Pass: typecheck, lint, 62-file frontend line gate, 20 test files, and 76 unit tests |
| Real PostgreSQL 17 integration                     | `pnpm test:postgres` | Pass: 5 files and 40/40 tests                                                       |
| Isolated serial Chromium MVP                       | `pnpm test:e2e:mvp`  | Pass: 7/7 tests in 2.6 minutes                                                      |
| Optimized production Next.js build                 | `pnpm build`         | Pass: production build completed                                                    |

The PostgreSQL gate covers TLS-prefer fallback against a non-TLS server, database creation, SCRAM verifiers, read/write/default privileges, target preflight, lifecycle operations, recursive inherited and `SET`-only privileged-membership rejection, compensation/cleanup, native observability, restricted activity, transient-role catalog/browse/query behavior, ownership rejection, truncation, and server-enforced write blocking. The real-server deadline case runs `SELECT pg_sleep(8)` and was canceled after approximately 5.08 seconds.

The Payload RBAC test harness uses a copied temporary SQLite fixture and a unique Payload cache identity per scenario. The focused 7-test RBAC file passed three consecutive runs, and the complete 20-file/76-test unit suite then passed three consecutive runs before the final `pnpm check` pass.

The serial browser gate covers first-owner bootstrap, saved connection creation, `PUBLIC` visibility, database/read-role creation, observability, restricted catalog and query access, real write denial with direct unchanged-data verification, password clearing after reload, duplicate error presentation, viewer control hiding, direct viewer API rejection, role lifecycle, and control-plane-only connection removal while the remote database remains.

The development E2E web server emitted Next/Turbopack's known negative-timestamp `Performance.measure` instrumentation warning once. The seven assertions passed, and the separate production-browser pass had zero console warnings and zero console errors.

## MySQL adapter evidence (22 July)

| Gate | Command | Recorded result |
| --- | --- | --- |
| Types, full lint, line boundary, unit/RBAC/security | `pnpm check` | Pass: 66 frontend files within 250 lines; 27 test files, 128/128 tests |
| Real MySQL 8.4.10 integration | `pnpm test:mysql` | Pass: 2 files, 11/11 tests |
| PostgreSQL regression | `pnpm test:postgres` | Pass: 5 files, 40/40 tests |

The real MySQL suite covers connection/inventory, genuine server-status
observability, database and `user@host` creation, one-time passwords, access
presets, login/password/drop lifecycle, direct schema/table/column/routine grant
reconciliation, global/role/`PROXY`/column-grant-option protection, catalog and
relation browsing, authenticated identity verification, read-only writes and
stacked-statement denial, developer rejection, five-second deadline behavior,
and rejection of a dangerous routine grant on another schema before any side
effect occurs.

Unit coverage also verifies the 64-byte MySQL versus 63-byte PostgreSQL
identifier boundary, engine-aware connection defaults, safe errors, explicit
account parsing, vetted-address socket pinning while preserving TLS hostname,
and a fail-closed transient-session `SHOW GRANTS` allowlist. The local real
server intentionally disables TLS, so the certificate/SAN behavior is unit-
verified rather than claimed as live-certificate evidence.

The MySQL Playwright harness and serial workflow are present, but a completed
production/manual MySQL screenshot pass is not recorded here. Existing images
and browser claims in this document remain PostgreSQL-specific.

## Observability and workspace validation

| ID  | Scenario                                                                                                                         | Result | Evidence                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| O01 | On-demand native PostgreSQL capacity/activity/database/I/O snapshot, including rendered `pg_stat_io` counters/timing             | Pass   | [Production observability](images/16-production-observability.png) and real PostgreSQL suite                           |
| O02 | Ordinary remote role gets explicit restricted activity; `track_io_timing=off` is not shown as zero latency                       | Pass   | Real PostgreSQL 17 integration suite                                                                                   |
| O03 | Host CPU/RAM remains labelled `external-provider-required`                                                                       | Pass   | [Production observability](images/16-production-observability.png)                                                     |
| W01 | Workspace uses a transient nonprivileged credential and clears it after reload/connection change                                 | Pass   | [Restricted workspace](images/17-production-data-workspace.png) and manual reload check                                |
| W02 | Visible catalog/paging follow PostgreSQL grants/RLS; selected-database/relation owners, including inherited owners, are rejected | Pass   | [Restricted browse](images/17-production-data-workspace.png) and real PostgreSQL suite                                 |
| W03 | Extended-protocol cursor accepts row-returning SQL; rollback-only `READ ONLY` blocks stacked/write/DDL/function writes           | Pass   | [Safe query](images/18-production-sql-query.png), [blocked write](images/19-production-write-blocked.png), direct read |
| W04 | Viewer receives `403`; audit targets exclude password, SQL, and returned rows                                                    | Pass   | [Viewer](images/20-production-viewer-observability.png), [audit](images/22-production-workspace-audit.png), E2E gate   |
| W05 | Two-active/eight-waiting budget, hard deadline, 256-KiB body, maxRows+1, response/cell limits, and safe errors                   | Pass   | Unit/security gates and real PostgreSQL deadline/truncation cases                                                      |

## Production container evidence

| Check                | Result                                          |
| -------------------- | ----------------------------------------------- |
| Runtime image        | `db-control:postgres-final-validation-20260721` |
| Exact image size     | `220,864,759` bytes                             |
| Runtime user         | `nextjs` (non-root)                             |
| Linux capabilities   | `ALL` dropped                                   |
| Privilege escalation | `no-new-privileges` enabled                     |
| PID limit            | `256`                                           |
| CPU limit            | `1` CPU                                         |
| Memory limit         | `384 MiB`                                       |
| Idle CPU sample      | `0.00%`                                         |
| Warm idle memory     | `69.38 MiB` (`18.07%` of the container limit)   |
| Warm process count   | `12`                                            |
| Health endpoint      | HTTP `200`                                      |
| Runtime logs         | Expected no-email-adapter warning only          |
| Browser console      | `0` warnings and `0` errors                     |

The hardening and resource values above were inspected on the running production validation container, not inferred from the Dockerfile alone.

## Security results

- The test PostgreSQL target used an explicit local-only plaintext/TLS-disabled selection. Production remote targets should use `verify-full`.
- Saved administrator passwords stayed inside the encrypted control-plane envelope and were never returned by the manager API.
- Generated login passwords were sent to PostgreSQL as SCRAM verifiers, held only in transient UI/test memory, and omitted from audit data.
- The workspace used a dedicated restricted PostgreSQL login; a safe query reported that role as `current_user`.
- A writable CTE was blocked, and a separate direct PostgreSQL read confirmed the target data did not change.
- Reloading the page cleared the transient workspace password.
- Viewer UI restrictions were backed by an independently verified `403` workspace endpoint response while observability remained available.
- Workspace audit targets contained only safe principal/database/relation identifiers, with no submitted SQL or password.
- `PUBLIC CONNECT` remained visible and produced a revoke warning rather than a false isolation claim.
- Requested audit persistence remained fail-closed; terminal audit failure semantics were unit-tested separately.
- The production container ran as non-root with all Linux capabilities dropped and privilege escalation disabled.
- Test cleanup was constrained to loopback, a maintenance database containing `test`, and exact `dbcontrol_e2e_` remote identifiers.

## Safety boundaries

`pnpm postgres:test:down` stops only the dedicated PostgreSQL harness and preserves its volume. `pnpm postgres:test:reset` deliberately removes only that harness volume and must be used only when its test data may be destroyed.

`pnpm mysql:test:down` and `pnpm mysql:test:reset` have the equivalent boundary
for the separate `dbmason-mysql-test` project and its named volume.

The E2E preparation script removes only `data/e2e-control-plane.db` and its exact WAL/SHM companions. It does not touch the normal development or app-test SQLite files. No Git reset, branch deletion, repository cleanup, or GitHub mutation was performed during this validation.

## Known non-blocking follow-ups

- Put the four release commands into hosted CI and repeat them from a clean checkout.
- Add an independent cancellation deadline to DNS resolution; the current global limiter bounds concurrent exposure but not resolver duration.
- Add saved administrator credential rotation and connection editing.
- Expand the grant planner beyond the PostgreSQL `public` schema before claiming multi-schema coverage.
- Add real host telemetry only through a separately secured external-provider adapter; PostgreSQL native statistics are not CPU/RAM.
- Record MySQL production/manual browser screenshots and live-certificate TLS evidence before claiming those gates.
