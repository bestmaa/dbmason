## What changed

<!-- Describe the user-visible outcome and why this change is needed. -->

## Verification

<!-- List the exact automated and manual checks run. -->

- [ ] `pnpm check`
- [ ] Relevant real-database integration tests
- [ ] Relevant Chromium flow
- [ ] Production build when runtime code changed

## Safety and compatibility

- [ ] No credentials, connection URLs, dumps, SQLite files, or generated traces
- [ ] SQL remains inside the affected engine adapter
- [ ] UI stays props-only and handwritten frontend files stay at or below 250 lines
- [ ] External input is parsed from `unknown`; no explicit `any`
- [ ] Migrations, security impact, and upgrade behavior are documented

By contributing, I agree that my contribution is licensed under
AGPL-3.0-only and certify it under the Developer Certificate of Origin 1.1.
