# Third-party notices

DBMason depends on open-source packages that remain under their own licenses.
The dependency license does not change DBMason's `AGPL-3.0-only` license.

The direct runtime dependency inventory for DBMason v0.2.1 is:

| Package                 | Resolved version | License      |
| ----------------------- | ---------------: | ------------ |
| `@payloadcms/db-sqlite` |           3.86.0 | MIT          |
| `@payloadcms/next`      |           3.86.0 | MIT          |
| `@payloadcms/ui`        |           3.86.0 | MIT          |
| `cross-env`             |            7.0.3 | MIT          |
| `dotenv`                |           16.4.7 | BSD-2-Clause |
| `graphql`               |          16.14.2 | MIT          |
| `lucide-react`          |           1.25.0 | ISC          |
| `mysql2`                |           3.23.1 | MIT          |
| `next`                  |           16.2.6 | MIT          |
| `payload`               |           3.86.0 | MIT          |
| `pg`                    |           8.22.0 | MIT          |
| `pg-cursor`             |           2.21.0 | MIT          |
| `qrcode`                |            1.5.4 | MIT          |
| `react`                 |           19.2.6 | MIT          |
| `react-dom`             |           19.2.6 | MIT          |
| `zod`                   |            4.4.3 | MIT          |

Transitive dependencies include additional MIT, Apache-2.0, BSD, ISC, CC-BY,
Python-2.0, MPL-or-Apache, and other compatible components. The official image
does not ship Next.js's unused optional `sharp`/`libvips` image-processing
chain; DBMason configures unoptimized media delivery and excludes that chain
from standalone tracing.

`pnpm-lock.yaml` is the authoritative resolved dependency graph. Generate the
complete machine-readable inventory for an exact checkout with:

```bash
pnpm install --frozen-lockfile
pnpm --config.optional=false licenses list --prod --json
```

Official container releases also publish an OCI SBOM and provenance attestation
for the exact tagged source and image digest. The image contains an
exact generated bundle at `/app/licenses/third-party` from the union of the
frozen non-optional production graph and Next.js standalone trace. Optional
packages are re-included whenever the runtime trace contains them. The bundle
includes `INDEX.json`, `DEPENDENCY_SCOPE.json`, package metadata, shipped
license/notice files, pinned supplements for archives that omit their license
text, and shared provenance records. For Next.js's vendored `dist/compiled`
runtime, `NEXT_COMPILED_NOTICES.json` hashes every conservatively retained
legal file and maps every component in the standalone trace to its notice
coverage. The OCI SBOM inventories the final filesystem. The notice bundle is
not represented as a source-level SBOM of every function inside generated
browser or server bundles.

Container redistributors must preserve `/app/licenses` and comply with every
applicable third-party term. If this summary, generated index, SBOM, and a
package disagree, the package's own terms control; report the discrepancy so
the bundle can be corrected.
