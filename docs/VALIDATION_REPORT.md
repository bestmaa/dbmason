# DBMason validation report

**PostgreSQL 17 local release gates:** Passed.

**MySQL 8.4.10 local release gates:** Passed.

**v0.2.0 GitHub/CodeQL/GHCR candidate:** Passed on exact source commit
`5482a23d83992ec210c326e365498590e5259a54`; the GitHub release was deliberately
left as a draft after the invalid-configuration health gap described below.

**v0.2.1 correction:** Local source, image, fail-closed health, real-server, and
browser gates passed. Hosted verification remains required on the exact squash-
merged release SHA before the protected tag is created.

**Evidence window:** 20–22 July 2026.

This release pass covered the production release-candidate image, isolated SQLite
control planes, dedicated PostgreSQL 17 and MySQL 8.4.10 containers, real
privilege/login behavior, Payload application RBAC, native observability, the
guarded Data & SQL workspace, serial Chromium workflows, audit visibility,
responsive layout, migrations, dependency audit, and runtime footprint.
Existing development services and unrelated Docker containers were not stopped
or modified.

## Validated topology

```text
Chrome
  -> non-root DBMason v0.2.0 production container (host port 39120)
      -> dedicated SQLite named volume
      -> isolated Docker network
          -> MySQL 8.4.10 test container
```

The PostgreSQL and MySQL automated Chromium suites used independent SQLite
files, build directories, database harnesses, and application ports `39112`
and `39116`. Both databases remained bound only to host loopback for host-side
tests. The final MySQL manual pass ran the exact `dbmason:0.2.0-final`
image with a new SQLite volume, joined only the dedicated MySQL test network,
and allowlisted only its `mysql-test` service DNS name. Earlier PostgreSQL
production evidence remains recorded below and was backed by the final-source
40/40 integration and 7/7 Chromium regression reruns.

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

## MySQL 8.4 production browser evidence

| ID  | Scenario                                                                                                                                              | Result | Evidence                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| M01 | Fresh production SQLite control plane bootstraps exactly one owner                                                                                    | Pass   | Manual production Chrome pass                                                             |
| M02 | Owner saves an explicit MySQL connection and sees 8.4.10 database charset/collation inventory                                                         | Pass   | [Connected overview](images/23-mysql-connected-overview.png)                              |
| M03 | Owner grants canonical `dbmason_final_reader@%` read access to `dbmason_manual_demo`; its password is shown once and never persisted or screenshotted | Pass   | Manual production Chrome pass                                                             |
| M04 | Login disable/enable, write-to-read preset reconciliation, and protected system/root controls behave safely                                           | Pass   | [Account lifecycle](images/25-mysql-account-lifecycle.png) and direct `SHOW GRANTS` check |
| M05 | Native server-status/schema observability renders while CPU/RAM stays explicitly external                                                             | Pass   | [MySQL observability](images/24-mysql-observability.png)                                  |
| M06 | Restricted account sees and browses only its granted table and three seeded rows                                                                      | Pass   | [Restricted workspace](images/26-mysql-relation-browser.png)                              |
| M07 | Safe row-returning query executes through the restricted account                                                                                      | Pass   | [SQL result](images/27-mysql-query-result.png)                                            |
| M08 | `UPDATE` is rejected; an independent administrator read confirms the row is unchanged                                                                 | Pass   | [Write blocked](images/28-mysql-write-blocked.png) and direct read                        |
| M09 | Disconnect clears the transient password; rotation rejects the old credential and accepts the replacement                                             | Pass   | Manual production Chrome pass                                                             |
| M10 | Production browser console has zero warnings and zero errors                                                                                          | Pass   | Chrome console inspection                                                                 |

The one-time generated and rotated passwords were held only in the active
browser automation scope, never printed, never written to a screenshot, and
cleared before the browser session was finalized. Every retained MySQL image
was visually inspected after capture.

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

## v0.2.0 final local release gates (22 July)

