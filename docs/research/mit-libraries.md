# Permissive JavaScript libraries for the motion-import pipeline, tested against the no-dependency rule

*Research date: 2026-11-09. Primary sources only: each package's npm registry record (`npm view <pkg> license
dependencies version time --json`), the LICENSE file inside the published tarball, the GitHub API (`gh api repos/...`:
licence, last push, archived flag), the projects' own READMEs and source, and the glTF 2.0 specification. Every library in
the top table was installed in a scratch folder outside the repo (`npm i --ignore-scripts`) and its LICENSE file was read
and compared with `package.json`. The hands-on numbers come from scripts in that scratch folder (listed in §11), run on
Node 22.17.0 (macOS) against real Mesh2Motion clips (app commit `fd9fdeb`) and a CC0 BVH capture (assets commit
`dc2eb3c`). This report builds on [motion-data-sources.md](motion-data-sources.md) §5 and [mesh2motion.md](mesh2motion.md)
§3.3, §6c and §8, and corrects two entries in the former (§2 below). Claims that could not be checked are collected in the
last section.*

**Question.** Which MIT (or similarly permissive) JavaScript libraries fit Pixel Studio's import-motion and
reference-curve work? The rule that decides "fit" is in [CONTRIBUTING.md](../../CONTRIBUTING.md): "**No dependencies.** Not
at runtime, not for tests, not for building." So a library fits only if it can be used in one of these ways:

- **V, vendorable.** Small, no dependencies, plain ESM. It can be copied into the repo as one file with its licence
  header kept.
- **L, lazy-loaded opt-in.** Loaded from a CDN only when an optional feature runs, the way `studio/agent.js` loads
  `@anthropic-ai/sdk` from esm.sh.
- **T, offline tool.** Run once by a developer to convert data (for example with `npx`). It is never part of the repo's
  code path.
- **X, does not fit.** The reason is given each time.

MIT is preferred. ISC, BSD, 0BSD, Apache-2.0, Unlicense and CC0 are acceptable but flagged.

---

## Verdicts at a glance

Sizes are the file you would vendor, or the installed size with dependencies. Release dates are the npm publish date of
the latest version (`time[version]`).

| Need | Library | Licence (verified) | Class | Size | Last release | Verdict |
|---|---|---|---|---|---|---|
| 1 glTF + meshopt | **own GLB reader** (prototype, 65 lines) | ours (MIT) | V | 65 lines | — | **Use.** Decoded both clips correctly |
| | **`meshoptimizer` `meshopt_decoder.mjs`** | MIT (LICENSE.md, matches pkg) | **V** | 28.3 KB, 196 lines (WASM inlined as base64) | 1.3.0, 2026-09-25 | **Vendor this.** 0 deps, plain ESM, works in Node and browser |
| | `meshoptimizer` `meshopt_decoder_reference.js` | MIT (same file header) | V | 15.2 KB, 472 lines, pure JS | 1.3.0 | Works, identical output to 3e-5. Its own header says it is "not recommended for use in production" and it is not in the package `exports` |
| | `@gltf-transform/core` + `extensions` | MIT (LICENSE.md ×2) | X as a library; **T** as the CLI | 4.9 MB installed, 2 deps (`property-graph`, `ktx-parse`, both MIT) | 4.5.1, 2026-09-28 | Works, but has dependencies and loads 4× slower. The CLI's `copy` command strips meshopt in one step (T) |
| | `gltfpack` (CLI) | MIT | T | 340 KB | 1.3.0, 2026-09-25 | Strips meshopt, but rewrites the clip (198 → 63 channels). Do not use for import |
| | `@loaders.gl/gltf` | MIT | X | 7 deps | 4.5.4, 2026-10-10 | Dependencies |
| | three.js `GLTFLoader` | MIT | X | needs `three` (23 MB installed) | 0.187.0, 2026-10-30 | Pulls in a 3D runtime |
| 2 BVH | **own BVH parser** (prototype, 43 lines) | ours | V | 43 lines | — | **Use.** The only parser tested that handles multiple `ROOT`s |
| | three.js `BVHLoader.js` | MIT (three LICENSE) | X (reference only) | 486 lines, imports three core | 0.187.0 | Correct on our file, but needs three. Good reference for channel order |
| | `@nandenjin/bvh-parser` | MIT (LICENSE in tarball; the GitHub repo has none at its root and is **archived**) | V (with care) | 8.3 KB, 277 lines, ESM, 0 deps | 0.2.14, 2025-12-15 | Correct on our file, fails on multi-root. Archived. Not worth it over 43 own lines |
| | `bvh-parser` / `parse-bvh` (Lysenko) | MIT per `package.json` and README; **no LICENSE file** | X | 144 lines, CommonJS | 2018-01-31 / 2018-02-01 | **Bug:** joint offsets lose their X value. End sites have no parent |
| | `bvh` (npm) | MIT | X | — | 0.5.0, 2018-12-20 | **Not a mocap parser.** It is a bounding-volume hierarchy library |
| 3 FBX | `ufbx` (C) | MIT **or** Unlicense (LICENSE, dual) | T at best | single C file, no JS package | repo pushed 2026-10-01 | No official JS/WASM build. Its README lists "WASI: Clang WASM" as a target, so we would have to build one |
| | `@forgeax/engine-fbx` (ufbx in WASM) | "MIT" in npm metadata, **no LICENSE file in the tarball, no repository field** | X | 9 engine deps, 373 KB wasm | 0.3.11, 2026-10-10 | Unverifiable licence, tied to its engine |
| | `fbx-parser` | MIT (+ `pako` "MIT AND Zlib") | X | 2 deps | 2.1.3, 2021-02-12 | Raw node tree only. Stale |
| | FBX2glTF (Facebook) | BSD-3-Clause (flag) | T with caveat | binary | repo pushed 2026-03-27 | Needs Autodesk's proprietary FBX SDK 2019.2 |
| | `assimpjs` | MIT wrapper; assimp is BSD-3-Clause | T | 8.5 MB | 0.0.10, 2023-07-13 | Heavy. Only as a one-off converter |
| 4 C3D | *(no JS reader exists on npm)* | — | — | — | — | npm `c3d` is an unrelated 2014 package ("Contract Controlled Content Distribution") |
| | `c3d` (Python, py-c3d) | MIT (LICENSE; PyPI says MIT) | **T** | numpy dep | PyPI 0.6.0 | **Use offline** to convert C3D → CSV/JSON |
| | `ezc3d` (C++/Python) | MIT (LICENSE) | T | — | repo pushed 2026-10-27 | Alternative offline converter |
| 5 3D math | **own quaternion module** (prototype, 36 lines) | ours | V | 36 lines | — | **Use.** FK matches gl-matrix to 1.8e-4 on a 1.6-unit skeleton |
| | `gl-matrix` | MIT (LICENSE.md) | V, but large | `quat` needs 5 ESM files: 75.7 KB, 3,034 lines | 3.4.4, 2025-08-08 (4.0.0-beta.2 on `beta`) | Works. Far more than needed |
| | `wgpu-matrix` | MIT | V, but large | 199.5 KB (39 KB minified) single module | 3.4.2, 2026-02-12 | More than needed |
| | `quaternion` (rawify) | MIT | V | 34.5 KB, 1,423 lines | 2.2.0, 2025-09-17 | More than needed |
| 6 IK | **our `ccd` + `twoBone`** | ours | — | in `src/core/rig.js`, `src/core/motion.js` | — | **Keep** |
| | `ikts` (FABRIK, Caliko port) | MIT | X | 272 KB browser bundle | 1.3.7, 2022-03-13 | With defaults, misses targets by up to 0.7 units. Stale |
| | `inverse-kinematics` | MIT | X | — | 0.1.3, 2021-07-23; repo **archived** | Its ESM build fails to load (extensionless imports) |
| | `closed-chain-ik` | Apache-2.0 (flag) | X | 4 deps | 0.0.3, 2023-05-04 | Dependencies. A different problem (closed chains) |
| 7 Curves | **own curve module** (prototype, 28 lines) | ours | V | 28 lines | — | **Use:** Fourier fit, band-limited loop resample, unwrap, key reduction |
| | `fft.js` | MIT (stated in README; **no LICENSE file**) | X | 13 KB | 4.0.4, 2021-01-11 | Throws for N = 40: "FFT size must be a power of two" |
| | `fourier-transform` | MIT (LICENSE) | X for this use | 12.4 KB | 2.5.1, 2026-09-29 | Same power-of-two limit. Clip lengths are 40, 29, 23, 14, 11 |
| | `simplify-js` | **BSD-2-Clause** (flag) | X for this use | 3.2 KB | 1.2.4, 2020-02-03 | Its tolerance is not an angle bound: at "1°" the worst error was 6.7° |
| | `ml-savitzky-golay-generalized` | MIT | X | 2 deps | 5.1.0, 2026-09-11 | Not cyclic: distorts loop ends by up to 6° |
| | `fili` (IIR/FIR) | MIT | X | 292 KB | 2.0.3, 2018-12-13 | Not cyclic, stale |
| 8 Contacts | *(no JS library found)* | — | — | — | — | Hand-rolled height threshold reproduced the published duty factors |
| 9 Plotting | **inline SVG** (hand-rolled) | ours | V | ~40 lines (estimate) | — | **Default** for a static report |
| | `uPlot` | MIT (LICENSE) | **L** (browser) | 145 KB ESM (51 KB min IIFE) + 1.9 KB CSS, 0 deps | 1.6.32, 2025-03-14 | **Use if** the report needs zoom or a cursor. jsdelivr serves it as one file |
| | `chart.js` | MIT | X | 1 dep (`@kurkle/color`) | 4.6.1, 2026-10-22 | Dependency, bigger |
| 10 Other | `bezier-easing` | MIT (LICENSE) | V | 2.4 KB, 74 lines, ESM, 0 deps | 3.2.0, 2026-10-07 | Only if a `cubic-bezier` ease is ever added |
| | `simplex-noise` | MIT (LICENSE) | V | 18.7 KB, 465 lines | 4.0.3, 2024-07-26 | Not needed. Our `hash2` covers deterministic noise |
| | `open-simplex-noise` | **Unlicense** (flag) | V | — | 3.0.0, 2026-08-23 | Not needed |
| | `@bluecateng/nano-spring` | **ISC** (flag) | V | 4 KB | 2.1.2, 2026-10-29 | Not needed. `followOffsets` is already a damped spring |

## Recommended stack

1. **glTF/GLB:** our own ~65-line GLB animation reader plus the vendored `meshopt_decoder.mjs` (**V**, 28.3 KB, MIT). One-off
   alternative: `npx @gltf-transform/cli copy in.glb out.glb` strips the compression, and then no decoder is needed (**T**).
2. **BVH:** our own ~45-line parser (**V**, ours). three.js `BVHLoader.js` (MIT) is the reference for conventions.
3. **FBX:** no library. Convert offline (**T**): Blender, as in motion-data-sources.md §1.6, or FBX2glTF with the FBX SDK
   caveat.
4. **C3D:** Python `c3d` (py-c3d, MIT) as an offline converter to CSV/JSON (**T**). Write a JS reader only if C3D becomes
   a regular input.
5. **3D math:** our own ~36-line quaternion module (**V**, ours). No library.
6. **IK / retargeting:** keep our `ccd` and `twoBone`. Retargeting stays a bone map plus 2D projection (mesh2motion.md §4).
   No library.
7. **Curves:** our own ~30-line module: Fourier fit and resample, unwrap, and key reduction with a true angle bound (**V**,
   ours). No library.
8. **Foot contacts:** hand-rolled height threshold (**V**, ours).
9. **Plots:** inline SVG by default. Use uPlot from jsdelivr (**L**, browser only) if interaction is wanted.
10. **Other:** nothing new. Keep `hash2` for noise and `followOffsets` for springs. `bezier-easing` (**V**) only if a
    cubic-bezier ease is added.

The net result is **one vendored third-party file**, `meshopt_decoder.mjs`. Everything else is roughly 200 lines of our
own code, prototyped and tested in §11. Keep the vendored file out of `src/core`, as mesh2motion.md §6c already says.
`src/core` uses only language built-ins, and this file instantiates WebAssembly. The GLB reader itself uses only
`DataView`, `TextDecoder` and typed arrays, so it can live wherever the importer does. MIT requires the copyright and
permission notice to travel with copies. The decoder's two-line header names the licence but does not reproduce it, so
put the full text of meshoptimizer's `LICENSE.md` next to the vendored file, or add it as a comment.

## What "lazy-loaded" means in practice: browser yes, Node no

This was tested because class L assumes `import()` from a CDN works in both hosts. It does not work in Node.

- **Node 22.17 rejects `https:` imports.** `await import('https://esm.sh/...')` and the jsdelivr equivalent both throw
  `ERR_UNSUPPORTED_ESM_URL_SCHEME`. `node --help` on 22.17 lists no network-imports flag. Node 20 was not tested.
- **esm.sh responses are stubs.** `https://esm.sh/meshoptimizer@1.3.0/decoder?bundle` returns 107 bytes that re-export
  from an absolute path. `@gltf-transform/core?bundle` returns `import "/node/buffer.mjs"; ...`. So the workaround of
  fetching the text and importing it as a `data:` URL fails with `ERR_UNSUPPORTED_RESOLVE_REQUEST`.
