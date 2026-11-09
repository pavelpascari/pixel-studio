# Mesh2Motion: what it is, and what Pixel Studio can take from it

*Research date: 2026-11-09. Primary sources only: the Mesh2Motion app repository at commit
[`fd9fdeb`](https://github.com/Mesh2Motion/mesh2motion-app/tree/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b) (2026-11-07),
the assets repository at commit
[`dc2eb3c`](https://github.com/Mesh2Motion/mesh2motion-assets/tree/dc2eb3cf06ba0aaeb0c651503d5667f773781522) (2026-11-07),
[mesh2motion.org](https://mesh2motion.org/), the GitHub API, and Quaternius's pack page. The numbers in §5 were
measured by decoding the shipped GLB clips and running forward kinematics on them (scripts outside the repo, described
in §8). Claims that could not be checked against a primary source are marked **(unverified)**.*

**Question.** Mesh2Motion is an open-source tool that fits a template skeleton to a 3D model and applies a library of
animations to it. Can Pixel Studio use it, and how? Pixel Studio has 2D side-view figures (goose, human, dog), procedural
motion models and 16–64 px bakes. Specifically: can its clips drive our figures, can they serve as reference curves for
tuning our motion models, what would an import path cost, what else is worth borrowing, and what does the licence allow?

---

## 1. Summary

**What it is.** Mesh2Motion is a browser app written in TypeScript on three.js. It is MIT for code. The rigs and
animations are CC0. It has a single active maintainer, who commits almost daily, and there are no tagged releases. It ships
**326 animation clips on 9 skeletons** (human 234, fox 21, horse 14, dragon 12, spider 11, kaiju 10, bird 9, snake 8,
fish/shark 7) as meshopt-compressed GLB files with a JSON manifest.

**Fit.** The human and fox clips are already almost planar. Over a walk, jog or sprint the legs move less than 3° out of
the sagittal plane, so a 2D side projection is cheap and accurate. The bird rig is a reasonable donor for the goose's lower
legs and wingbeat. Its femur, though, is splayed 40–68° sideways and has to be folded into the body. The clips are
stylized and hand-keyed, not ground truth: the human walk bends the knee to 91° in swing. Treat them as *a second
opinion* and as a source of new motions (climbs, sits, emotes), not as a physics reference.

**Licence.** The animation data is CC0. Baked frames and derived keyframe JSON can be shipped without attribution, and
crediting is a courtesy. The only non-CC0 material is a set of **model variations** (meshes) under CC-BY / CC-BY-SA,
which we would not use.

Effort: **S** about 1–3 days, **M** about 1–2 weeks, **L** more than that.

| # | Option | What it would look like here | Value | Effort |
|---|---|---|---|---|
| 1 | **Reference-curve tooling** | An offline script decodes a clip, projects it onto the side plane, and prints or plots joint angles, duty factor, stride/leg, lift/leg and bob/leg next to the same numbers from our `generateMotion`. Used to tune `figures/*.json` presets | High | S |
| 2 | **`pixel import-motion`** for the human and dog figures (FK only) | GLB → `{frames, fps, loop, tracks: {bone: {rot: [...]}}}` for a named figure, through a bone map, resampled to our frame count. Gives one-shot gestures (wave, climb, sit-down, emotes) we have no model for | High | M |
| 3 | **Data-driven gait** (`registerMotion('clipGait')`) | Take the clip's *foot paths and hip height* (normalized by leg length) as targets and solve the legs with our own IK, so feet stay planted at our proportions. Arms and spine come from the projected clip | Medium–High | M |
| 4 | **Goose from the bird rig** | Map `LowerLeg → legNear`, `AnkleLeg → shinNear`, `Foot+Toes → footNear` and take Flap, Take_Off and Land as references for the goose's `flap`, `jump` and a future take-off. Wings need foreshortening, which our `sx`/`sy` only approximate | Medium | M |
| 5 | **Naming and taxonomy** | Adopt its folder-as-tag scheme and its `_RM` root-motion suffix convention for a growing motion library | Low–Medium | S |
| 6 | Ship Mesh2Motion clips verbatim (3D runtime) | Not applicable: we bake 2D frames and have no 3D runtime | — | — |

**Recommendation.** Do #1 now. It is a few hundred lines of throwaway tooling, and the measurements below already come
from a prototype of it. Do #2 when an agent asks for a gesture the motion models cannot make. Prototype #3 only if #1
shows our gait presets are visibly worse than the references.

---

## 2. What Mesh2Motion is

### 2.1 Repositories and ownership

- **The repository moved.** The task brief named `scottpetrovic/mesh2motion-app`. The GitHub API resolves that name to
  [`Mesh2Motion/mesh2motion-app`](https://github.com/Mesh2Motion/mesh2motion-app), an organization repository created
  2023-12-07 with about 3.7k stars and 376 forks (GitHub API, 2026-11-09).
- **Other repositories** in the [Mesh2Motion org](https://github.com/Mesh2Motion):
  - `mesh2motion-assets`: Blender sources, mocap, scripts; CC0-1.0.
  - `mesh2motion-web`: the marketing site; MIT.
  - `mesh2motion-desktop`: a desktop build; no licence detected.
  - `mesh2motion-godot`: MIT.
  - `mesh2motion-funding`.
- **Sites.** [mesh2motion.org](https://mesh2motion.org/) is the marketing site with news. [app.mesh2motion.org](https://app.mesh2motion.org/)
  is the app ([README L15–17](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/README.md)).
- **Its own positioning.** It is "kind of similar to a web application like Mixamo", but meant to support other model and
  skeleton types ([README L13](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/README.md)).

### 2.2 Licences: code and data differ

| What | Licence | Source |
|---|---|---|
| App code | MIT, © 2025 Scott Petrovic | [LICENSE-MIT.MD](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/LICENSE-MIT.MD) |
| "All 3d models, blend files, rigs, animations" in the app repo | CC0 1.0 | [LICENSE-CC0.MD](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/LICENSE-CC0.MD), [README L57–59](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/README.md) |
| Assets repository (Blender sources, BVH captures, scripts) | CC0 1.0 (full legal code) | [LICENSE](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/LICENSE) |
| Quaternius packs vendored in the assets repo | CC0 1.0 | [CC0-packs/Quaternius/License.txt](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/CC0-packs/Quaternius/License.txt) |
| Some **model variations** (meshes only) | CC-BY (Blender Studio's Jay, Sintel, Bunny; David Revoy's cat "Carrot") and CC-SA 4.0 (Tysan Tan's "Sophia"). Everything else defaults to CC0 | [RigConfig.ts L82–124, L213](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/RigConfig.ts) |

GitHub reports the app repository's licence as `NOASSERTION`. That is because it has two licence files, not because a
licence is missing.

### 2.3 Tech stack

- TypeScript, built with Vite, tested with Vitest. Runtime dependencies are `three` ^0.187, `@comfyorg/fbx-exporter-three`,
  `jszip`, `mediabunny` (preview videos) and `tippy.js`
  ([package.json](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/package.json)).
- It is deployed as a Cloudflare Worker with static assets. A small read-only JSON API lists the rigs and model variations
  ([API.md](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/API.md)).
  There is no animation endpoint yet; the doc suggests one as future work.
- Blender 5.0 is the authoring tool. Clips are exported by a Blender + Node pipeline that uses `@gltf-transform`
  and `meshoptimizer`
  ([export-to-app/README.md](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/python-scripts/export-to-app/README.md)).

### 2.4 Activity and maturity

- **Commits.** 921 commits in total. 79 commits since 2026-08-09. The latest push was 2026-11-07 (GitHub API).
- **Contributors.** `scottpetrovic` has 879 commits. The next contributors have 12, 10, 5, 4, 3, 2 and 1 commits
  (GitHub API). All 50 commits in our shallow clone are by Scott Petrovic.
- **Releases.** None: no GitHub releases and no tags. The version is `0.0.0` in `package.json`. Releases are announced as
  numbered "Updates" on [mesh2motion.org/news](https://mesh2motion.org/news):

  | Update | Date | Contents |
  |---|---|---|
  | 13 | 2026-09-25 | mirrored export, FBX for Unity/Unreal, 16 human clips |
  | 12 | 2026-08-02 | horse rig, desktop app, 40 human clips |
  | 11 | 2026-05-25 | |
  | 10 | 2026-04-04 | |
  | 9 | 2026-03-04 | |
  | 8 | 2026-01-22 | |

- **Since Update 13** (unreleased, in git): a remix/composer page that combines the upper half of one clip with the lower
  half of another (commit `4895b50`, [composer.ts](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/composer/composer.ts)),
  and Mixamo/humanoid import by retargeting (commit `1168413`).
- **Assessment.** Actively developed and well documented, with tests on the retargeting and weight code. It is a
  one-person project with no versioning. **Pin a commit** if we depend on its data.

---

## 3. How it works

### 3.1 Workflow

The README describes five steps
([L21–27](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/README.md)):

1. Import a model. The app accepts GLB, FBX, or a ZIP with GLTF+BIN or DAE ([create.html L55–73](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/create.html)).
2. Pick a skeleton type.
3. Move the template skeleton's joints to fit inside the mesh.
4. Compute skin weights, then preview the animations.
5. Select clips and export them.

**Auto-rigging is template fitting plus a geometric weight solver, not machine learning.** The site states that no LLMs
or AI APIs are used ([mesh2motion.org](https://mesh2motion.org/)). The weight pipeline is in
[SkinningAlgorithm.ts](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/solvers/SkinningAlgorithm.ts)
and runs in this order:

1. Each vertex goes to the closest bone, measured to the midpoint toward that bone's children, at 100% weight
   ([WeightCalculator.ts L11–15, L102](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/solvers/WeightCalculator.ts)).
   The hips are a special case: a ray is cast down from the pelvis to find the crotch gap.
2. Extremity correction.
3. Boundary smoothing.
4. Normalization.
5. Optional head and arm-plane corrections.

### 3.2 Skeleton templates

There are nine skeleton types: `human`, `fox`, `bird`, `dragon`, `kaiju`, `spider`, `snake`, `fish` and `horse`
([SkeletonType.ts](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/enums/SkeletonType.ts)).
The `fish` type loads the manifest key `shark`
([RigConfig.ts L170–180](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/RigConfig.ts)).
The human rig can also use four hand variants: all fingers, thumb + index, simplified, or a single bone.

The hierarchies below were read from each rig's `skeleton.glb`. All rigs are glTF Y-up, and the `root` node carries the
Blender Z-up correction.

- **human** (66 joints; Unreal-mannequin-style names):
  - spine: `root › pelvis › spine_01 › spine_02 › spine_03`
  - arms: `spine_03 › clavicle_l › upperarm_l › lowerarm_l › hand_l › {thumb,index,middle,ring,pinky}_01..04`
  - head: `spine_03 › neck_01 › head › head_leaf`
  - legs: `pelvis › thigh_l › calf_l › foot_l › ball_l › ball_leaf_l` (and the same for `_r`)
- **bird** (55 joints):
  - body: `root › hips › spine_0..3 › head › mouth_upper/mouth_lower(+_tip)`
  - wings: `spine_1 › wing_1_L › wing_2_L › wing_3_L › wing_4_L › wing_5_L › wing_tip_L`, plus four feather bones
    (`wing_feather_n_1/2_L`)
  - tail: `hips › tail_1..3 › tail_tip`
  - legs: `hips › UpperLeg_L › LowerLeg_L › AnkleLeg_L › Foot_L › Toes_L › Toes_tip_L` (anatomically: femur,
    tibiotarsus, tarsometatarsus, foot, toes)
- **fox** (53 joints):
  - hind legs: `hips › back_leg_pelvis_l › back_leg_upper_l › back_leg_lower_l › back_leg_ankle_l › back_leg_foot_l › back_leg_toe_l › back_leg_tip_l`
  - spine: `hips › spine_1 › spine_2 › spine_3`, with `chest` and `stomach` branches
  - forelegs: `spine_3 › front_leg_shoulder_l › front_leg_upper_l › front_leg_lower_l › front_leg_ankle_l › front_leg_foot_l › front_leg_tip_l`
  - neck and head: `spine_3 › spine_4 › spine_5 › head › nose` (with ears and mouth)
  - tail: `hips › tail_1..4 › tail_tip`
- **Variations.** The fox rig also drives "dog", "cat" and "panda" model variations
  ([RigConfig.ts L118–125](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/RigConfig.ts)).
  The fox skeleton is therefore the donor for our `dog` figure.

### 3.3 Animation conventions

These come from the animator guide
([ANIMATOR-README.md](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/ANIMATOR-README.md)):

- **Rotation-only keys** (L25), so clips survive meshes with different limb lengths.
- **Translation only on the hips** (L35). This is the "position tracking bone" in `RigConfig`: `pelvis` for the human,
  `hips` for most rigs, `head` for the snake.
- **No root motion** on `root` (L44–46): "Any root motion will be stripped out when Mesh2Motion loads an animation."
  Clips named `_RM` / `-rm` carry the travel on the hips instead, and the manifest flags them `root_motion: true`.
- **Frame rate.** 24 fps, except the horse and kaiju at 30 (manifest `fps`).
- **Clean-up on export.** On export a loop's repeated last frame is dropped and the clip is slid to start at 0. Keys that
  linear interpolation reproduces are removed. The data is compressed with `EXT_meshopt_compression` (16-bit quaternions,
  12-bit translations). The result is checked against Blender within 0.25° / 3 mm
  ([export-to-app/README.md L120–135](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/python-scripts/export-to-app/README.md)).

**Consequence for us.** The clips are meshopt-compressed. A plain glTF reader cannot decode them; we hit this in the
prototype (§8). A meshopt decoder is required:
- three.js's `meshopt_decoder.module.js`, as the app uses
  ([AnimationLoader.ts L2, L30](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/processes/animations-listing/AnimationLoader.ts)), or
- the `meshoptimizer` npm package (MIT; v1.3.0 includes a 472-line pure-JS `meshopt_decoder_reference.js`).

### 3.4 The animation library

The library is listed in [static/assets/manifest.json](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/static/assets/manifest.json).
Each entry has `name`, `file`, `hash`, `tags`, `loop`, `root_motion`, `frame_count`, `duration` and `source`. Frame counts
are in brackets; L = loop.

- **bird** (9): Hop[20 L], Death[41], Flap[14 L], Glide[14 L], Idle[29 L], Land[41], Rest Pose[9], Take_Off[33], Walk[11 L].
- **fox** (21): Bark, Bite, Death, Fall, Fetch, Flip, Howl, Idle Alert (L), Idle (L), Jump[52], Play Bow, Rest Pose,
  Run[14 L], Scratch_Ear, Shake_Off, Sit[40], Sleep (L), Sneak[39 L], Swim (L), Trot[16 L], Walk[23 L].
- **horse** (14, 30 fps): Death, Eating, Head_But, Idle, Kick, lay_to_idle, Rear, Rest_Pose, Run[14], Sleep, Trot[21],
  Turn_Left, Turn_Right, Walk[29].
- **dragon** (12): Attack, Death, Fire_Breath, Fly Flap (L), Fly Glide (L), Hurt, Idle (L), Land, Rest Pose, Roar,
  Take_Off, Walk (L).
- **kaiju** (10, 30 fps): Attack, Death, Hit, Idle, Rest Pose, Roar, Swim, Tail Attack, Walk, Walk RM.
- **spider** (11): Attack, Bite, Death, Death 2, Eating, Hit, Idle, Jump, Rest Pose, Threat, Walk.
- **snake** (8): Bite, Coiled, Dance, Death, Hit, Idle, Rest Pose, Side winding.
- **shark/fish** (7): Bite, Dead Floating, Hit, Idle, Rest Pose, Swim Horizontal (L), Swim Vertical (L).
- **human** (234). The folder tags give the categories: locomotion 55, combat 85 (melee 28, ranged 24, defense 11,
  unarmed 11), activities 25, idles 24, abilities 14, emotes 12, reactions 11, emotions 9, zombie 9. Relevant to us:
  - **Locomotion:** Walk[40 L], Walk_Relaxed, Walk_Happy, Walk_Stealth, Walk_Cautious, Walk_Injured, Walk_Backwards,
    Drunk Walk, Crouch_Walk, Jog[29 L], Sprint[20 L], Run_Anime, Run_Female, Run_Stealth.
  - **Jumps and falls:** Jump_2 / Jump_2_RM[41], Jump_Start / Jump_air / Jump_Land, Run Jump, Freefall,
    Fall_Tumbling, Land_Three_Point, Roll.
  - **Climbing:** Climb Ladder, Climb Wall, Pipe Climb, Ledge Hang, Ledge Climb Up.
  - **Sitting:** Sitting_Enter / Idle / Exit, Sit_Ground_Idle.
  - **Idles and emotes:** Crouch_Idle, Idle_A, Greeting, Head Nod, Clapping, Victory, Dizzy, Sleeping.

### 3.5 Where the keyframes come from

| Source | Evidence | Licence |
|---|---|---|
| **Hand-keyed in Blender** by the maintainer and contributors | The site says the animations are "hand-keyed" ([mesh2motion.org](https://mesh2motion.org/)). Each clip's `source` is a `.blend` in the assets repo | CC0 |
| **Quaternius** (humanoid rig and many human clips) | 87 human clips carry the tag `quaternius`, including Walk, Jog, Sprint, Idle_A, Crouch_Walk, Jump_Start/air/Land and Sitting_Idle. Tags come from folders plus a hand-set `m2m_tags` action property ([export-to-app/README.md L73–78](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/python-scripts/export-to-app/README.md)). The credits list "Quaternius: Base human model, rig, and animations" ([Generators.ts L28](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/Generators.ts)) | CC0 ([vendored License.txt](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/CC0-packs/Quaternius/License.txt); [Quaternius UAL page](https://quaternius.com/packs/universalanimationlibrary.html): "CC0", "Free to use in personal, educational and commercial projects") |
| **Motion capture (BVH)** | The assets repo has `motion-capture/raw captures/*.bvh`: cheering, fishing, golf, salute, turn-45/180 and others. These are retargeted with the Rokoko Blender plugin ([motion-capture/README.md](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/motion-capture/README.md)). Scripts mention Sony mocopi. **None of these are in the app manifest at `fd9fdeb`.** Who captured them is **unverified**; the mocopi scripts suggest the maintainer's own captures | CC0 (repo licence) |
| **KayKit, PSX low-poly packs** | `CC0-packs/Kaykit`, `CC0-packs/psx-lowpoly` (models) | Model variation entries default to CC0; their upstream licences were not checked **(unverified)** |
| **Mixamo** | Not shipped. Users can *import* Mixamo clips and retarget them onto the human rig at runtime ([index.html L164](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/index.html)) | Any Mixamo data a user brings is under Adobe's terms, not CC0. Not our concern unless we import such files |

One small inconsistency between sources: the site says nothing about motion capture, while the assets repo holds mocap
sources. This does not matter for us today, because the shipped clips are Blender-authored.

### 3.6 Formats and export

- **Import formats.** Models: GLB/GLTF, FBX, DAE (in a ZIP). Animations: GLB and FBX, with the Mesh2Motion rig names
  validated, or Mixamo/humanoid clips retargeted.
- **Retargeting.** "Swing-twist" retargeting, credited to Sketchpunklab
  ([HumanClipRetargeter.ts L14–21](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/retarget/human-retargeting/HumanClipRetargeter.ts)).
  Bones are mapped automatically by name: a tokenizer, category and slot mappers, and Mixamo and Rigify mappers
  (`src/retarget/bone-automap/`).
- **Export** ([DownloadSettings.ts](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/processes/export-to-file/DownloadSettings.ts),
  [StepExportToFile.ts](https://github.com/Mesh2Motion/mesh2motion-app/blob/fd9fdeb2ba214d210e8e4f28015c2a3c06cd8f5b/src/lib/processes/export-to-file/StepExportToFile.ts)):
  - **Format:** GLB through three.js `GLTFExporter`, or FBX with Unreal or Unity presets.
  - **Contents:** full (mesh + skeleton + clips) or skeleton only.
  - **Bone naming:** default or Mixamo.
  - **Mirroring:** each clip can be exported plain, mirrored, or both (L26–38).
- **Not available:** BVH export and any 2D or JSON keyframe export.

---

## 4. How its data meets Pixel Studio's model

Pixel Studio and Mesh2Motion represent motion differently. The table shows the conversions an importer would need.

| Mesh2Motion | Pixel Studio ([SPEC.md](../SPEC.md), [figures.md](../figures.md)) | Conversion |
|---|---|---|
| 3D local quaternion per bone, 24/30 fps, linear | 2D `rot` in degrees, clockwise, *added to the rest pose*, relative to the parent; `frames` 1..64; arrays with exactly `frames` entries give one value per frame | FK in 3D, then project each bone's world segment onto the side plane. The local angle is `atan2` of the child segment minus the parent's, minus the rest offset |
| Hips translation (Y-up, metres) | Root `x`, `y` tracks (units, y down) | Scale by the ratio of our leg length to theirs (human: hip→ankle 37.1 units vs 0.84 m). Flip y |
| `root_motion` clips travel on the hips | Motions are "on a treadmill"; travel is exported as `speed` | Subtract the hips' mean forward velocity and report it as `speed` |
| Left/right limbs | `Near`/`Far` limbs | For a figure facing right (+x), the viewer sees the character's **right** side. So `_r` → `Near`, `_l` → `Far` |
| Many bones (fingers, clavicles, three spine bones) | 16 bones (human), 13 (goose), 23 (dog) | Collapse chains: our `spine` = pelvis→spine_03 segment, `neck` = neck_01→head, hand = hand→middle_01 |
| Rotation-only keys, limbs that keep their length | Rigid 2D parts | Projected lengths change. Use angles only and keep our bone lengths |

**Bone maps** (proposal):

- **human:**
  - `hips` ← pelvis
  - `spine` ← pelvis→spine_03
  - `neck` ← spine_03→neck_01→head
  - `head` ← head→head_leaf
  - `armNear` ← upperarm_r, `forearmNear` ← lowerarm_r, `handNear` ← hand_r
  - `thighNear` ← thigh_r, `shinNear` ← calf_r, `footNear` ← foot_r→ball_leaf_r (the foot tip is our planted point)
  - the `Far` copies ← the `_l` bones
- **dog ← fox:**
  - hind leg: `thighHind*` ← back_leg_upper, `shinHind*` ← back_leg_lower, `hockHind*` ← back_leg_ankle,
    `pawHind*` ← back_leg_foot→tip
  - foreleg: `armFore*` ← front_leg_upper, `forearmFore*` ← front_leg_lower, `pasternFore*` ← front_leg_ankle,
    `pawFore*` ← front_leg_foot→tip
  - `body` ← hips→spine_3, `neck` ← spine_3→spine_5, `head` ← head→nose, `tail`/`tail2` ← tail_1/tail_3
- **goose ← bird:**
  - `body` ← hips→spine_1
  - `legNear` ← LowerLeg_R, `shinNear` ← AnkleLeg_R, `footNear` ← Foot_R→Toes_tip_R
  - `neck` ← spine_2, `neckUp` ← spine_3, `head` ← head→mouth_upper_tip, `jaw` ← mouth_lower
  - `wing` ← wing_1..wing_tip (projected overall direction)
  - `tail` ← tail_1→tail_tip
  - `UpperLeg` (femur) is dropped: it is hidden inside the body.

**Check the per-joint conventions before relying on these maps.** The dog figure's hind `thigh/shin/hock` and the fox's
`upper/lower/ankle` may not be anatomically one-to-one. Our dog's knee points forward and its hock backward
([figures/dog.json](../../figures/dog.json) description). In the fox clips the `upper–lower` joint is always flexed 59–150°
in one direction (§5), which matches a stifle, but this should be checked visually in the PoC.

---

## 5. Measurements: how planar are the clips, and how do they compare with our presets?

### 5.1 How the numbers were made

- Each GLB was decoded (meshopt) and forward kinematics was run on it, sampled at the rig's fps.
- **Axes.** The lateral axis comes from the left and right hip joints in the rest pose. "Forward" is perpendicular to it
  in the ground plane.
- **Angles.** Segment angles are measured from straight down, positive forward. That is the same convention as our screen
  angles for a right-facing figure.
- **Contacts.** A foot is in contact when its toe or ball is within 4% of leg length of the clip's lowest foot point.
- **Leg length.** Hip to ankle: human 0.84, fox 1.00, bird 0.58 (model units).
- **Our side.** Pixel Studio numbers come from `generateMotion` through the public API (`resolveSpec` + `compile` +
  `samplePoseAt`) on the bare figures.

### 5.2 Out-of-plane motion

The table gives the range of each segment's lateral angle over the clip, in degrees. 0 means the segment lies exactly in
the side plane.

| clip | thigh / upper leg | shin / calf | foot | upper arm | forearm | spine / neck |
|---|---|---|---|---|---|---|
| human Walk | −3..2 | −2..2 | 0..2 | −23..−6 | −9..−2 | ±5 |
| human Jog | −1..2 | −2..1 | −8..8 | −42..−3 | −39..28 | −24..22 (neck) |
| human Sprint | −1..2 | −2..1 | −11..8 | −37..−14 | −37..16 | −17..15 (neck) |
| human Jump_2 | −11..4 | −4..7 | −15..4 | −49..−15 | −32..−1 | 0..2 |
| fox Walk (near legs) | −2..2 | −2..1 | −1..2 | — | — | ±3 |
| fox Trot | −2..8 | −1..8 | −2..7 | — | — | ±1 |
| bird Walk | **39..68 (femur)** | 8..13 | −3..2 | — | — | ±7 |
| bird Flap (wing_1) | — | — | — | **9..82** | — | 0 |

- **Legs are effectively planar** in human and fox locomotion. Projection error for a 3° segment is
  `1 − cos 3° ≈ 0.14%` of its length, far below a pixel at 64 px.
- **Arms are not planar.** They hang 6–23° out to the side in a walk and up to 42° in a run. Projected, they look a bit
  shorter, and the arm's sagittal swing angle is still well defined.
- **The bird's femur is splayed 40–68° sideways**, so it cannot be projected. Drop it, as noted in §4.
- **Wings flap in the frontal plane.** A side view sees a wing that rises above the back and shortens. Our goose `wing` is
  one rigid bone. `sx`/`sy` scale in the part's rest axes, before rotation
  ([rig.js `localMatrix`](../../src/core/rig.js)), so they can only foreshorten along the bone if the bone lies along an
  axis at rest. The goose wing is about 10° off horizontal, so this is close enough.

### 5.3 Gait numbers against our presets

| | human Walk (M2M) | `human.walk` (ours) | human Jog / Sprint (M2M) | `human.run` (ours) |
|---|---|---|---|---|
| cycle | 1.63 s (40 fr @ 24) | 1.0 s (8 fr @ 8) | 1.17 s / 0.79 s | 0.67 s (8 @ 12) |
| duty (stance fraction) | 0.53 | 0.60 | 0.17 / 0.15–0.25 | 0.38 |
| stance sweep ÷ leg length | 0.76 | 0.70 (26 / 37.1) | 0.94 / 0.71–1.19 | 0.70 |
| toe lift ÷ leg | 0.15 | 0.13 (5 / 37.1) | 0.43 / 0.29–0.36 | 0.35 (13 / 37.1) |
| hip bob ÷ leg | 0.062 | 0.054 (measured) | 0.29 / 0.17 | 0.075 (measured) |
| knee flexion range (thigh − shin) | 13..91° | 11..60° | 12..128° / 10..116° | 28..108° |
| thigh angle range (+ = forward) | −20..48° | −6..34° | −40..79° / −35..68° | −1..33° |
| ankle (shin − foot) range | −83..−36° | −97..−44° | −92..−44° | −129..−53° |
| upper-arm swing | −25..9° | −24..16° | −79..6° / −81..−11° | −45..19° |

| | fox Walk | `dog.walk` | fox Trot | `dog.trot` |
|---|---|---|---|---|
| cycle | 0.92 s (23 fr) | 1.0 s | 0.63 s (16 fr) | 0.67 s |
| duty (hind / fore) | 0.52–0.57 / 0.61–0.70 | 0.65 | 0.62–0.69 | 0.45 |
| hind stifle range (upper − lower) | 59..105° | 44..90° | 73..114° | 33..95° |

| | bird Walk | `goose.walk` |
|---|---|---|
| cycle | 0.42 s (11 fr) | 0.8 s (8 @ 10) |
| duty | 0.55–0.64 | 0.62 |
| stance sweep ÷ leg | 0.86 | — |
| intertarsal joint (LowerLeg − AnkleLeg vs legNear − shinNear) | −101..−41° | −115..−28° |
| hip bob | 0 (the bird walk has no hip translation) | measured 2.3 units (0.07 of leg) |

### 5.4 What the numbers say

- **Our human walk is close on the quantities that set the look.** Stride/leg, lift/leg and bob/leg differ by less than
  15%. The differences are elsewhere:
  - The reference swings with more hip flexion (48° vs 34°) and much more knee flexion (91° vs 60°). The 91° is a
    stylized, high-stepping swing.
  - The reference walk is slow: 1.63 s per cycle, about 0.88 leg lengths per second, against our 1.17.
- **Our run differs most.** The keyed Jog and Sprint have much shorter contact (duty 0.15–0.25 vs our 0.38), more knee
  fold, a higher heel, and the arms held forward (upper arm −79..6°). These are good targets for `human.run`: lower
  `duty`, raise `lift`, and bias `armSwing` forward. The `run` preset bends the elbow (`elbow: 75`) more than the reference
  does.
- **Fox trot vs our dog trot.** The keyed trot has longer stance (duty about 0.65) than ours (0.45). Our trot has a
  flight phase; theirs does not.
- **Contact detection was the weakest part of the prototype.** Keyed clips do not share a perfect ground plane: the fox's
  lowest paw heights differ by up to 3 cm per leg. The fox gallop (`Run`) gave a hind-foot duty of 0.07 with the global
  threshold. A real tool needs a per-leg floor, and contact should require low height *and* low velocity.
- **Footfall order in the fox walk is lateral-sequence-like.** Touchdown phases relative to the hind-right foot: fore-right
  0.26, hind-left 0.57, fore-left 0.61. Ours: 0.25 / 0.5 / 0.75. The fore-left value looks off and may be a threshold
  artefact. Check it visually.

---

## 6. Fit for Pixel Studio, point by point

### a. Driving our 2D side-view figures from its clips

- **Projection.** Run 3D FK, then take `atan2(fwd, −up)` of each mapped segment, then convert to parent-relative angles
  and subtract our rest pose. As shown in §5.2, this is accurate for the legs and spine of human and fox locomotion.
- **Resampling.** Their clips are 24/30 fps with 10–234 frames. Ours are 4–14 fps with ≤ 64 frames. For loops, resample
  over the full period (the export drops the repeated last frame) to `frames` evenly spaced samples. Use quaternion slerp
  before projecting, not angle lerp after it, to avoid wrap jumps at ±180°. Pick `fps` to keep the original tempo:
  Walk at 8 frames → 4.9 fps.
- **Proportions break planted feet.** Rotation-only clips reproduce *angles*, not foot positions. Our human's
  thigh:shin ratio is 20:17 against their 0.407:0.433. The goose's legs are shorter still. FK playback of the angles
  therefore makes the planted foot slide. Two options:
  - accept it (fine for in-place gestures), or
  - re-plant with our IK, which is option #3.
- **Out-of-plane motion breaks.** These need `sx`/`sy` foreshortening or a front-view figure:
  - Strafes, Turn_Left/Right (horse), Spin_Death.
  - Most combat swings and dances.
  - Wing beats.
- **Root motion.** `_RM` clips translate the hips (the hips in Jump_2_RM rise about 1.8 m, about 2.1 leg lengths). Our jump is in place by default,
  with the page moving the sprite (`height: 0`). Prefer the in-place variant, or subtract the arc and export it as events
  or speed.
- **Foot contacts.** Contacts are not in the data. They must be detected (§5.4) to emit our `footstep` events.

### b. Reference curves for tuning our motion models

This is the strongest use.
- §5.3 already shows actionable deltas (run duty, knee fold, arm bias).
- A small script that prints the same metric table for any clip and any of our motions makes preset tuning measurable
  instead of by eye.
- Two caveats:
  - The clips are stylized animation, not biomechanics. Mesh2Motion's README asks for funds to hire "a better animator".
  - Use them as one reference among several.

### c. An import path

- **Command.** `pixel import-motion clip.glb --figure human [--map map.json] [--frames 8] [--fps auto] [--name wave] [--side right]`
  prints an animation object:

  ```json
  {"wave": {"frames": 12, "fps": 6, "loop": false, "tracks": {"armNear": {"rot": [...]}, "forearmNear": {"rot": [...]}}}}
  ```

  Every value is per frame. This is a normal hand-keyed animation, so lint, `where`, follow-through and bundles all work
  unchanged.
- **Planted feet.** Pass `--motion pose` to emit tracks for a `pose` motion instead. Root tracks are applied before the
  legs are solved, so the feet stay planted while the clip drives the body and arms ([figures.md](../figures.md),
  "Your tracks on top of a motion").
- **Zero-dependency constraint.** The engine has no dependencies (`package.json`). Keep the decoder out of `src/core`.
  Either:
  - vendor the MIT pure-JS reference meshopt decoder (about 470 lines) into a CLI-only module, or
  - have the importer accept *uncompressed* glTF and document a one-time `gltf-transform` decompression step.
    `gltf-transform` was not tested here.
- **Bone maps.** Bone maps per figure live in `figures/<name>.json` under a new optional `retarget` key, or in a separate
  `figures/maps/` file. The human, dog and goose maps in §4 are the starting point.

### d. Other things worth borrowing

- **Folder-as-tag taxonomy and an `_RM` suffix** for the motion library
  ([export README L73–78](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/python-scripts/export-to-app/README.md)).
  Our `pixel figures` could group motions as locomotion / idles / page (jump, fall, sit, duck, peek, climb) / emotes.
- **Mirrored export** (plain / mirrored / both). We get a mirrored sheet for free with `--flip`. Their per-clip choice is
  the useful idea for asymmetric gestures, such as a right-handed wave.
- **Composer: upper half of clip A plus lower half of clip B.** This maps directly onto our model: the `gait` lower body
  plus an imported or `pose` upper body. A spec-level form could be `{"motion": "walk", "upper": "wave"}`.
- **Bone auto-mapping by name tokens** (`BoneNameTokenizer`, `BoneCategoryMapper`). If we accept other people's rigs
  later, this approach makes `--map` optional.
- **The bird rig as a goose reference.** Its `Flap`, `Take_Off`, `Land` and `Hop` cover moves the goose lacks (take-off,
  landing, hop) or fakes with `pose` tracks (`flap`). Its head is held still while walking (head lateral ±3°), consistent
  with our `head.hold`.
- **Rotation-only authoring rule.** Rotation-only keys with translation on a single hips bone are the same constraint our
  figures already obey. This is the main reason the data transfers at all.

---

## 7. Licensing constraints on reusing the data

- **The animation data we would use is CC0 1.0:** the human, fox and bird clips, the skeleton GLBs, and the Blender
  sources.
  - CC0 waives copyright and related rights "to the greatest extent permitted by applicable law", with a fallback public
    licence where a waiver is not possible
    ([CC0 legal code in the assets repo](https://github.com/Mesh2Motion/mesh2motion-assets/blob/dc2eb3cf06ba0aaeb0c651503d5667f773781522/LICENSE)).
  - Baking the frames into our sprite sheets, shipping derived keyframe JSON in `figures/` or in examples, and
    redistributing the decoded clips are all allowed. This includes commercial use and use under our MIT licence.
  - Attribution is not required. We should still credit Mesh2Motion and, for the `quaternius`-tagged clips, Quaternius,
    as both ask.
- **Quaternius-derived human clips are also CC0** at the source ([UAL page](https://quaternius.com/packs/universalanimationlibrary.html);
  vendored `License.txt`).
  - The UAL page has "Standard", "Pro" and paid "Source" tiers. It says Pro is "still free to use in personal,
    educational and commercial projects" but does not restate the licence for the Pro or Source tiers.
  - Which tier each Mesh2Motion clip came from is **unverified**. Mesh2Motion redistributes them under its CC0 statement.
  - If this matters, re-derive from Quaternius's Standard tier, or ask.
- **CC0 covers copyright only.** It does not grant trademark or patent rights; CC0 §4(a) states this. That has no
  practical effect for motion data.
- **Avoid the CC-BY and CC-BY-SA model variations** (Jay, Sintel, Bunny, Carrot, Sophia). We only need skeletons and
  clips, never meshes.
- **Mixamo.** Any clip a user retargets from Mixamo inside Mesh2Motion carries Adobe's terms, not CC0. An importer should
  not imply that every GLB is CC0. Record the source and licence in the generated animation, for example a
  `"source": {...}` note in the spec. A field for this does not exist yet.
- **Code reuse** (the retargeter, the bone mapper) is MIT. Keep the copyright notice if we copy code.

---

## 8. Proof-of-concept plan

The measurements in §5 came from a throwaway prototype:
1. A Node script decodes meshopt with the `meshoptimizer` package into plain JSON.
2. A Python FK and projection script computes the metrics.
3. A Node script samples our figures through `src/core/index.js`.

Nothing was added to the repository. The PoC below turns that into something reviewable.

**Step 1: reference tooling (S, about 2 days).**
- Write `scripts/m2m-reference.mjs <clip.glb> --rig human|fox|bird` that prints:
  - per-joint side-plane angle curves, resampled to 16 samples per cycle;
  - lateral-angle ranges;
  - duty, stride/leg, lift/leg and bob/leg;
  - footfall phases.
- Add `--ours <figure> <motion>` to print the same table for our motion, and an SVG overlay of the two curves.
- Pin the clips to commit `fd9fdeb` and download them on demand. Do not vendor them yet.

**Step 2: import one gesture (M, about 1 week).**
- Write `pixel import-motion` for the human figure only, FK only, with the §4 bone map.
- Targets:
  - `Greeting` (wave) and `Sitting_Enter` as one-shots;
  - `Walk` as a loop, as a stress test for foot sliding.

**Step 3: optional data-driven gait (M).**
- A `registerMotion('clipGait')` that takes foot-path and hip-height curves from step 1 and solves them with our IK.
- Compare it with `human.walk` and with FK-imported `Walk`.

**What to measure.**

| Metric | How | Pass |
|---|---|---|
| Projection fidelity | Our FK of the imported tracks vs their projected joint positions, at rest proportions (scale their skeleton to ours first) | ≤ 0.5 px at 64 px for legs and spine |
| Foot slide (FK import) | Planted-toe drift over stance in units, from `pixel where --part footNear --point <tip>` per frame | Report it. Expect several units for Walk; that is the reason for step 3 |
| Foot slide (clipGait) | Same | ≤ 0.3 units (what our validator calls a miss) |
| Readability | Contact sheet at 16, 32 and 64 px (`pixel preview`) next to `human.walk`; a blind A/B by two people | The import is not worse at 32 and 64 px |
| Bake budget | Frames per clip after resampling, and bundle size delta | Within existing limits: ≤ 64 frames, and bundle growth in line with any other animation |
| Preset tuning value | Change `human.run` per the §5.4 deltas, re-run the table | Duty and knee fold move toward the reference without validator warnings |

**Success.**
- Step 1 succeeds if it changes at least one shipped preset for a measured reason.
- Step 2 succeeds if an agent can get a recognizable wave or sit-down onto a `human`-based character with one command,
  with no hand-keying, and it passes `pixel validate`.

**Kill criteria.**
- More than 1 px projection error, or clips that need per-clip hand fixes.
- If stylization dominates (as the 91° walk knee suggests), keep only step 1.

---

## 9. Could not be verified

- Who recorded the BVH captures in `motion-capture/raw captures/`, and under what terms they were made. They are covered
  by the repo's CC0 file. None ship in the app at `fd9fdeb`.
- Which Quaternius tier (Standard or Pro) each `quaternius`-tagged clip came from. The licence statement for the Pro and
  Source tiers is not restated on the Quaternius page.
- The upstream licences of the KayKit and PSX-low-poly *model* packs vendored in the assets repo. These are not needed
  for our use.
- Whether `gltf-transform` can strip `EXT_meshopt_compression` in one CLI step (not tested here).
- The anatomical correspondence of the fox's hind `upper/lower/ankle` bones to our dog's `thigh/shin/hock`, beyond the
  joint-range evidence in §5.3.