| Gate                                                | Command                                 | Recorded result                                                        |
| --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Types, full lint, line boundary, unit/RBAC/security | `pnpm check`                            | Pass: 66 frontend files within 250 lines; 31 test files, 150/150 tests |
| Real MySQL 8.4.10 integration                       | `pnpm test:mysql`                       | Pass: 2 files, 11/11 tests                                             |
| PostgreSQL regression                               | `pnpm test:postgres`                    | Pass: 5 files, 40/40 tests                                             |
| PostgreSQL catalog-churn stress                     | 1 normal + 3 concurrent real suites     | Pass: 20 files, 160/160 tests                                          |
| PostgreSQL Chromium lifecycle                       | `pnpm test:e2e:mvp`                     | Pass: 7/7 tests in 2.5 minutes                                         |
| MySQL Chromium lifecycle                            | `pnpm test:e2e:mysql`                   | Pass: 7/7 tests in 1.8 minutes                                         |
| Dependency audit                                    | `pnpm audit --audit-level low`          | Pass: zero known vulnerabilities                                       |
| Third-party provenance                              | `pnpm check:third-party-provenance`     | Pass: production/runtime, Next.js compiled, and native libSQL closures |
| Optimized standalone build                          | `pnpm build`                            | Pass: production build completed                                       |
| Fresh SQLite migration                              | `payload migrate` then `migrate:status` | Pass: initial migration applied, batch 1, `Ran: Yes`                   |

The final unit/security gate includes the Payload navigation regression: the
read-only server-rendered home fills a missing `Origin` from the validated
public URL, while preserving a caller-supplied foreign `Origin` unchanged so it
cannot be converted into a trusted request. Manager mutations and workspace
requests retain their exact-origin CSRF and role checks.

The catalog-churn stress followed a hosted timing failure where another worker
removed a database while PostgreSQL was sampling its privileges and size.
DBMason now samples catalog and observability rows by OID; missing-object
privileges become `false` and missing size becomes nullable, so a concurrent
drop no longer aborts the entire server snapshot. The ordinary suite and three
suites running concurrently against the same PostgreSQL 17 harness all passed.

The fail-closed third-party provenance gate covers 306 production/runtime
package versions. Its Next.js compiled-dependency closure retains 137 legal
files mapped to 54 traced runtime components with zero uncovered components;
the native libSQL closure maps 178 Cargo components to 66 retained license
texts. These counts come from the generated validators, not a hand-curated
package list.

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

The MySQL serial Chromium suite covers owner bootstrap, explicit engine
selection, connection defaults/save, database and canonical account creation,
observability, guarded workspace query/write rejection and persistence,
duplicate failures, viewer UI/API enforcement, grants/login/password/drop
lifecycle, and control-plane-only connection removal. The independent
production Chrome pass above repeats the highest-risk user paths on the final
container image.

## Observability and workspace validation

| ID  | Scenario                                                                                                                         | Result | Evidence                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| O01 | On-demand native PostgreSQL capacity/activity/database/I/O snapshot, including rendered `pg_stat_io` counters/timing             | Pass   | [Production observability](images/16-production-observability.png) and real PostgreSQL suite                                                  |
| O02 | Ordinary remote role gets explicit restricted activity; `track_io_timing=off` is not shown as zero latency                       | Pass   | Real PostgreSQL 17 integration suite                                                                                                          |
| O03 | Host CPU/RAM remains labelled `external-provider-required` for both engines                                                      | Pass   | [PostgreSQL](images/16-production-observability.png), [MySQL](images/24-mysql-observability.png)                                              |
| O04 | MySQL server status and schema metadata remain distinct from PostgreSQL-only counters                                            | Pass   | [MySQL observability](images/24-mysql-observability.png), real MySQL suite                                                                    |
| W01 | Workspace uses a transient nonprivileged credential and clears it after reload/connection change                                 | Pass   | [Restricted workspace](images/17-production-data-workspace.png) and manual reload check                                                       |
| W02 | Visible catalog/paging follow PostgreSQL grants/RLS; selected-database/relation owners, including inherited owners, are rejected | Pass   | [Restricted browse](images/17-production-data-workspace.png) and real PostgreSQL suite                                                        |
| W03 | Extended-protocol cursor accepts row-returning SQL; rollback-only `READ ONLY` blocks stacked/write/DDL/function writes           | Pass   | [Safe query](images/18-production-sql-query.png), [blocked write](images/19-production-write-blocked.png), direct read                        |
| W04 | Viewer receives `403`; audit targets exclude password, SQL, and returned rows                                                    | Pass   | [Viewer](images/20-production-viewer-observability.png), [audit](images/22-production-workspace-audit.png), E2E gate                          |
| W05 | Two-active/eight-waiting budget, hard deadline, 256-KiB body, maxRows+1, response/cell limits, and safe errors                   | Pass   | Unit/security gates and real PostgreSQL deadline/truncation cases                                                                             |
| W06 | MySQL authenticates exact `user@host`, rechecks grants, browses permitted rows, and blocks writes                                | Pass   | [Browse](images/26-mysql-relation-browser.png), [query](images/27-mysql-query-result.png), [blocked write](images/28-mysql-write-blocked.png) |

