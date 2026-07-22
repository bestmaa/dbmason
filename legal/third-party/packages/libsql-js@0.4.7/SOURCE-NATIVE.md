# libsql-js 0.4.7 native notice provenance

The `@libsql/linux-*` packages contain a stripped native binary and no license
files. This supplement binds the published npm artifacts to the exact locked
Rust graph, the statically linked Rust 1.78 standard library, and the non-Cargo
SQLite/libSQL sources used by the upstream build. It is a conservative notice
and source-pointer closure, not a legal conclusion about conflicting upstream
license metadata.

## Reproducible inputs

- libsql-js tag `v0.4.7`, commit
  `e6422aab8be35af73601e452d40d4a0945fd6bfb`
- pinned libsql dependency commit
  `20147731c4a9d6e942b159f183215e9399fda2c3`
- `SOURCE-Cargo.lock` SHA-256
  `c81ec106dad8512e5eb742a032fb7c4207976b4f8d749ab277bf663908b25869`
- cargo-about `0.9.1` release archive SHA-256
  `c0e7dc6f5d74b0beec5c0053d39ab24514c717d19acd91886907a22457ea9e98`
- cargo-about executable SHA-256
  `c6e1f29efddc40bb41c2a990c3bb0b5650c3b352943f7fba78fc26eb1e19bb19`
- Rust `1.78.0`, matching the upstream release workflow
- SPDX license-list-data `v3.28.0`, commit
  `c4a7237ec8f4654e867546f9f409749300f1bf4c`

Fail-closed cargo-about reports were generated independently for
`x86_64-unknown-linux-gnu`, `x86_64-unknown-linux-musl`, and
`aarch64-unknown-linux-musl`. All three reports were byte-identical at SHA-256
`f6185a8c8385afdc2d67ca6c453a876f2aca3e289a5f5a701d8f402475c77193`.
`COMPONENTS.json` records 178 target-closure components and all 66 detected
license-text variants. Build dependencies are intentionally retained.

The four published binaries contain the same embedded Rust commit
`9b00956e56009bab2aa15d7bff10916599e3d6d6`. Each contains 57 Cargo registry
path markers; every marker is represented in the retained Cargo report. The
libsql git source marker resolves to the pinned `20147731...` commit.

## Registry artifact binding

| Package | npm tarball SHA-256 | `index.node` SHA-256 | GNU build ID |
| --- | --- | --- | --- |
| `@libsql/linux-x64-gnu@0.4.7` | `154261e0f7f1509b24f8504e8e5ddc5c38035096b606c2ed41503a68ac9b00f1` | `05fd43b9f701af09d1848891834ca5de15549d8a75aad7160a61a6250e28fd94` | `0027f617...` |
| `@libsql/linux-x64-musl@0.4.7` | `76793df7b397491765658a1f7fa7f293fdcfb77bf79bf9a5c3b082d1ce6e08fd` | `aabe37ef0be35ba9f32af85f7d3d68fa1509f421663521fae37fd34bce71ccea` | not present |
| `@libsql/linux-arm64-gnu@0.4.7` | `3e5edd4003e7684ac839e9669582a4701663e1ebdc464e1f92d4963a3a71813b` | `b3e5f864e6313c8285dfea5c49db658fe20ce841c05d8558038dd19688d0c7a1` | `7124ba8...` |
| `@libsql/linux-arm64-musl@0.4.7` | `72cdccfc7a56c2b6a37b9f75870ebf7d45974188b46d986b2e5e361a1664a75e` | `35b43de6caab0231ef7b5748f068509da3c9994aeb4a611e2ea2b0baca6b6ae6` | not present |

The matching npm SHA-512 integrities are pinned in `pnpm-lock.yaml` and
`legal/third-party/PROVENANCE.json`. Official DBMason images ship the two musl
variants; GNU artifacts remain covered for supported local Linux use.

## Cargo and MPL source availability

`NOTICE-RUST-DEPENDENCIES.txt` contains every text produced by cargo-about and
maps it to components. `COMPONENTS.json` records the same mapping with per-text
SHA-256 values. The sole MPL-2.0 component is `webpki-roots@0.26.5`. Its exact
Source Code Form is available from the immutable Cargo archive:

- <https://static.crates.io/crates/webpki-roots/webpki-roots-0.26.5.crate>
- SHA-256 `0bd24728e5af82c6c4ec1b66ac4844bdf8156257fccda846ec58b42cd0cdbe6a`

That checksum is identical to the checksum in `SOURCE-Cargo.lock`. The URL and
hash are also machine-readable in `COMPONENTS.json` and `PROVENANCE.json`.

## Rust standard-library closure

The native modules statically link Rust standard-library code, which is outside
the Cargo package graph. The exact Rust 1.78 distribution documents are retained:

