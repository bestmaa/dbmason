# MySQL 8.4 test harness

This harness runs a dedicated MySQL 8.4 LTS server for DBMason integration and browser tests. The image is pinned to the multi-platform `mysql:8.4.10` manifest digest for reproducibility and visible dependency updates. It is intentionally separate from the PostgreSQL harness: it has its own Compose project, service, network, named volume, environment file, Vitest configuration, Playwright configuration, and SQLite control plane.

Never point these commands at a production server. The checked-in values are test-only examples.

## Isolation guarantees

- Compose project: `dbmason-mysql-test`
- Service: `mysql-test`
- Image: `mysql:8.4.10@sha256:c592c15aaf4a1961e15d82eb31ea5987dda862d1c4b1e93424438c0e91dc1f8d`
- Container port: `3306`
- Default host binding: `127.0.0.1:53306`
- Named volume: `dbmason-mysql-test_mysql-test-data`
- Integration control plane: `data/mysql-integration-control-plane.db`
- Browser-test control plane: `data/mysql-e2e-control-plane.db`
- Browser-test Next.js output: `.next-e2e-mysql`
- Browser-test application port: `39116`

The Compose file hard-codes the published address to `127.0.0.1`; changing `MYSQL_TEST_HOST` cannot expose the test root account to the LAN. The dedicated test network is not shared with the PostgreSQL harness or the production application.

## First-time setup

Copy the example without changing the checked-in file:

```bash
cp .env.mysql-test.example .env.mysql-test
```

The local `.env.mysql-test` is ignored by Git. Keep its password test-only and do not reuse it anywhere else.
If `39116` is already occupied, set `DBMASON_MYSQL_E2E_PORT` to another unprivileged port in the local file.

Start the server and wait for its health check:

```bash
pnpm mysql:test:up
```

With the example settings, DBMason connects using:

| Setting | Value |
| --- | --- |
| Engine | MySQL |
| Host | `127.0.0.1` |
| Port | `53306` |
| Maintenance database | `dbmason_manager_test` |
| Administrator | `root` |
| TLS mode | Disabled (local test only) |

Read the password from your local `.env.mysql-test`; documentation and test output must not print it.

## Commands

```bash
pnpm mysql:test:config  # validate Compose configuration
pnpm mysql:test:up      # create/start and wait until healthy
pnpm mysql:test:status  # show only this Compose project's services
pnpm mysql:test:logs    # follow the MySQL test service logs
pnpm mysql:test:down    # stop this project; keep its named volume
pnpm mysql:test:reset   # remove only this project's volume, then start clean
pnpm test:mysql         # start MySQL and run tests/mysql/**/*.mysql.spec.ts
pnpm test:e2e:mysql     # start MySQL and run serial Chromium MySQL tests
```

`mysql:test:reset` is destructive only to the dedicated `dbmason-mysql-test` named volume. It does not enumerate or remove unrelated containers, networks, or volumes.

## Test boundaries

The MySQL integration suite must cover the adapter through its public engine contract, not by importing PostgreSQL code or replacing SQL strings in PostgreSQL tests. MySQL-specific SQL and account rules belong under the MySQL infrastructure adapter and `tests/mysql/`.

MySQL identities remain canonical `user@host` values throughout lifecycle and workspace requests. Tests use `dbmason_e2e_mysql_reader@%` deliberately and verify that MySQL `CURRENT_USER()` resolves to the same account. The `%` host is acceptable only inside this loopback test harness; production deployments must pair account-host scope with TLS, firewall, and egress policy.

The Chromium suite lives under `tests/e2e-mysql/`. It uses a distinct application process and SQLite file so it cannot reuse PostgreSQL browser-test state. Run it serially because the scenarios create and remove shared MySQL test accounts and databases.

Required browser coverage:

1. Bootstrap an owner and create a connection with engine `mysql`.
2. Verify MySQL defaults (`3306`, `mysql`, and `root`) appear when the engine changes.
3. Save the loopback test connection and verify the engine/version label.
4. Create a database and verify it appears after refresh.
5. Create a least-privileged MySQL account and capture its one-time password.
6. Apply read, write, and developer presets and independently verify their grants.
7. Revoke database privileges, lock/unlock login, rotate the password, and drop the account.
8. Load MySQL observability without rendering PostgreSQL-only labels such as `pg_stat_io`.
9. Browse a permitted table and run a bounded read-only query using the transient account.
10. Verify writes, DDL, stacked statements, privileged accounts, and wrong passwords are blocked.
11. Verify a viewer can inspect inventory/observability but cannot mutate or open the SQL workspace.
12. Verify passwords and submitted SQL never appear in Payload audit events, URLs, logs, or persisted SQLite data.

## Troubleshooting

- `Missing .env.mysql-test`: copy the example to the ignored local file.
- Docker pipe/daemon errors: start Docker Desktop, wait until `docker version` reports a server, then retry.
- Port `53306` in use: choose another unprivileged `MYSQL_TEST_PORT` in `.env.mysql-test`.
- Health timeout: inspect `pnpm mysql:test:logs`; a first image pull or initialization may take longer on a slow connection.
- Stale initialization settings: run `pnpm mysql:test:reset` only after confirming that the dedicated test data can be discarded.