## Production container evidence

| Check                | Result                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| Runtime image        | `dbmason:0.2.0-final`                                                       |
| Local image ID       | `sha256:7ff0bdba6c93a9fecdcad31222cb40fd1fe592bddd8b07795150abff054a4ba2`   |
| Exact image size     | `71,023,806` bytes (`67.73 MiB`)                                            |
| Runtime user         | `nextjs` / UID `1001` (non-root)                                            |
| Legal files          | License, notice, trademark policy, third-party notices                      |
| Linux capabilities   | `ALL` dropped                                                               |
| Privilege escalation | `no-new-privileges` enabled                                                 |
| PID limit            | `256`                                                                       |
| CPU limit            | `1` CPU                                                                     |
| Memory limit         | `384 MiB`                                                                   |
| Idle CPU sample      | `0.00%` from `docker stats --no-stream`                                     |
| Warm idle memory     | `85.62 MiB`                                                                 |
| Warm process count   | `12` container PIDs                                                         |
| Health endpoint      | HTTP `200`                                                                  |
| Source/version link  | Runtime v0.2.0 tag URL rendered and resolves to the exact public source tag |
| Build-secret scan    | No build-only secret in final image environment                             |
| Runtime logs         | Expected no-email-adapter warning only                                      |
| Browser console      | `0` warnings and `0` errors                                                 |

The recorded hardening values above were inspected on the running production
release-candidate container, not inferred from the Dockerfile alone. Its later
tag workflow reproduced the candidate as the public multi-architecture artifact
recorded in the correction section below.

## v0.2.0 published candidate and v0.2.1 readiness correction

The protected annotated `v0.2.0` tag resolves to exact main commit
`5482a23d83992ec210c326e365498590e5259a54`. Tag workflow run `29927828749`
passed source, audit, runtime/legal, PostgreSQL, MySQL, both Chromium, multi-
architecture publish, SBOM, provenance, and GitHub attestation gates. Anonymous
clients pulled `ghcr.io/bestmaa/dbmason:0.2.0` at OCI index digest
`sha256:b6386b8b8dce0455f86a4f278381de1356fee7abb342d9955a3c49f8ead93951`;
strict attestation verification bound it to the tag workflow and exact source
commit.

A fresh-volume smoke with valid configuration passed on that published image.
A separate smoke then found that empty secrets made the application root fail
while the old constant health response still returned `200`, so Docker could
report a broken instance as healthy. The `v0.2.0` GitHub release therefore
remained an unpublished draft and its immutable candidate tag/image were not
moved or deleted.

v0.2.1 makes readiness fail closed. It validates the runtime environment,
initializes Payload and production migrations, reads the user schema, returns
only `ok` or `unhealthy`, shares concurrent work, and caches only the boolean
result for five seconds. The following pre-tag gates ran against the correction:

| Gate                                                | Recorded result                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| Types, full lint, line boundary, unit/RBAC/security | Pass: 66 frontend files within 250 lines; 32 files, 154/154 tests |
| Dependency audit                                    | Pass: zero known vulnerabilities                                  |
| Third-party/runtime provenance                      | Pass: legal closure and 2,306 standalone runtime entries          |
| Optimized standalone build                          | Pass: production build completed                                  |
| Fresh isolated SQLite migration                     | Pass: initial migration applied, batch 1, `Ran: Yes`              |
| Real PostgreSQL 17 integration                      | Pass: 5 files, 40/40 tests                                        |
| Real MySQL 8.4.10 integration                       | Pass: 2 files, 11/11 tests                                        |
| PostgreSQL Chromium lifecycle                       | Pass: 7/7 serial tests                                            |
| MySQL Chromium lifecycle                            | Pass: 7/7 serial tests                                            |

The exact local `dbmason:0.2.1-health-gate` image had manifest-list ID
`sha256:dd31009b9f4d2b35ffa11ad7f6c5ee79bd206d01fd51a68e86f5e5c7dc324e20`,
size `71,546,772` bytes (`68.23 MiB`), and ran as non-root UID `1001` with all
capabilities dropped, no privilege escalation, one CPU, 384 MiB memory, and 256
PIDs. Its warm sample used `89.77 MiB`, 13 PIDs, and `0.02%` CPU.

