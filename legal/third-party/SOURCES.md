# Supplemental license sources

The npm archives represented here omitted a root license text. These vendored
files come from immutable upstream commits or from an explicitly identified
license section in the published source. `PROVENANCE.json` records the exact
URLs, hashes, artifact integrities, and any normalization or extraction.

| Supplement                  | Applies to                                          | Exact upstream evidence                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brocli@0.10.2`             | `@drizzle-team/brocli@0.10.2`                       | SLSA commit `65d1432f4ce1f048d99604acd60d0eab8612c91b`; root Apache-2.0 `LICENSE`                                                                                                                  |
| `data-uri-to-buffer@4.0.1`  | `data-uri-to-buffer@4.0.1`                          | tag/commit `85cd8c854aefbf1bb636789d80364cfac8ea1583`; README License section                                                                                                                      |
| `drizzle-kit@0.31.7`        | `drizzle-kit@0.31.7`                                | SLSA commit `c66862c55abe6cd23e9bf1f07519e3e5c6274cbf`; package metadata says MIT while the source root says Apache-2.0                                                                            |
| `drizzle-orm@0.45.2`        | `drizzle-orm@0.45.2`                                | tag/attested commit `273c78071d4841b497f5144734b38294df7ec64b`; root Apache-2.0 `LICENSE`                                                                                                          |
| `esbuild@0.25.12`           | `@esbuild/linux-* @0.25.12`                         | tag/commit `208f539945b145e7c9d6d844290f81c3fe5af320`; root MIT `LICENSE.md`                                                                                                                       |
| `esbuild@0.28.1`            | `@esbuild/linux-* @0.28.1`                          | tag/commit `bb9db84c02433fbe37b3509f53f9f3e3cc48725e`; root MIT `LICENSE.md`                                                                                                                       |
| `libsql-client-ts@0.14.0`   | `@libsql/client`, `@libsql/core`                    | tag/commit `v0.14.0` / `839d48ef033d0baa8e8fb68ffad853998b1e7f84`; root MIT `LICENSE`                                                                                                              |
| `libsql-isomorphic-ts`      | `@libsql/isomorphic-fetch`, `@libsql/isomorphic-ws` | registry git heads `ab3b09a269a7385bab85684aae3a469e5c1b2797` and `87331abc53d4e77deb2f3d6384438d4804a07e0a`; identical root MIT `LICENSE`                                                         |
| `libsql-js@0.4.7`           | `@libsql/linux-* @0.4.7`                            | tag/commit `v0.4.7` / `e6422aab8be35af73601e452d40d4a0945fd6bfb`; exact npm/binary hashes, libsql commit `20147731...`, 178-component Cargo closure, Rust 1.78 terms, and SQLite3MC source notices |
| `next-compiled@16.2.6`      | traced `next@16.2.6` `dist/compiled` components     | exact npm archive and standalone trace; all 137 embedded legal texts plus reviewed Edge Runtime and `string-hash` fallbacks                                                                        |
| `next@15.5.20`              | `@next/env@15.5.20`                                 | attested tag/commit `v15.5.20` / `a518d38b3a00713be23eefb3fa662ecbcf1341b2`; Next MIT plus bundled dotenv notices                                                                                  |
| `next@16.2.6`               | `@next/env` and traced `@next/swc-linux-* @16.2.6`  | tag/commit `v16.2.6` / `ee6e79b1792a4d401ddf2480f40a83549fe8e722`; Next MIT plus bundled dotenv notices                                                                                            |
| `pgpass@1.0.5`              | `pgpass@1.0.5`                                      | tag/commit `v1.0.5` / `4230ed5e417ba6044ea7eb80b7c33db9ec301398`; README License section                                                                                                           |
| `pg-types@2.2.0`            | `pg-types@2.2.0`                                    | tag/commit `v2.2.0` / `d9d9dfb87eb50914043cbc178c301b7dd3b0c50d`; README License section                                                                                                           |
| `promise-limit@2.7.0`       | `promise-limit@2.7.0`                               | tag/commit `v2.7.0` / `5b911ce33253ec0a7ea9cf079d8c0434efbe3244`; published metadata declares ISC but supplies no notice                                                                           |
| `react-client-only@0.0.1`   | `client-only@0.0.1`                                 | npm tarball and package metadata only; the archive publishes no repository, git head, author, or copyright notice                                                                                  |
| `react-select@5.9.0`        | `react-select@5.9.0`                                | peeled tag/commit `179b8166cafc6540ec7a3c6091320c18b8aff75a`; root MIT `LICENSE`                                                                                                                   |
| `tokenizer-token@0.3.0`     | `@tokenizer/token@0.3.0`                            | peeled tag/commit `e068a455370090f44c757946b8571bb3fb1f117e`; README Licence section                                                                                                               |
| `to-no-case@1.0.2`          | `to-no-case@1.0.2`                                  | tag/commit `9d93bfe6c86b73bcd93d86c17d2ea28f164a967a`; README License section                                                                                                                      |
| `to-snake-case@1.0.0`       | `to-snake-case@1.0.0`                               | tag/commit `b3652b407617699f16866debb0f71d73bbb6ce58`; README License section                                                                                                                      |
| `to-space-case@1.0.0`       | `to-space-case@1.0.0`                               | tag/commit `aa68213d1211745ce7c6c725ba072e6b13bef640`; README License section                                                                                                                      |
| `truncate-utf8-bytes@1.0.2` | `truncate-utf8-bytes@1.0.2`                         | peeled tag/commit `c8fcebc8be093c8bd8db1e7d75c09b9fce7e4708`; package metadata declares WTFPL and the source supplies `AUTHORS`                                                                    |

## Special cases

### Bundled dotenv code

Both `@next/env` versions contain byte-identical bundled output (SHA-256
`44e84a28e712bca30781e892e3e64d3aecdc46bef9d23b5b7f39bfa1fcef6baa`)
with `dotenv@16.3.1` and `dotenv-expand@10.0.0`. Their BSD-2-Clause license
texts are stored beside the Next license in both supplement directories.

### Next.js compiled runtime closure

Next.js 16.2.6 vendors dependencies below `dist/compiled`, where ordinary npm
package boundaries may be absent from the final standalone image. The license
collector conservatively copies and hashes all 137 legal/notice files shipped
in that pinned tree. It derives the actual compiled component set from the
standalone trace, writes the component-to-notice mapping to
`NEXT_COMPILED_NOTICES.json`, and fails if any traced component is uncovered.

Most components have an adjacent retained notice. The reviewed fallbacks are:
the three `@edge-runtime/*` packages use the Edge Runtime monorepo MIT license
at the single commit to which their exact release tags peel; `image-detector`
uses the `image-size@1.2.1` license because Next's pinned taskfile builds it
from that package; `next-server` uses the pinned Next root license; and
`string-hash@1.1.3` uses the CC0 waiver from its exact upstream README.
`PROVENANCE.json` pins all artifacts, commits, source hashes, and mapping
evidence.

### Missing copyright notices

`client-only@0.0.1` and `promise-limit@2.7.0` declare MIT and ISC,
respectively, but their archives do not publish a license text or copyright
notice. Their templates intentionally retain `<year>/<copyright holders>` or
`<YEAR>/<OWNER>` placeholders. Package author, publisher, homepage, and bug
tracker metadata are not treated as copyright evidence.

### drizzle-kit conflict

The exact published `drizzle-kit@0.31.7` metadata declares MIT, while the root
license at its SLSA-attested source commit is Apache-2.0. Both signals and the
conflict notice are retained without claiming that the package is dual-licensed.

### Native libsql scope

The `libsql-js@0.4.7` supplement binds all four published Linux npm artifacts
to exact tarball and `index.node` hashes. Three target-specific, fail-closed
cargo-about reports were byte-identical and retain 178 locked components and 66
license-text variants. Rust 1.78 standard-library license/COPYRIGHT documents
and the non-Cargo libSQL, SQLite 3.45.1, and SQLite3MultipleCiphers notices are
also retained. The exact MPL-2.0 `webpki-roots@0.26.5` Source Code Form URL and
Cargo checksum are recorded in `COMPONENTS.json` and `PROVENANCE.json`.

This is a conservative notice and source-pointer closure, not a claim that
ambiguous upstream metadata has disappeared. SQLite3MultipleCiphers' exact
`filelist.md` labels `rijndael.*` as
`LGPL-3.0+ WITH WxWindows-exception-3.1`, while the same-commit file headers
state MIT plus original public domain and the root license states MIT. The
vendored `extensionfunctions.c` header has no license declaration; the retained
evidence includes the filelist's public-domain assumption and Liam Healy's
later Unlicense/public-domain text. The exact SQLite3MC `LICENSE.spdx` and full,
immutable SPDX `LGPL-3.0-or-later` and `WxWindows-exception-3.1` reference texts
are retained conservatively; their inclusion is not a conclusion that LGPL
governs the binary. `SOURCE-NATIVE.md` preserves the hashes, source paths,
regeneration procedure, and legal-review caveat without silently choosing among
conflicting signals.

### Dev-only stackback

`stackback@0.0.2` is reachable only through the dev dependency chain
`vitest -> why-is-node-running -> stackback`. It has no supplement mapping.
If it reappears in a final runtime trace, collection must fail and its embedded
V8 BSD-3-Clause header must be preserved before release.