- **Only self-contained single files work in Node.** jsdelivr's `meshoptimizer@1.3.0/meshopt_decoder.mjs` (29,019 bytes,
  no imports) loads through fetch plus a `data:` URL. A file that can be lazy-loaded this way can also be vendored, and the
  vendored copy is deterministic and works offline.

So **L is a browser-only class** here. It suits the studio and an HTML report (uPlot). It does not suit anything the
`pixel` CLI or `scripts/` must run.

---

## 1. Reading glTF/GLB animation channels (with `EXT_meshopt_compression`)

**What the clips contain.** Both test clips are listed in Mesh2Motion's
[manifest](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/static/assets/manifest.json):
`human/animations/walk.glb` (62.7 KB) and `bird/animations/flap.glb` (50.6 KB). They contain:

- `extensionsRequired: ["EXT_meshopt_compression"]` and no other extension;
- one skin, no mesh, and one animation (Walk: 198 channels; Flap: 165);
- meshopt buffer views in `ATTRIBUTES` mode with the filters `NONE`, `QUATERNION` (stride 8) and `EXPONENTIAL` (stride 12);
- rotation outputs stored as `VEC4` normalized int16 (`5122`, normalized) after decoding.

Quantized rotation outputs need no extension. The glTF 2.0 spec allows rotation sampler outputs to be _float32_,
_snorm8_, _unorm8_, _snorm16_ or _unorm16_ ([Specification.adoc, animation samplers
table](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc)), with
`f = max(c, −32767) / 32767` for snorm16. `KHR_mesh_quantization` concerns mesh vertex attributes, and these clips do not
use it. A reader that dequantizes any normalized accessor covers both cases. Interpolation is `LINEAR` and `STEP`; no
clip uses `CUBICSPLINE`.