| Retained file | SHA-256 |
| --- | --- |
| `NOTICE-RUST-1.78-COPYRIGHT.txt` | `bd0581fef622b3d8b25836cf70feb7e1a7a6171ea9e440b46dfda74c46a0ed0d` |
| `LICENSE-RUST-1.78-MIT.txt` | `23f18e03dc49df91622fe2a76176497404e46ced8a715d9d2b67a7446571cca3` |
| `LICENSE-RUST-1.78-APACHE-2.0.txt` | `62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a` |

The COPYRIGHT file also retains the applicable LLVM exception/NCSA and Unicode
third-party terms.

## Non-Cargo SQLite/libSQL closure

The build copies `libsql-ffi/bundled/src/sqlite3.c` into the
SQLite3MultipleCiphers source tree before producing the static archive. The
copied amalgamation is 9,304,075 bytes, identifies SQLite `3.45.1`, and has
SHA-256 `0fd6a3d357bfa92dc820dd8f9b1b02643f837b8048277fae3e575e73281bd7ea`.

| Source family | Retained evidence |
| --- | --- |
| libsql source | Exact root MIT license plus the libsql/rusqlite MIT notices embedded in the SQLite amalgamation |
| SQLite core and official extensions | Exact SQLite blessing header and normalized public-domain notice |
| SQLite3MultipleCiphers 1.8.1 | Exact project MIT license, exact `LICENSE.spdx`, and exact `src/filelist.md` |
| `sha2.c` | Exact BSD-3-Clause source header, Copyright Olivier Gay 2005/2007 |
| `sha1.c` | Exact Steve Reid and later-contributor public-domain source header |
| `md5.c` | Exact Alexander Peslyak public-domain dedication and fallback permissive terms |
| `rijndael.c` / `rijndael.h` | Exact per-file MIT/public-domain headers plus the conflicting exact `filelist.md` statement |
| `extensionfunctions.c` | Exact source header, exact file hash, `filelist.md` statement, and Liam Healy's later Unlicense/public-domain text |

The exact `extensionfunctions.c` vendored source has SHA-256
`1fc1f9bcecb388dbc41c42895aee16371a6e1da6f541ae481a6255f59d0ddf3d`
and no license declaration in its source header. The vendored filelist assumes
public-domain treatment. Liam Healy later added the retained Unlicense text at
commit `16c2a17c7d9675ecbc717cad1883df21011a71e4`; this supplement preserves those
facts without claiming that the later text resolves every question about the
modified vendored copy.

### Rijndael discrepancy

The exact SQLite3MultipleCiphers `src/filelist.md` says `rijndael.*` is
`LGPL-3.0+ WITH WxWindows-exception-3.1`. The exact `rijndael.c` and
`rijndael.h` headers at the same commit instead say the adjustments are MIT and
the original implementation is public domain; the project root license is MIT.
All three signals are retained verbatim. DBMason does not silently select one,
does not describe the native module as uniformly MIT, and does not claim the
metadata conflict is resolved. Redistributors should obtain legal review if
their distribution decision depends on which signal controls.

Because the filelist's signal may control, this directory also conservatively
retains the complete SPDX reference texts for `LGPL-3.0-or-later` and
`WxWindows-exception-3.1`. They come from SPDX license-list-data `v3.28.0`
commit `c4a7237ec8f4654e867546f9f409749300f1bf4c`, at SHA-256
`996af0513df21f7496288951c41428a03c174e9e4a9d63665c57d670f845ccb1`
and `8147956dd2d78744a052bc0d6490bbefe21e18b325a096fb13b3768b74458b55`,
respectively. Retaining those texts is precautionary and is not a conclusion
that the binary is governed by LGPL.

System `musl`/`glibc`, `libgcc`, and base-image libraries are dynamically linked
runtime/SBOM scope and are not duplicated in this statically linked supplement.

## Regeneration

Run cargo-about against the exact source and lock with
`legal/third-party/libsql/about.toml`, `--locked`, `--fail`, and each target
above. Confirm the three raw reports are byte-identical, obtain the exact Rust
1.78 `share/doc/rust` directory, then run:

```bash
node scripts/build-libsql-native-notices.mjs \
  cargo-about-x86_64-unknown-linux-gnu.json \
  Cargo.lock legal/third-party/packages/libsql-js@0.4.7 \
  /path/to/libsql-20147731-source \
  /path/to/rust-1.78/share/doc/rust
```

The generator verifies every copied non-Cargo source and Rust document against
its expected SHA-256 and fetches the two reference texts only from immutable,
hash-pinned SPDX URLs before writing output. Run
`pnpm run check:third-party-provenance` afterward to verify the committed bundle.
