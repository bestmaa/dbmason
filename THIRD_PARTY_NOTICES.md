# Third-party notices

DBMason depends on open-source packages that remain under their own licenses.
The dependency license does not change DBMason's `AGPL-3.0-only` license.

The direct runtime dependency inventory for the upcoming release is:

| Package | Resolved version | License |
| --- | ---: | --- |
| `@payloadcms/db-sqlite` | 3.86.0 | MIT |
| `@payloadcms/next` | 3.86.0 | MIT |
| `@payloadcms/ui` | 3.86.0 | MIT |
| `cross-env` | 7.0.3 | MIT |
| `dotenv` | 16.4.7 | BSD-2-Clause |
| `graphql` | 16.14.2 | MIT |
| `lucide-react` | 1.25.0 | ISC |
| `mysql2` | 3.23.1 | MIT |
| `next` | 16.2.6 | MIT |
| `payload` | 3.86.0 | MIT |
| `pg` | 8.22.0 | MIT |
| `pg-cursor` | 2.21.0 | MIT |
| `react` | 19.2.6 | MIT |
| `react-dom` | 19.2.6 | MIT |
| `zod` | 4.4.3 | MIT |

Transitive dependencies include additional MIT, Apache-2.0, BSD, ISC, LGPL,
CC-BY, Python-2.0, MPL-or-Apache, and other compatible components. In
particular, production image-processing dependencies may include the
LGPL-3.0-or-later `libvips` runtime distributed through `sharp` platform
packages.

`pnpm-lock.yaml` is the authoritative resolved dependency graph. Generate the
complete machine-readable inventory for an exact checkout with:

```bash
pnpm install --frozen-lockfile
pnpm licenses list --prod --json
```

Copyright notices and full license texts are retained in each installed
package and its source distribution. Container redistributors must preserve
those files and comply with all applicable third-party terms. If this summary
and an installed package disagree, the package's own license and notices
control; please report the discrepancy so this file can be corrected.