**Candidate A: our own reader plus a vendored decoder.** `tests/glb-anim.mjs` has 65 lines (54 of code). It does the
following:

- parses the GLB chunks;
- refuses unknown required extensions;
- calls `decoder.decodeGltfBuffer(target, count, stride, source, mode, filter)` for each meshopt buffer view;
- reads accessors through `DataView`, with dequantization;
- returns the node hierarchy, the skin joint names, and per-channel `{node, path, interpolation, times, values}`.

It does not handle external `.bin` URIs, `data:` URIs, sparse accessors or `CUBICSPLINE`. Mesh2Motion needs none of
these.

| Decoder (vendored copy) | Module load (cold, median of 7) | Decode walk / flap | Result |
|---|---|---|---|
| `meshopt_decoder.mjs` (WASM inline) | 11.4 ms incl. `ready` | 5.1 / 4.3 ms | ✔ |
| `meshopt_decoder_reference.js` (pure JS) | 5.9 ms | 8.3 / 6.1 ms | ✔. Max difference from WASM: 3.1e-5 on walk (3,889 values), 0 on flap |

Output, identical with both decoders:

- **Walk:** 66 joints, Unreal-style names (`root pelvis spine_01 … thigh_r calf_r foot_r ball_r ball_leaf_r`). 40 keys
  at Δt 0.04167 s, which is **24.00 fps**, ending at 1.625 s.
- **`calf_r` local rotation, signed angle about its X axis (°):**
  `12.5 20.2 27.7 36.4 44.9 52.7 61.1 70.3 79.0 85.9 90.2 91.3 89.4 84.4 77.0 67.4 56.4 44.3 31.5 19.8 16.5 26.9 33.4
  37.3 39.5 40.2 39.8 38.5 36.7 34.4 32.1 29.9 28.2 27.3 26.8 26.3 25.7 24.8 23.4 19.8`. The peak of 91.3° matches the
  "91° walk knee" in mesh2motion.md §8.
- **Flap:** 55 joints (`root hips spine_0 … wing_1_L … wing_tip_L … Toes_tip_R`). 14 keys at **24.00 fps**, ending at
  0.5417 s.
