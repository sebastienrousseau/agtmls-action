<!-- SPDX-FileCopyrightText: 2026 Sebastien Rousseau -->
<!-- SPDX-License-Identifier: Apache-2.0 OR MIT -->

# vendor/wasm

`agtmls-core` compiled to WebAssembly, committed rather than installed.

A GitHub composite action runs the repository as-is: there is no install step,
so anything the action needs at runtime has to be in the repository. Vendoring
also means the action fetches nothing from a package registry while it runs,
which matters for something whose job is supply-chain analysis — an analyzer
that downloads its own implementation at audit time is a strange thing to
trust.

**Generated. Do not edit.** Rebuild with:

```bash
cd ../../Rust/agtmls-wasm
AGTMLS_SPEC=../../Python/agtmls-spec \
RUSTFLAGS="--remap-path-prefix=$HOME/.cargo=/cargo --remap-path-prefix=$HOME/.rustup=/rustup --remap-path-prefix=$HOME/Code/Public=/src" \
  wasm-pack build --target nodejs --release --out-dir pkg-node
cp pkg-node/agtmls_wasm{.js,_bg.wasm,.d.ts} \
   ../../JavaScript/agtmls-action/vendor/wasm/
```

The `--remap-path-prefix` flags keep the builder's home directory out of the
module: rustc records source paths for panic locations, and a test fails on
any `/Users/` or `/home/` in it.

`scripts/check-vendor-fresh.mjs` fails CI if these files do not match a fresh
build, so a stale analyzer cannot ship quietly.
