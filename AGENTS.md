# Agents

This project uses the Payload CMS skill at `.agents/skills/payload/`.
Start with `.agents/skills/payload/SKILL.md` for a quick reference, then see `.agents/skills/payload/reference/` for detailed docs.

## Project architecture rules

- Read `ARCHITECTURE.md` before changing product code.
- Handwritten frontend `.ts`, `.tsx`, `.css`, and `.scss` files must stay at or below 250 lines.
- Presentational UI under `src/features/**/ui` and `src/ui` receives all state and behavior through props. It must not import hooks, services, Payload, database drivers, or navigation APIs.
- A connector is the client boundary: it calls the composed feature hook and passes the returned props to the UI.
- Hooks own React state/effects and call browser services. Services own I/O.
- Domain code must not import React, Next.js, Payload, or a database driver.
- PostgreSQL SQL belongs only in the PostgreSQL infrastructure adapter. Never add an arbitrary admin-SQL endpoint.
- Never use explicit `any`; parse external input from `unknown`.