- **`wing_1_L`, angle from frame 0 (°):** `0.9 6.0 22.8 49.2 79.8 106.2 123.1 129.0 123.1 106.2 79.8 49.2 22.8 6.0`. That is a
  129° stroke. The 0.9° at frame 0 is the int16 quantization of the quaternion.

**Which decoder to vendor.** Prefer **`meshopt_decoder.mjs`**:

- It is the production build. Its package `exports` map `./decoder` to it.
- three.js ships the same file as `examples/jsm/libs/meshopt_decoder.module.js` (29,256 bytes, same header and build).
- It has 0 dependencies and works in browsers and Node without a build step.

The cost is that the WASM is a base64 blob, so it cannot be reviewed by reading. The reference decoder is readable pure
JS and gave the same result, but it is labelled educational and is not exported. It is the fallback if the owner wants no
WASM at all. Both are MIT under the same copyright line ("Copyright (C) 2016-2026, by Arseny Kapoulkine"). The package
LICENSE.md has the same text, and the GitHub API reports MIT for [zeux/meshoptimizer](https://github.com/zeux/meshoptimizer)
(pushed 2026-10-14).

**Candidate B: `@gltf-transform/core` + `@gltf-transform/extensions`.** About 20 lines of code: `NodeIO`,
`ALL_EXTENSIONS`, and `registerDependencies({'meshopt.decoder': MeshoptDecoder})`. It printed the same joints, 24 fps and
the same `calf_r` curve. Costs:

- module load 47 ms;
- read and decode 28 ms (walk);
- 4.9 MB installed, with 2 dependencies, both MIT (`property-graph` 4.1.0, `ktx-parse` 1.1.0; LICENSE files read).

The core packages are MIT ([LICENSE.md](https://github.com/donmccurdy/glTF-Transform), "Copyright (c) 2024 Don McCurdy").
As a library it is **X** under our rule. In Node it cannot be lazy-loaded (see above).

**Candidate B as a tool (T).** `npx @gltf-transform/cli copy walk.glb walk-plain.glb` printed "Decoded
EXT_meshopt_compression" and wrote a 65.3 KB GLB with no extensions:

- The rotations stay int16-normalized.
- Our reader read the output with **no decoder at all** and gave the same `calf_r` values.
- This settles the open question in mesh2motion.md §9 ("Whether `gltf-transform` can strip `EXT_meshopt_compression` in
  one CLI step"): yes, `copy` does it.

Flag for the tool route: the CLI pulls in 179 packages (67 MB). Most are MIT (153) or ISC (10). The others:

| Licence | Packages |
|---|---|
| Apache-2.0 | `sharp`, `draco3dgltf`, `gltf-validator`, `detect-libc`, `@img/sharp-darwin-x64` |
| LGPL-3.0-or-later | `@img/sharp-libvips-darwin-x64` (the libvips binary) |
| BlueOak-1.0.0 | 5 packages, including `keyframe-resample` |
| BSD-3 / BSD-2 / 0BSD | one each |

None of it touches the repo or the output, so it is fine for a one-off conversion. It is not something to depend on.

**`gltfpack` (T, rejected for import).** `npx gltfpack -i walk.glb -o out.glb -noq` also removes the extension, but it
cut the clip from 198 channels to 63, dropping constant tracks. It is an optimizer, not a decompressor, so use `copy`.

## 2. BVH parsing

**Test file.** `motion-capture/raw captures/turn-45-left.bvh` from
[mesh2motion-assets](https://github.com/Mesh2Motion/mesh2motion-assets/tree/dc2eb3cf06ba0aaeb0c651503d5667f773781522)
(CC0, repo licence). It has 27 joints, every joint with 6 channels (`Xposition Yposition Zposition Zrotation Xrotation
Yrotation`, typical of mocopi exports), 5 End Sites, 366 frames, and Frame Time 0.016667. A CRLF copy and a hand-written
two-`ROOT` file were also tested.

| Parser | LF file | CRLF | Two ROOTs | Offsets | Cold load | Notes |
|---|---|---|---|---|---|---|
| own `tests/bvh-read.mjs` (43 lines) | ✔ | ✔ | ✔ | ✔ `[0, 5.0787, −1.1514]` | 5.3 ms | token stream, any channel order |
| three.js `BVHLoader` (r187) | ✔ | ✔ | ✘ "MOTION expected" | ✔ | 50.7 ms | returns three `Skeleton` + `AnimationClip`. Its header says "only supports BVH files containing a single root" |
| `@nandenjin/bvh-parser` 0.2.14 | ✔ | ✔ | ✘ "Unexpected token ROOT b" | ✔ (`offsetX/Y/Z`) | 7.6 ms | also exports a `fetch`-based `read()` that logs with `console.error` |
| `bvh-parser` 1.0.0 (= `parse-bvh`) | ✔ frames | ✔ | ✘ "expected MOTION" | **✘ `[5.0787, −1.1514]`**: X dropped | 8.9 ms | end sites get no parent |

All four printed the same joint list (`root torso_1 … torso_7 neck_1 neck_2 head l_shoulder … r_toes`), 366 frames and
**60.00 fps**. `r_low_leg.Xrotation` every 30th frame was
`0.00 19.44 19.09 55.16 8.70 14.10 14.57 14.75 16.70 22.51 12.97 7.87 55.53` (°) from all four. For three, the value was
recovered from its quaternion track with Euler order `ZXY`.

The Lysenko bug is visible in the source. `getLine('OFFSET')` already strips the keyword, and `parseOffset` then calls
`tokens.slice(1)` again. `parseEndSite()` is called without its `parent` argument. These packages state "(c) 2018 Mikola
Lysenko. MIT License" in the README, and `package.json` says MIT, but they ship no LICENSE file. The GitHub API reports
no licence for [mikolalysenko/parse-bvh](https://github.com/mikolalysenko/parse-bvh) (last push 2018-02-01). The
`bvh-parser` npm record's repository field points to the same repo.

**Corrections to motion-data-sources.md §5.**

- The npm package **`bvh` is not a motion-capture parser.** Its README: "Bounding volume hierarchy data structure library
  written in TypeScript."
- `bvh-parser`'s licence is stated in its README even though no LICENSE file exists. Its offset bug, rather than its
  licence, is the reason to avoid it.

`@nandenjin/bvh-parser` has a proper MIT LICENSE in the tarball ("Original: Copyright (c) 2012 hitsujiwool … Modified:
…"). But its GitHub repo [nandenjin/bvh](https://github.com/nandenjin/bvh) is **archived**, and the monorepo root has no
LICENSE file. It parses correctly except for multiple roots. That is not enough to beat 43 lines we own.

**Verdict.** Write our own parser. The prototype is 43 lines. A production version with good error messages (JSON-path
style, per CONTRIBUTING) and an Euler-to-quaternion helper for the channel order (`qfromChannels` in
`tests/quat.mjs`, 5 lines) should come to roughly 80 lines. That is well under the "~150 lines" budget. Use three's
`BVHLoader.js` (MIT) as the reference for conventions: BVH rotation channels are applied in the order listed, and position
channels apply to the root.

## 3. FBX

No permissive JS FBX reader passes the rule.

- **ufbx** ([ufbx/ufbx](https://github.com/ufbx/ufbx), pushed 2026-10-01, ~1.4k stars). Its LICENSE offers "ALTERNATIVE A -
  MIT License" or "ALTERNATIVE B - Public Domain (www.unlicense.org)". The GitHub API reports `NOASSERTION` because the
  file is dual. It is C only. The repo has `bindgen/`, `extra/` and `misc/` folders but no JS/WASM package, and the
  README lists "WASI: Clang WASM" as a build target. A WASM build would need a wasi-sdk toolchain on the developer's
  machine. A prebuilt `.wasm` could be vendored, but it would need a build step we don't have. **T at best.**
- **WASM builds of ufbx on npm:**
  - `@forgeax/engine-fbx` 0.3.11: npm metadata says MIT, but the tarball has no LICENSE file and no repository field.
    It depends on 9 `@forgeax/engine-*` packages. Its `pkg/fbx-wasm.wasm` is 373 KB. **X.**
  - `lecodes-assets` 2.9.0: no licence field. **X.**
  - `@plasius/gpu-model-fbx` 0.5.0: Apache-2.0 with 2 engine deps. **X.**
- **`fbx-parser` 2.1.3** (MIT, 2021-02-12). It gives a raw node tree only (no animation curves resolved), and depends on
  `pako` ("MIT AND Zlib") and `@picode/binary-reader`. **X.**
- **FBX2glTF** ([facebookincubator/FBX2glTF](https://github.com/facebookincubator/FBX2glTF)). Its LICENSE is "BSD License
  For FBX2glTF software", BSD-3-Clause per the README badge. The README says "only version 2019.2 of the FBX SDK is
  supported". That SDK is Autodesk's proprietary library, so FBX2glTF is **T with a caveat**: the binary embeds a
  proprietary SDK. The conversion output is ours.
- **`assimpjs`** 0.0.10 (MIT wrapper; assimp is BSD-3-Clause). 8.5 MB, last release 2023-07-13. **T** as a one-off.
- **three.js `FBXLoader`** (MIT): needs three. **X.**

Not tested hands-on: no CC0 FBX file was at hand, since the Mesh2Motion assets repo has none at `dc2eb3c`. The verdict
of motion-data-sources.md §5 stands: accept glTF and BVH only, and convert FBX offline (Blender, §1.6 there).

## 4. C3D

There is **no JavaScript C3D reader on npm**. `npm search c3d` returns:

- `c3d` 0.1.1 (2014), "Contract Controlled Content Distribution";
- CAD and analytics packages.

On GitHub, the only recent JS/TS hit with a permissive licence is
[SourorangeChen/C3D_Reader](https://github.com/SourorangeChen/C3D_Reader). It is MIT, created 2026-10-23, and has 10 stars.
It is an Electron/React viewer, and its parsing is done in Python: `requirements.txt` pins `c3d==0.6.0`. **X** as a
library.

Offline converters (**T**):

- **py-c3d**: PyPI `c3d` 0.6.0, licence MIT, requires `numpy`.
  [EmbodiedCognition/py-c3d](https://github.com/EmbodiedCognition/py-c3d) LICENSE: "The MIT License (MIT) Copyright (c)
  2013-2015 UT Vision, Cognition, and Action Lab". Last push 2025-10-22.
- **ezc3d**: [pyomeca/ezc3d](https://github.com/pyomeca/ezc3d) LICENSE "MIT License Copyright (c) 2018 pyomeca", pushed
  2026-10-27. Not installable from PyPI; PyPI `ezc3d` 1.7.2 has no licence field.

**Verdict.** Convert Dryad C3D files to CSV with py-c3d, once, outside the repo. A JS reader is only worth writing if C3D
becomes a regular input. The format has 512-byte blocks, a parameter section, and three processor types including DEC
floats. No line estimate was measured.

## 5. 3D math (quaternions, slerp, FK)

The importer needs:

- quaternion multiply;
- rotating a vector by a quaternion;
- shortest-path slerp;
- axis-angle to quaternion (for BVH Euler channels);
- a few vec3 helpers.

`tests/quat.mjs` does all of it in **36 lines**.

**Test.** Forward kinematics over the whole human walk hierarchy (67 nodes, 16 samples per cycle, slerp between keys),
once with `quat.mjs` and once with gl-matrix 3.4.4 (`quat.multiply`, `quat.slerp`, `vec3.transformQuat`):

- **Max world-position difference: 1.77e-4** on a skeleton whose largest coordinate is 1.59 units. At our 64 px scale
  (leg 37 units for 0.84 m) that is about 0.0001 px.
- The gap comes from gl-matrix storing results in `Float32Array`, and from different near-identity cut-offs in slerp:
  gl-matrix switches to plain lerp below 1e-6, ours to normalized lerp above a 0.9995 dot product.
- Bird flap: 6.4e-5.
- Time: 11.4 ms own vs 9.1 ms gl-matrix for 16 FK passes.

Side-plane angles from the FK (forward axis perpendicular to the hip line; degrees, + = forward), 16 samples:

- `thigh_r` from vertical: `−20 −11 −3 10 30 45 47 38 27 31 29 23 15 7 1 −6`.
- Knee flexion (thigh − shin): `13 32 52 73 89 89 71 43 18 33 40 39 34 29 27 25`.

These reproduce mesh2motion.md §5.3 (thigh −20..48°, knee 13..91°) at this coarser sampling.

**gl-matrix** ([toji/gl-matrix](https://github.com/toji/gl-matrix), MIT LICENSE.md "Copyright (c) 2015-2025, Brandon Jones,
Colin MacKenzie IV"):

- 3.4.4, published 2025-08-08; `4.0.0-beta.2` is on the `beta` tag.
- Vendoring `quat` means `quat.js` + `mat3.js` + `vec3.js` + `vec4.js` + `common.js`: 75.7 KB and 3,034 lines.
- The single minified UMD file is 52.7 KB.
- Cold load 21 ms (index).

`quaternion` 2.2.0 (MIT, 34.5 KB) and `wgpu-matrix` 3.4.2 (MIT, 199.5 KB) are also clean, but each is 40–200× more code
than we use. **Verdict: own module.**

## 6. IK and retargeting

The engine already has two solvers:

- `ccd` in [src/core/rig.js](../../src/core/rig.js): cyclic coordinate descent with absolute joint limits and an `aim`
  for the end part. `solveReach` adds four perturbed restarts.
- an analytic `twoBone` in [src/core/motion.js](../../src/core/motion.js): law of cosines plus a bend-sign choice. It is
  used for legs with two upper bones, and `ccd` with a "bent seed" retry is used for longer chains.

**Test** (`lib/test-ik.mjs`, `lib/test-ikts.mjs`). A planar leg, thigh 20 and shin 17 (our human's ratio), starting
straight, with five targets:

| Target | our raw `ccd` from straight (knee limit −170..0) | analytic knee | `ikts` FABRIK (defaults) |
|---|---|---|---|
| (5, 30) | miss 0.032 | 69.7° | miss 0.661 |
| (−8, 33) | **miss 3.04** (stuck straight) | 47.0° | miss 0.702 |
| (12, 25) | miss 0.027 | 83.2° | miss 0.066 |
| (0, 36.5) | **miss 0.50** (stuck straight) | 18.9° | **miss 0.50** (stuck straight) |
| (20, 20) | miss 0.032 | 80.6° | miss 0.035 |

Raw CCD from a straight chain stalls on in-line targets. That is the known local minimum, and it is exactly why the engine
already seeds bent poses and uses the analytic `twoBone` for two-bone legs. FABRIK (`ikts`, MIT, a port of Caliko) stalls
on the same in-line case and is looser by default. None of the libraries adds anything for 2–3-bone planar chains:

- `ikts` 1.3.7 (2022): 272 KB bundle.
- `inverse-kinematics` 0.1.3: archived. Its ESM `dist/index.js` imports `'./math/MathUtils'` without an extension, so
  both `import` and `require` throw `ERR_MODULE_NOT_FOUND`.
- `closed-chain-ik` 0.0.3: Apache-2.0, 4 deps.
- `three-ik` 0.1.0: 2018.

**Retargeting.** No library is needed. Our retarget is a bone map, then FK, then a side-plane projection to parent-relative
angles (mesh2motion.md §4 and §6a). three.js `SkeletonUtils.retargetClip` (MIT) and Mesh2Motion's swing-twist retargeter
(MIT) work in 3D on three objects and remain reference reading only. **Verdict: keep ours.**

## 7. Curve processing

Test signal: the real `calf_r` angle curve from the walk (40 frames, one loop, 12.5..91.3°). The functions are in
`tests/curves.mjs` (28 lines): `fourier`, `evalFourier`, `resampleLoop`, `unwrap` and `reduceKeys`.

**FFT libraries cannot take clip lengths as they are.**

- `fft.js`: `new FFT(40)` throws "FFT size must be a power of two and bigger than 1".
- `fourier-transform`: `fft(x)` throws "Input length must be a power of 2 (>= 2)".

Mesh2Motion loops are 40, 29, 23, 16, 14 and 11 frames long (manifest), so either library would need a resample first.
For N ≤ a few hundred, a direct DFT of K harmonics is O(N·K) and instant. On a 32-sample resample, our DFT and
`fourier-transform` agreed to 3 decimals on the first four harmonic amplitudes (24.352, 19.638, 7.263, 3.892).

**Fourier fit of the knee curve** (a compact, exactly cyclic description for tuning motion models):

| Harmonics K | Numbers stored | RMS error | Max error |
|---|---|---|---|
| 2 | 5 | 6.26° | 14.70° |
| 3 | 7 | 3.58° | 9.62° |
| 4 | 9 | 2.28° | 5.89° |
| 6 | 13 | 1.40° | 4.09° |
| 8 | 17 | 0.96° | 3.04° |

**Resampling a loop to bake length.** A band-limited resample of the 40-frame loop to 8 frames gives
`12.5 52.7 90.2 67.4 16.5 40.2 32.1 26.3`. With 4 harmonics (a zero-phase cyclic low-pass) it gives
`18.4 53.1 89.4 66.6 22.3 42.3 29.9 27.9`. Slerp the quaternions before projecting (mesh2motion.md §6a), then fit or
resample the projected angles after `unwrap`.

**Keyframe reduction.**

| Tolerance | `simplify-js` keys | its worst angle error | own `reduceKeys` keys | own worst error |
|---|---|---|---|---|
| 0.5° | 16 | 2.31° | 25 | 0.46° |
| 1° | 10 | **6.69°** | 20 | 0.79° |
| 2° | 5 | **10.60°** | 14 | 1.98° |

`simplify-js` ([mourner/simplify-js](https://github.com/mourner/simplify-js), **BSD-2-Clause**, LICENSE "Copyright (c)
2017, Vladimir Agafonkin", last release 2020-02-03) measures perpendicular distance in the (frame, degree) plane. On a
curve that moves ~8° per frame, that lets the vertical error run several times past the tolerance. Our 20-line RDP
measures vertical (angle) error and stays within it. Our animation format uses one value per frame (`frames` 1..64), so
key reduction matters only if keyframed output (`keys`) is emitted.

**Smoothing.** Savitzky-Golay (`ml-savitzky-golay-generalized` 5.1.0, MIT, window 9, order 2) is not cyclic. Compared with
the same filter on a wrap-padded loop, it differs by **6.03°** at frame 0 and 2.31° at the last frame, and by 0.00° in the
middle. Loops need cyclic filters. Fourier truncation is one, as is wrap-padding before any FIR. `fili` (MIT, 2018) has
the same problem. **Verdict: own module.**

## 8. Foot-contact and gait-event detection

No JS library was found. npm searches for "gait" and "foot contact" return unrelated packages, plus `@homie-rocks/walk`
(Apache-2.0), a three.js character controller. Hand-rolled rule, as in mesh2motion.md §5.1: the toe point is in contact
when it is within 4% of leg length of the clip's lowest toe height. Results:

| Clip | Foot | Contact over the loop | Duty | Touchdown phase |
|---|---|---|---|---|
| human Walk (40 samples) | `ball_r` | `#####...................################` | 0.53 | 0.60 |
| | `ball_l` | `...#######################..............` | 0.57 | 0.07 |
| bird Walk (11 samples) | `Toes_R` | `#.....#####` | 0.55 | 0.55 |
| | `Toes_L` | `..####.....` | 0.36 | 0.18 |

The human duty of 0.53 matches mesh2motion.md §5.3. The bird's left foot (0.36) is below the 0.55–0.64 published there.
At 11 samples, one sample is 9% of the cycle, so the threshold or sampling should be tuned before relying on it.

**A pitfall found while testing.** A speed test ("contact when the foot moves slowly") found **no** contacts at all. These
clips are in place (on a treadmill), so a planted foot slides backward at walking speed. For in-place clips, either use
height alone, or compare the foot's velocity to the stance velocity (−mean forward speed) rather than to zero. This logic
fits in roughly 15 lines.

## 9. Plotting joint-angle curves in an HTML report

The reference script in mesh2motion.md §8 compares a handful of curves with 16 samples each.

- **Inline SVG** (`<polyline>` per curve, axes, labels) needs no library. It works in Node (string output) and in any
  viewer. Estimated at ~40 lines (not written here). **Default.**
- **uPlot** ([leeoniya/uPlot](https://github.com/leeoniya/uPlot), MIT LICENSE "Copyright (c) 2022 Leon Sorokin", 1.6.32
  published 2025-03-14, repo pushed 2026-10-30, 0 deps).
  - `dist/uPlot.esm.js` is 145.4 KB with no `import` statements, and jsdelivr serves it as is (HTTP 200,
    `https://cdn.jsdelivr.net/npm/uplot@1.6.32/dist/uPlot.esm.js`, plus 1.9 KB `uPlot.min.css`).
  - It renders to canvas in a browser. Node can import it (56.7 ms) but cannot draw.
  - **L (browser only)**: the generated HTML can `import()` it when opened. Worth it only for zoom, cursor read-out, or
    many long curves.
- **chart.js** 4.6.1 (MIT): depends on `@kurkle/color`. **X.**

## 10. Other things that could help the engine

Grep of `src/core` for what already exists:

- **Deterministic noise:** `hash2` in [src/core/textures.js](../../src/core/textures.js). An integer hash; textures use it
  for value noise.
- **Spring / second-order dynamics:** `followOffsets` in [src/core/animate.js](../../src/core/animate.js). A damped angular
  spring per `follow` part, integrated at 8 substeps.
- **Easing:** `smooth` (smoothstep) and `minJerk` in [src/core/motion.js](../../src/core/motion.js), and `linear | smooth |
  step` in `animate.js`.

Candidates:

- **`simplex-noise`** 4.0.3 (MIT, 18.7 KB, 0 deps). Needs a `random()` source to be seeded. Feeding it `Math.random`
  breaks the determinism rule, and feeding it `hash2` makes it redundant. 1D value noise for idle variation is a
  smoothstep between two `hash2` values (~5 lines). **Not needed.**
- **`open-simplex-noise`** 3.0.0 (**Unlicense**) and **`alea`** 1.0.1 (MIT, seeded PRNG): same conclusion.
- **`@bluecateng/nano-spring`** 2.1.2 (**ISC**, 4 KB): a UI spring. `followOffsets` already does the physics. **Not
  needed.**
- **`bezier-easing`** 3.2.0 (MIT, [gre/bezier-easing](https://github.com/gre/bezier-easing), LICENSE "Copyright (c) 2014
  Gaëtan Renaudeau", published 2026-10-07). `src/index.js` is 74 lines, ESM, 0 deps, with one `export default`. **V**, if
  `"ease": [x1, y1, x2, y2]` (CSS `cubic-bezier`) is ever added to keyframe tracks. It is the only "nice to have" library
  in this survey that is clean to vendor.

## 11. Hands-on: scripts, sizes, load times

All files are in the scratch folder
`/private/tmp/claude-501/-Users-pavelpascari-work-projects-pavelpascari/72fe6b5a-fbe9-4b20-9267-e49508e075a3/scratchpad/mitlibs/`.
Nothing was installed into the repo. The repo's `src/core/rig.js` was imported read-only for the IK test.

| Script | What it does |
|---|---|
| `tests/glb-anim.mjs` | prototype GLB animation reader (65 lines) |
| `tests/test-glb-handrolled.mjs` | decode a clip with the vendored WASM or reference decoder; print joints, fps, one joint's curve |
| `tests/test-glb-compare.mjs` | WASM vs reference decoder on every value; wing angle from frame 0 |
| `tests/glbjson.mjs` | dump extensions, meshopt modes and filters, accessor types |
| `lib/test-gltf-transform.mjs` | same decode through `@gltf-transform/core` |
| `tests/bvh-read.mjs` | prototype BVH parser (43 lines) |
| `lib/test-bvh.mjs` | run own / Lysenko / nandenjin / three parsers on a BVH |
| `tests/quat.mjs` | prototype quaternion module (36 lines) |
| `lib/test-fk.mjs` | FK with own math vs gl-matrix, side-plane angles, foot contacts (`CONTACT=` env) |
| `tests/curves.mjs`, `lib/test-curves.mjs`, `lib/test-curves2.mjs` | Fourier fit and resample, FFT libraries, simplify-js vs own RDP, Savitzky-Golay seam test |
| `lib/test-ik.mjs`, `lib/test-ikts.mjs` | our `ccd` vs analytic vs `ikts` |
| `tests/test-cdn-import.mjs` | Node `import()` of esm.sh/jsdelivr URLs, direct and via `data:` URL |
| `lib/bench-load.mjs` | cold module load, fresh process, median of 7 |

**Cold load in Node 22.17** (fresh process, median of 7, `performance.now()` around `import()`). The floor for any small
ES module is about 5 ms.

| Module | ms | | Module | ms |
|---|---|---|---|---|
| own glb-anim / bvh-read / quat / curves | 5.2–5.3 | | `gl-matrix` | 21.0 |
| `meshopt_decoder_reference` | 5.9 | | `quaternion` | 8.1 |
| `meshopt_decoder.mjs` + `ready` | 11.4 | | `fft.js` / `fourier-transform` | 10.5 / 7.6 |
| `@gltf-transform/core` + `extensions` + `meshoptimizer` + `ready` | 47.1 | | `simplify-js` | 7.8 |
| three `BVHLoader` (with three core) | 50.7 | | `simplex-noise` / `bezier-easing` | 8.2 / 6.4 |
| `@nandenjin/bvh-parser` / `bvh-parser` | 7.6 / 8.9 | | `uplot` (import only) | 56.7 |

**Installed sizes** (`du`, package only unless noted):

| Package | Size | | Package | Size |
|---|---|---|---|---|
| `meshoptimizer` | 360 KB | | `gl-matrix` | 860 KB |
| `@gltf-transform/core` + `extensions` + 2 deps | 4.9 MB | | `quaternion` | 344 KB |
| `@gltf-transform/cli` + `gltfpack` tree | 67 MB (179 packages) | | `wgpu-matrix` | 1.9 MB |
| `three` | 23 MB | | `uplot` | 552 KB |
| `@nandenjin/bvh-parser` | 60 KB | | `simplex-noise` | 128 KB |
| `simplify-js` | 20 KB | | `ikts` | 504 KB |

**Licence check method.** For every installed package, including transitive ones, the first lines of the LICENSE file in
`node_modules/<pkg>` were compared with `package.json`'s `license`. All matched, except packages with **no LICENSE file**:
`bvh-parser`, `parse-bvh` (MIT stated in README) and `fft.js` (full MIT text in README, "Copyright Fedor Indutny, 2017").
Transitive deps of the tested libraries are all MIT: `property-graph`, `ktx-parse`, `cheminfo-types`, `is-any-array`,
`@picode/binary-reader`. The exception is `pako`, "(MIT AND Zlib)". The recommended vendored file
(`meshopt_decoder.mjs`) has no dependencies at all.

---

## Could not be verified

- **Node 20 behaviour of `import('https://…')`.** Only Node 22.17 was available. Node 20 had network imports behind an
  experimental flag (from memory, not checked). Either way, the `pixel` CLI should not rely on it.
- **Browser behaviour of the vendored decoder and reader.** They use only `WebAssembly`, `DataView`, `TextDecoder` and
  typed arrays. three.js ships the same decoder for browsers, but neither file was run in a browser here.
- **FBX readers were not run.** No permissively licensed FBX sample was available. The ufbx WASI build was not attempted.
- **C3D converters were not run** (py-c3d, ezc3d). Their licences were read; their behaviour on Dryad bird files was not
  tested.
- **The licence of `@forgeax/engine-fbx`** beyond its npm metadata: no LICENSE file, no repository link.
- **Whether the reference meshopt decoder stays maintained.** It is in the tarball but not in `exports`, and its header
  calls it educational.
- **The 3.1e-5 WASM-vs-reference difference on the walk clip** was not traced to a specific filter. `EXPONENTIAL` float
  rounding is the likely cause; it is 0 on the flap clip. It is far below anything visible.
- **Line estimates for the production BVH parser (~80), SVG plot (~40) and contact detector (~15)** are estimates, not
  measured code.
- **Bird-walk contact duty for the left foot** (0.36 here vs 0.55–0.64 in mesh2motion.md §5.3) was not reconciled. It
  is probably sampling (11 samples) or threshold.
