# Release process

DBMason releases use semantic versions and signed-off, reviewable Git history.
Every release must be reproducible from a Git tag and described in
`CHANGELOG.md`.

## Before a release

1. Move completed entries from `Unreleased` to a dated version section.
2. Set the same version in `package.json`.
3. Regenerate Payload types and run the full source-line, type, lint, unit,
   PostgreSQL, MySQL, browser, migration, and production-build checks listed in
   the README.
4. Scan the exact files to be committed for secrets and generated data. Confirm
   that `.env`, SQLite files, database dumps, traces, and real credentials are
   absent.
5. Review migrations, compatibility notes, security implications, and rollback
   guidance.

## Publish

1. Merge through a pull request with green required checks.
2. Create an annotated `vX.Y.Z` tag on the release commit.
3. Push the tag and create GitHub release notes from the matching changelog
   section, including upgrade steps and known limitations.
4. Verify the public source archive, license detection, container build, and
   documentation links from a clean checkout.

Release tags are immutable. Corrections are published as a new patch version;
an existing tag is never moved.