Three preserved, isolated containers exercised the image:

| Configuration                          | Health HTTP | Root HTTP | Docker state | Process |
| -------------------------------------- | ----------: | --------: | ------------ | ------- |
| Empty secrets                          |         503 |       500 | unhealthy    | running |
| Valid secrets with unusable `/proc` DB |         503 |       500 | unhealthy    | running |
| Valid secrets with a fresh volume      |         200 |       200 | healthy      | running |

Both failures returned only `{ "status": "unhealthy" }`, every Docker health
command exited nonzero, and no secret value appeared in logs. Payload/libSQL
emitted server-side storage diagnostics for the unusable path, including Next's
handled rejection diagnostics, but the process remained running with no fatal
exit. The valid container applied its initial migration, returned
`{ "status": "ok" }`, rendered the first-owner screen with `Source v0.2.1`, and
had zero browser-console entries in the manual Chrome inspection.

## Security results

- The test PostgreSQL target used an explicit local-only plaintext/TLS-disabled selection. Production remote targets should use `verify-full`.
- Saved administrator passwords stayed inside the encrypted control-plane envelope and were never returned by the manager API.
- Generated login passwords were sent to PostgreSQL as SCRAM verifiers, held only in transient UI/test memory, and omitted from audit data.
- The workspace used a dedicated restricted PostgreSQL login; a safe query reported that role as `current_user`.
- A writable CTE was blocked, and a separate direct PostgreSQL read confirmed the target data did not change.
- Reloading the page cleared the transient workspace password.
- Viewer UI restrictions were backed by an independently verified `403` workspace endpoint response while observability remained available.
- Payload session recognition survived a normal top-level navigation without
  weakening CSRF: only the read-only server-rendered lookup supplied a missing
  validated origin, and a supplied foreign origin remained untouched.
- Workspace audit targets contained only safe principal/database/relation identifiers, with no submitted SQL or password.
- `PUBLIC CONNECT` remained visible and produced a revoke warning rather than a false isolation claim.
- MySQL management kept canonical `user@host` identity through inventory,
  lifecycle, audit, grant reconciliation, and transient authentication.
- A direct `SHOW GRANTS` read after write-to-read reconciliation confirmed
  scoped `SELECT`/`SHOW VIEW`, with no DML, `ALL PRIVILEGES`, or grant option.
- Disabling then enabling MySQL login preserved the credential; password
  rotation invalidated the old credential and accepted the fresh one-time
  password.
- MySQL `UPDATE` was rejected, and a separate administrator query confirmed the
  seeded row remained `active`.
- Requested audit persistence remained fail-closed; terminal audit failure semantics were unit-tested separately.
- The production container ran as non-root with all Linux capabilities dropped and privilege escalation disabled.
- Test cleanup was constrained to loopback, maintenance databases containing
  `test`, and exact engine-specific E2E prefixes.

## Safety boundaries

`pnpm postgres:test:down` stops only the dedicated PostgreSQL harness and preserves its volume. `pnpm postgres:test:reset` deliberately removes only that harness volume and must be used only when its test data may be destroyed.

`pnpm mysql:test:down` and `pnpm mysql:test:reset` have the equivalent boundary
for the separate `dbmason-mysql-test` project and its named volume.

The E2E preparation scripts remove only their exact ignored SQLite test files
and WAL/SHM companions. They do not touch normal development or app-test
SQLite files. No Git reset, branch deletion, or broad repository cleanup was
performed during validation.

## Pending release gates and follow-ups

- **Release blocker:** merge v0.2.1 through the protected pull-request path,
  record all required hosted CI and CodeQL checks on the exact main SHA, then
  verify its immutable tag workflow, GHCR digest, SBOM, signed provenance,
  anonymous pull, and fresh-volume health smokes before publishing stable.
- Add an independent cancellation deadline to DNS resolution; the current global limiter bounds concurrent exposure but not resolver duration.
- Add saved administrator credential rotation and connection editing.
- Expand the grant planner beyond the PostgreSQL `public` schema before claiming multi-schema coverage.
- Add real host telemetry only through a separately secured external-provider adapter; PostgreSQL native statistics are not CPU/RAM.
- Add a real MySQL certificate/SAN integration target; current TLS identity
  behavior is unit-tested, while the local MySQL harness deliberately disables
  TLS.
