# Release process

DBMason releases use semantic versions and signed-off, reviewable Git history.
Every release must be reproducible from a Git tag and described in
`CHANGELOG.md`.

## Before a release

1. Start from a clean, up-to-date `main`; release commits must already have
   passed review rather than being assembled directly on the protected branch.
2. Move completed entries from `Unreleased` to a dated version section and set
   exactly the same semantic version in `package.json`.
3. From a frozen install, run `pnpm check`, `pnpm audit --audit-level low`,
   `pnpm test:postgres`, `pnpm test:mysql`, `pnpm test:e2e:mvp`,
   `pnpm test:e2e:mysql`, `pnpm build`, `pnpm check:runtime`, and
   `pnpm payload migrate:status`. Generate the third-party bundle from the
   frozen non-optional production graph plus the exact standalone trace; the
   same fail-closed command is recorded in the CI workflow.
4. Run `git diff --check`, then require an empty
   `git status --porcelain --untracked-files=all` after generated types so both
   tracked and newly generated files are caught. Record the results,
   production-image smoke test, and any manual browser evidence in
   `docs/VALIDATION_REPORT.md`.
5. Exercise login followed by a top-level product-page navigation in the
   production container. Confirm the read-only server render recognizes the
   session when navigation omits `Origin`, a supplied foreign `Origin` is never
   replaced, and mutation/workspace CSRF checks remain exact-origin.
6. Scan the exact tracked release tree for secrets and generated data. Confirm
   that `.env`, SQLite files, database dumps, traces, passwords, and private keys
   are absent.
7. Review migrations, engine compatibility, security implications,
   corresponding-source behavior, upgrade steps, and rollback guidance.

## Publish

1. Merge through a pull request with green required quality, CodeQL, both real-
   database, and both Chromium checks on the exact commit.
2. Create an annotated `vX.Y.Z` tag on that commit. Sign the annotated tag when
   maintainer signing is configured and available. Never publish a lightweight
   or moved release tag.
3. Push the annotated tag, verify the remote tag still resolves to the exact
   release commit and has Git object type `tag`, then create release notes from
   the matching changelog section as a **draft** with `--verify-tag`. Include
   upgrade steps, rollback, and known limitations. Never let the release command
   create the tag, and do not make the GitHub release public yet.
4. The tag workflow reruns source, audit, PostgreSQL, MySQL, and Chromium gates
   before publishing multi-platform GHCR images. Verify the immutable image
   digest, non-root runtime, health endpoint, OCI source/license/version labels,
   attached SBOM, BuildKit provenance, the GitHub-signed build attestation with
   `gh attestation verify`, and public package visibility.
5. Verify the public source archive, AGPL/license detection, corresponding-
   source link, documentation links, anonymous image pull, and a fresh-volume
   application/database smoke test from the published image. Publish the draft
   release only after every verification succeeds.

## Rollback

Do not move or delete a published tag. Stop the new container, restore the
SQLite backup taken before upgrade when a migration is not backward-compatible,
and run the prior immutable GHCR digest. Remote PostgreSQL/MySQL changes are
authoritative server mutations and are not reverted by restoring SQLite; use
the audit trail and engine-native backups/change process for those operations.
Publish a new patch release for the correction.

Release tags are immutable. Corrections are published as a new patch version;
an existing tag is never moved.
