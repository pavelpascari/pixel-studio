# Motion data, tools and libraries: what passes a "free, no strings" licence test

*Research date: 2026-11-09. Primary sources only: each project's own licence file, terms of use, EULA, plan page or
dataset record (Dryad, Zenodo, Figshare, Edmond and Harvard Dataverse records read through their APIs), plus package
metadata from the npm registry and the GitHub API. Clauses that decide a verdict are quoted. Anything that could not be
checked against a primary source is marked **(unverified)** and collected in the last section. This report builds on
[mesh2motion.md](mesh2motion.md), which covers Mesh2Motion (MIT code, CC0 clips), its planarity measurements and the
`pixel import-motion` plan. That material is not repeated here. This is a reading of licence texts, not legal advice.*

**Question.** Which motion sources, tools and libraries can Pixel Studio use if the rule is "only free, no-strings
software and data"? MIT, BSD, ISC, Apache-2.0, CC0 and public domain pass. CC-BY passes only if flagged
**attribution required**. Anything that is paid, a subscription, account-gated under restrictive terms, non-commercial
(NC), no-derivatives (ND), share-alike applied to data we would ship, or "free" under a vendor EULA that limits
redistribution, fails. Three cases are judged differently:
- **(a) Tool:** something we run, whose output we own.
- **(b) Library:** something we bundle or depend on. It must be permissive.
- **(c) Data:** something we derive keyframes from and ship baked. The data's licence governs.

---

## Verdicts at a glance

Verdicts: **OK** means no conditions. **OK + attribution** means CC-BY, so credit must ship with derived data.
**Conditional** means free, but with a non-licence condition (named in the row). **Tool-only OK** means fine to run;
nothing of it ships. **Fails** means it breaks the constraint.

### The owner's shortlist

| Name | Kind | Licence / terms | Verdict | Deciding clause |
|---|---|---|---|---|
| ActorCore (Reallusion) | data | Reallusion Content EULA (paid store content) | **Fails** | "You may NOT import, upload, reproduce, make available, publish, transmit, distribute, or sublicense the Content to any third party." Integration into a creation tool and AI/ML use are also prohibited. [EULA §2.1 Restrictions (B), (C)](https://www.reallusion.com/Content/EULA/EULA.htm) |
| Mixamo (Adobe) | data | Adobe General Terms §3.6 + Mixamo Additional Terms; Adobe ID required | **Fails** for shipped data | Personal, non-sublicensable licence; "under no circumstances can you distribute the Content Files on a stand-alone basis, outside of the End Use". [Adobe General Terms §3.6](https://www.adobe.com/legal/terms.html). Also an AI/ML ban: [Mixamo Additional Terms](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf) |
| Rokoko Motion Library | data | Rokoko Studio & Vision Terms v2.0.1; account required | **Fails** | "The license to each Rokoko Asset is limited to the period in which you have an Account." [Terms §5.1](https://www.rokoko.com/studio-term-of-use); no distribution or sublicensing (§5.3) |
| 3D-POP (pigeons) | data (+ MIT reader code) | **CC BY 4.0** (dataset), MIT (repo) | **OK + attribution**, low value | Edmond record licence `CC-BY-4.0` ([doi:10.17617/3.HPBBC7](https://doi.org/10.17617/3.HPBBC7)). Only head and torso keypoints; no legs, no wings |
| Cascadeur | tool | Free / Indie / Pro plans | **Fails** | Free: "Export to .casc format only… Only non-commercial use". Indie is paid and capped at "$100,000 per year". [cascadeur.com/plans](https://cascadeur.com/plans) |
| Blender, including Grease Pencil | tool | GPL | **Tool-only OK** | "What you create with Blender is your sole property." [blender.org/about/license](https://www.blender.org/about/license/). Published `bpy` scripts must use a GPL-compatible licence; MIT is compatible |
| Adobe Character Animator | tool | Starter free; full features need Creative Cloud Pro | **Fails** | Pro features come in "the Creative Cloud Pro plan", 77.99 €/mo shown. [Product page](https://www.adobe.com/products/character-animator.html). It outputs puppet video, not skeletal data |
| Spine 2D | tool (+ runtimes) | Paid Spine Editor Licence | **Fails** | The trial is "exclusively for the purposes of testing and evaluating", and runtimes need a paid licence. [Spine Editor License §1.4, §2](https://esotericsoftware.com/spine-editor-license) |
| Live2D Cubism | tool (+ SDK) | Proprietary; FREE version has a revenue gate | **Fails** | "Only General Users and Small-Scale Enterprises (annual sales less than 10 million yen) may use the FREE version for commercial purposes." [Comparison page](https://www.live2d.com/en/cubism/comparison/) |

### Alternatives found

| Name | Kind | Licence / terms | Verdict | Deciding clause |
|---|---|---|---|---|
| Mesh2Motion clips (human, fox, horse, bird) | data | CC0 1.0 | **OK** | See [mesh2motion.md §7](mesh2motion.md#7-licensing-constraints-on-reusing-the-data) |
| Quaternius Universal Animation Library (120+ humanoid clips) | data | CC0 | **OK** | "All models are under the CC0 License." [FAQ](https://quaternius.com/faq.html); [pack page](https://quaternius.com/packs/universalanimationlibrary.html) |
| Quaternius Ultimate Animated Animal Pack (12 animals incl. fox, husky, shiba, wolf, horse) | data | CC0 | **OK** | [Pack page](https://quaternius.com/packs/ultimateanimatedanimals.html): "free to use in personal and commercial projects" |
| Kenney animated characters | data | CC0 | **OK** (small) | "all game assets on the asset pages are public domain licensed (CC0)". [kenney.nl/support](https://kenney.nl/support) |
| CMU Graphics Lab Motion Capture Database | data | No formal licence; site terms | **Conditional**: no resale | "may be copied, modified, or redistributed without permission" ([FAQ](http://mocap.cs.cmu.edu/faqs.php)), but "you may not resell this data directly, even in converted form" ([home](http://mocap.cs.cmu.edu/)) |
| 100STYLE (Mason, Starke, Komura) | data | CC BY 4.0 | **OK + attribution** | [Zenodo record 8127870](https://zenodo.org/records/8127870), licence `cc-by-4.0` |
| ACCAD Open Motion Project | data | CC BY 3.0 | **OK + attribution** | "licensed under a Creative Commons Attribution 3.0 Unported License". [ACCAD mocap page](https://accad.osu.edu/research/motion-lab/mocap-system-and-data) |
| Environment-aware Motion Matching data | data | CC BY 4.0 | **OK + attribution** | [Zenodo record 17220516](https://zenodo.org/records/17220516) |
| Fukuchi et al. walking kinematics (lower limb) | data | CC BY 4.0 | **OK + attribution** | [Figshare 5722711](https://figshare.com/articles/dataset/A_public_data_set_of_overground_and_treadmill_walking_kinematics_and_kinetics_of_healthy_individuals/5722711) |
| Dryad avian kinematics datasets (§3) | data | CC0 (Dryad requires it) | **OK** | "Dryad does not accept any files with licensing terms that are incompatible with the Creative Commons Zero waiver." [Dryad requirements](https://datadryad.org/requirements) |
| Published numbers from papers (wingbeat frequency, duty factor…) | facts | not copyrightable (US) | **OK** | Copyright does not "extend to any idea, procedure, process, system, method of operation, concept, principle, or discovery". [17 U.S.C. §102(b)](https://www.law.cornell.edu/uscode/text/17/102) |
| Bandai Namco Research Motion Dataset | data | CC BY-NC 4.0 | **Fails** (NC) | [README, License](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset#license) |
| Ubisoft LaFAN1 | data | CC BY-NC-ND 4.0 | **Fails** (NC, ND) | [README L8 + license.txt](https://github.com/ubisoft/ubisoft-laforge-animation-dataset) |
| orangeduck Motion-Matching sample | code MIT, data LaFAN1 | MIT / CC BY-NC-ND | **Fails** for the data | "this dataset… is licensed under… NonCommercial-NoDerivatives… (unlike the code, which is licensed under MIT)". [README L25](https://github.com/orangeduck/Motion-Matching) |
| AMASS | data | Non-commercial research licence; registration | **Fails** | "Any other use, in particular any use for commercial purposes, is prohibited." [AMASS licence](https://amass.is.tue.mpg.de/license.html) |
| SFU Motion Capture Database | data | Site terms | **Fails** | "The data cannot be used for commercial products or resale". [mocap.cs.sfu.ca](http://mocap.cs.sfu.ca/) |
| Truebones free packs | data | No licence text found | **Fails** (unverifiable) | The Gumroad pages read show no licence text (§7) |
| AI4Animation dog mocap (MANN) | data | CC BY-NC 4.0 | **Fails** | "not freely available for commercial use or redistribution". [AI4Animation README](https://github.com/sebastianstarke/AI4Animation) |
| RGBD-Dog | data | Academic release form | **Fails** | "This data is available for academic use." [README, Access](https://github.com/CAMERA-Bath/RGBD-Dog) |
| PFERD (horse mocap) | data | Non-commercial research licence | **Fails** | "non-commercial scientific research purposes". [Dataverse terms, doi:10.7910/DVN/2EXONE](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/2EXONE) |
| AcinoSet (cheetah 3D) | data | No licence in repo | **Fails** (unverifiable) | GitHub API reports no licence for [African-Robotics-Unit/AcinoSet](https://github.com/African-Robotics-Unit/AcinoSet) |
| OpenSim core | tool / library | Apache-2.0 | **OK** (the tool) | [opensim-core](https://github.com/opensim-org/opensim-core). Licences of individual OpenSim/SimTK datasets were not checked |
| three.js (GLTFLoader, BVHLoader, FBXLoader, SkeletonUtils) | library | MIT | **OK** | [three.js](https://github.com/mrdoob/three.js), npm `three` 0.187.0 |
| @gltf-transform/core | library | MIT | **OK** | npm 4.5.1 (2026-09-28) |
| meshoptimizer (JS decoder) | library | MIT | **OK** | npm 1.3.0 (2026-09-25), 0 dependencies |
| ufbx (C FBX reader) | library | MIT **or** Unlicense | **OK** | "available under 2 licenses -- choose whichever you prefer". [LICENSE](https://github.com/ufbx/ufbx/blob/master/LICENSE) |
| fbx-parser (npm) | library | MIT | **OK**, stale | Last publish 2021-02-12 |
| bvh-parser / bvh (npm) | library | MIT (npm metadata) | **Don't use** | Last publishes 2018. Tested in [mit-libraries.md](mit-libraries.md): `bvh-parser`/`parse-bvh` drop the X of every joint offset, and npm `bvh` is a 3D-geometry library, not a mocap parser |
| closed-chain-ik | library | Apache-2.0 | **OK**, not needed | npm 0.0.3 (2023); repo active |
| ezc3d (C3D reader, C++/Python) | tool | MIT | **OK** | [pyomeca/ezc3d](https://github.com/pyomeca/ezc3d) |

---

## What to use, ranked

1. **CC0 game-animation clips, as the main source of shippable keyframes.**
   - [Mesh2Motion](mesh2motion.md): human, fox, horse and bird.
   - Quaternius Universal Animation Library: humanoid.
   - Quaternius Ultimate Animated Animal Pack: dog-like quadrupeds (shiba, husky, wolf, fox).
   - Kenney: a few humanoid clips.

   No conditions, and they arrive as glTF/FBX skeletons that our importer plan already targets. They are stylized, not
   measured: use them as motion vocabulary, not as ground truth.
2. **CC0 research kinematics from Dryad, as references for the goose (§3).** Use them to tune the `walk`, `flap` and
   `jump` presets, and a future take-off and landing, not to drive frames directly:
   - guineafowl treadmill walking (joint kinematics, CSV);
   - quail X-ray locomotion;
   - flycatcher escape take-offs;
   - dove take-off wing surfaces;
   - parrotlet landings.
3. **CC BY human mocap, when a clip is worth crediting.**
   - 100STYLE (BVH, about 4 M frames of styled locomotion);
   - the ACCAD Open Motion Project;
   - the Environment-aware Motion Matching data;
   - the Fukuchi walking dataset (lower-limb references).

   Each needs an attribution line shipped next to anything derived from it (§6).
4. **CMU, for measurement only.** Using CMU to *measure* and tune our presets ships nothing of CMU's. Shipping keyframes
   derived from CMU under our MIT licence is risky, because MIT lets downstream users sell copies and CMU forbids resale
   "even in converted form".
5. **Everything else on the shortlist fails** as a data source: ActorCore, Mixamo, Rokoko, Truebones, Bandai Namco,
   LaFAN1, AMASS, SFU, and the AI4Animation, RGBD-Dog and PFERD animal sets. Among the shortlisted tools, only Blender
   passes, and only as an offline tool.

**Pipeline libraries.**
- **Keep `src/core` dependency-free.** The importer is a dev-time CLI.
- **glTF/GLB (the main path):** `meshoptimizer`'s decoder (MIT, 0 dependencies) plus our own GLB chunk reader. Use
  `@gltf-transform/core` (MIT) if we want a full document model.
- **BVH:** write our own parser of about 150 lines. The format is a plain-text hierarchy plus channel rows. three.js's
  `BVHLoader.js` (MIT, 486 lines) is the reference. The npm BVH packages are unmaintained.
- **FBX:** do not parse FBX in-repo. Convert offline in Blender (tool-only), or use `ufbx` (MIT/Unlicense) if a native
  reader is ever needed.
- **IK and retargeting:** keep our own `ccd` in `src/core/rig.js` and a per-figure bone map.

---

## 1. The owner's shortlist, one by one

### 1.1 ActorCore (Reallusion): Fails

- **The content EULA covers ActorCore.** The Reallusion Content EULA, "Updated November 1st, 2026", defines "Reallusion's
  Stores" as "the Reallusion Content Store, Marketplace and ActorCore" (§1.5). It covers "motions" (§1.1)
  ([EULA](https://www.reallusion.com/Content/EULA/EULA.htm)).
- **Embedding is allowed only in a locked-down form.** The Standard License lets you embed content in games and apps only
  "provided that the Content is fully integrated, compiled, or packaged into the final application such that the
  underlying Content cannot be accessed, extracted, or used as standalone assets by end-users" (§2.1(B)). §6.3 adds that
  content "must be packaged in proprietary, compiled, or encrypted formats".
  - Our figures ship as readable JSON in an MIT repository, and sprite bundles are open PNG + JSON. That is the opposite
    of what §6.3 requires.
- **Three restrictions apply to us directly:**
  - Redistribution: "You may NOT import, upload, reproduce, make available, publish, transmit, distribute, or sublicense
    the Content to any third party" (§2.1 Restrictions (B)).
  - Creation tools: no use "as an integrated asset library, template gallery, or reusable digital asset resource within
    any third-party software, platform, creation tool" (§2.1(C)). Pixel Studio *is* a creation tool.
  - AI/ML: no use "For machine learning, artificial intelligence (AI) training, fine-tuning, or model validation"
    (§2.1(C)). Pixel Studio is agent-driven.
- **Whether ActorCore's "free" motions are under different terms: (unverified).** The EULA draws no such distinction,
  and `actorcore.reallusion.com/license` returned an empty JavaScript shell.

### 1.2 Mixamo (Adobe): Fails for anything we ship

- **What Adobe allows.** The Mixamo FAQ ([helpx.adobe.com](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html),
  read in a browser because the site blocks scripted fetches):
  - "Mixamo is available free for anyone with an Adobe ID and does not require a subscription to Creative Cloud." It is
    "not available for Enterprise and Federated IDs" or users with a China country code.
  - "You can use both characters and animations royalty free for personal, commercial, and non-profit projects including:
    … Create films. Create video games."
  - The auto-rigger and animation libraries "are for bipedal humanoids only".
- **The licence that governs the files** is the Adobe General Terms of Use, §3.6 Content Files
  ([adobe.com/legal/terms.html](https://www.adobe.com/legal/terms.html)): "we grant you a personal, non-exclusive,
  non-sublicensable … and non-transferable license to use the Content Files to create your end use … into which the
  Content Files, or derivations thereof, are embedded … You may reproduce and distribute Content Files only in
  connection with your End Use, however, under no circumstances can you distribute the Content Files on a stand-alone
  basis, outside of the End Use."
- **The Mixamo Additional Terms** (effective 2021-06-23) add one clause, an AI/ML ban: no use of "any content, data,
  output, or other information received or derived from the Services or Software" to "create, train, test, or otherwise
  improve any machine learning algorithms or artificial intelligence systems"
  ([PDF](https://wwwimages2.adobe.com/content/dam/cc/en/legal/servicetou/Mixamo-Addl-Terms-en_US-20210623.pdf)).
- **What this means for us:**
  - **Using a Mixamo clip inside one finished site or game of your own** (a baked sprite sheet on your page) looks like
    the "End Use" Adobe permits.
  - **Shipping derived keyframes in `figures/*.json`** under MIT fails twice:
    - MIT sublicenses, and the Adobe licence is "non-sublicensable".
    - A reusable motion in a creation tool is a stand-alone derivative, not an End Use.
  - **The account requirement and the AI/ML clause** are further strings.
  - **Importer stance:** do not accept Mixamo clips into the shipped library. If the importer ever reads user-supplied
    Mixamo files, it should record the source, as [mesh2motion.md §7](mesh2motion.md#7-licensing-constraints-on-reusing-the-data)
    already recommends.

### 1.3 Rokoko Motion Library: Fails

- **Access needs an account.** The [Motion Library page](https://www.rokoko.com/products/motion-library) says "Download
  Rokoko Studio, sign up for free and start browsing the Motion Library", and offers "100 free mocap assets".
- **The terms** are the Rokoko Studio and Vision Standard Terms of Use, version 2.0.1, effective 16 July 2026
  ([rokoko.com/studio-term-of-use](https://www.rokoko.com/studio-term-of-use)):
  - §4.1: the licence holds "for as long as you have a valid Account with us" and is "limited, revocable, non-exclusive,
    non-sublicensable, and non-transferable".
  - §5.1: "The license to each Rokoko Asset is limited to the period in which you have an Account."
  - §5.3: "Unless expressly provided for in the license terms of the specific Rokoko Asset, you may not reproduce,
    distribute, sublicense, rent, lease or lend any Rokoko Asset". The only exception is copies "integrated as part of
    digital media productions".
  - §5.4: no ML/AI use without written consent.
- **Result.** A licence that ends with the account is incompatible with shipping derived data under MIT.

### 1.4 3D-POP (pigeons): OK with attribution, but not useful for animation

- **Licence.** The dataset record on the Max Planck Edmond repository
  ([doi:10.17617/3.HPBBC7](https://doi.org/10.17617/3.HPBBC7), version 7, released 2026-04-13) returns
  `"license": {"name": "CC BY 4.0", "rightsIdentifier": "CC-BY-4.0"}` from the Dataverse API. The reader code at
  [alexhang212/Dataset-3DPOP](https://github.com/alexhang212/Dataset-3DPOP) is MIT (GitHub API).
- **Content.** The README describes "video seqeunces from 4 view angles of pigeon flocks of 1-10 individuals", with
  "2D keypoint and 3D keypoints". The keypoints are "beak, nose, leftEye, rightEye, leftShoulder, rightShoulder, topKeel,
  bottomKeel, tail". They sit on two rigid bodies, a head and a backpack
  ([Dataset Structure notebook](https://github.com/alexhang212/Dataset-3DPOP/blob/main/Examples/Dataset%20Structure.ipynb)).
- **Fit.** There are no leg, foot or wing points, and the birds walk around a floor. It can give **head-bob timing and
  body pitch during walking**, nothing else. The goose's `head.hold` already models head stabilization. Low priority.

### 1.5 Cascadeur: Fails

The plans page ([cascadeur.com/plans](https://cascadeur.com/plans)) sets the terms:
- **Free tier:** "Export to .casc format only. .fbx and .dae are not available" and "Only non-commercial use".
- **Commercial-use FAQ:** "Free and Educational plans don't allow any commercial use". Indie is restricted to licensees
  whose "aggregate gross revenue or funding … must be less than $100,000 per year".
- **Prices:** Indie costs $96/yr or $19/mo; Pro costs $396/yr or $49/mo.
- **Result.** The free tier is both non-commercial and locked to a proprietary format, so even "tool output we own" does
  not apply. Cascadeur's EULA URL (`/eula`) returned "page not found"; the plan page's FAQ is the source used.

### 1.6 Blender, including Grease Pencil: Tool-only OK

- **Output is ours.** The licence page ([blender.org/about/license](https://www.blender.org/about/license/)) states:
  "What you create with Blender is your sole property. All your artwork – images or movie files – including the .blend
  files and other data files Blender can write, is free for you to use as you like." The FAQ adds: "Any creation you make
  as an artist with Blender is your sole property … This also applies for using the Add-ons and Python scripts you write
  for Blender" ([FAQ](https://www.blender.org/support/faq/)).
- **The FSF agrees in general terms:** "The output of a program is not, in general, covered by the copyright on the code
  of the program." The exception is when the program itself emits copyrighted art
  ([GPL FAQ #WhatCaseIsOutputGPL](https://www.gnu.org/licenses/gpl-faq.html#WhatCaseIsOutputGPL)). A glTF, PNG or JSON
  exported from our own data is ours. A bone guide rendered from CC0 clips is CC0 data plus our rendering.
- **Grease Pencil** is part of Blender (GPL v2-or-later source, distributed as GPL v3), so the same terms apply.
- **One string: scripts we publish.** "The GNU GPL license therefore requires that such scripts (if published) are being
  shared under a GPL compliant license" (licence page, "Add-ons"). MIT/Expat is "a lax, permissive non-copyleft free
  software license, compatible with the GNU GPL" ([FSF licence list](https://www.gnu.org/licenses/license-list.html#Expat)).
  So an MIT `bpy` export script is allowed. Keep it out of `src/` anyway, so the engine never imports `bpy`.

### 1.7 Adobe Character Animator: Fails

- **Plans.** The [product page](https://www.adobe.com/products/character-animator.html) offers "Character Animator
  Starter Free" with "predesigned puppets" and "select gestures". Pro features ("Create multiple characters and original
  puppets with Puppet Maker. Make your own movements and gestures") are in "the Creative Cloud Pro plan", "Regularly at
  77,99 €/mo".
- **Starter is free but limited**, and is governed by Adobe's General Terms (§1.2 above).
  - Whether Starter needs an Adobe account sign-in: **(unverified)**.
  - Pro is a subscription.
- **Fit.** The tool produces face-tracked 2D puppet video, not skeleton keyframes. Even licensed, it would not feed our
  pipeline.

### 1.8 Spine 2D: Fails

- **The licence is paid.** The [Spine Editor License Agreement](https://esotericsoftware.com/spine-editor-license)
  grants use "Subject to … the payment of any applicable license fees" (§1).
- **The trial is for evaluation only:** "free of charge and exclusively for the purposes of testing and evaluating the
  Spine Editor", and it "does not grant rights to integrate, distribute, or otherwise make use of the Spine Runtimes"
  (§1.4, §1.4.1).
- **Tiers:**
  - Essential and Professional apply only below a $500,000 revenue threshold (§1.1.1).
  - Enterprise renews annually (§1.2.1).
- **Fit.** As noted in [animation-tools-survey.md](animation-tools-survey.md), Spine is a runtime-skeleton tool, which
  is not our model.

### 1.9 Live2D Cubism: Fails

- **The FREE editor is "always free"** but commercial use is gated: "Only General Users and Small-Scale Enterprises
  (annual sales less than 10 million yen) may use the FREE version for commercial purposes"
  ([comparison page](https://www.live2d.com/en/cubism/comparison/)).
- **The SDK has a "Release License (Publication License Agreement)"**, which is "required for business entities
  publishing a content using Live2D SDK" ([SDK licence page](https://www.live2d.com/en/sdk/license/)).
- **Result.** A revenue gate is a string. Live2D also deforms front-facing illustrations with meshes, which does not
  match our side-view skeletons.

---

## 2. Human motion data

| Source | Size and format | Licence | Notes for us |
|---|---|---|---|
| Quaternius UAL | 120+ clips, universal humanoid rig; FBX/glTF/Blend | CC0 ("can be used for free without the need for attribution in commercial, educational, and personal projects", [FAQ](https://quaternius.com/faq.html)) | Already partly inside Mesh2Motion. The page also sells "Source" kits through Patreon; the free download is the CC0 one. Licence text for the paid tiers is not restated (see mesh2motion.md §7) |
| Kenney animated characters | Small humanoid packs, e.g. [Animated Characters Protagonists](https://kenney.nl/assets/animated-characters-1) | CC0 ("Attribution is not required", [support](https://kenney.nl/support)) | Few clips; low value beyond idle/run/jump |
| CMU Graphics Lab | About 2,600 clips (count **unverified**); ASF/AMC and C3D at 120 Hz, BVH via third-party conversions | Site terms only. Home page: "This dataset of motions is free for all uses." and "You may include this data in commercially-sold products, but you may not resell this data directly, even in converted form." FAQ: "may be copied, modified, or redistributed without permission." ([home](http://mocap.cs.cmu.edu/), [FAQ](http://mocap.cs.cmu.edu/faqs.php)) | Real mocap and broad. The no-resale line is a string: shipping CMU-derived keyframes under MIT, which permits selling copies, conflicts with it. Fine for measuring and tuning presets. The requested acknowledgment ("The data used in this project was obtained from mocap.cs.cmu.edu…") applies to publications |
| 100STYLE | 4 M+ frames of styled locomotion; BVH plus processed features | CC BY 4.0 ([Zenodo 8127870](https://zenodo.org/records/8127870)) | Best CC-BY source for walk/run *styles* (sneak, proud, tired…). A good reference for our `walk`/`run`/`sneak` presets |
| ACCAD Open Motion Project | Hundreds of clips (walks, runs, gestures, martial arts); BVH, C3D, ASF/AMC, TXT | CC BY 3.0 ([ACCAD page](https://accad.osu.edu/research/motion-lab/mocap-system-and-data)) | Real mocap with BVH; credit "ACCAD/The Ohio State University" |
| Environment-aware Motion Matching | 50+ min Xsens mocap | CC BY 4.0 ([Zenodo 17220516](https://zenodo.org/records/17220516)) | Locomotion around obstacles |
| Fukuchi et al. walking | 51 people, overground and treadmill at several speeds; C3D and TXT; pelvis and lower limbs only | CC BY 4.0 ([Figshare](https://figshare.com/articles/dataset/A_public_data_set_of_overground_and_treadmill_walking_kinematics_and_kinetics_of_healthy_individuals/5722711)) | Biomechanics ground truth for hip/knee/ankle angles against speed. A check on the stylized 91° knee seen in Mesh2Motion |
| Bandai Namco Research | 2 datasets, BVH | CC BY-NC 4.0 ([README](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset#license)) | Fails (NC). Its Blender visualizer is MIT, but useless without the data |
| Ubisoft LaFAN1 | BVH | CC BY-NC-ND 4.0 ("This dataset can be used under the Creative Commons Attribution-NonCommercial-NoDerivatives 4.0", [README](https://github.com/ubisoft/ubisoft-laforge-animation-dataset)) | Fails (NC and ND) |
| AMASS | SMPL-based, registration required | "Dataset Copyright License for non-commercial scientific research purposes"; "The Dataset may not be reproduced, modified and/or made available in any form to any third party" ([licence](https://amass.is.tue.mpg.de/license.html)) | Fails |
| SFU | BVH | "free for research purposes. The data cannot be used for commercial products or resale" ([site](http://mocap.cs.sfu.ca/)) | Fails |
| Truebones | Gumroad packs, some "FREE" | No licence text on the pages read | Fails until a licence is published |
| Motion-matching sample data | `orangeduck/Motion-Matching` (code MIT) | Data is LaFAN1 (README L25) | Code is reusable as reference; the data fails |
| OpenSim | Biomechanics simulator | Apache-2.0 ([repo](https://github.com/opensim-org/opensim-core)) | An OK tool, but overkill here. Dataset licences on SimTK vary per project (not checked) |

**Recommendation.**
- Mesh2Motion and Quaternius (CC0) supply clips we can ship.
- 100STYLE and ACCAD (CC BY) supply better-quality mocap where we accept a credit line.
- CMU and Fukuchi are references we measure against without shipping.

---

## 3. Bird locomotion and flight (most important)

### 3.1 What licence Dryad data carries

- **Dryad publishes data only under CC0.** Its [Terms of Service](https://datadryad.org/terms) state: "By Submitting a
  Dataset to Dryad, the Submitter grants Dryad irrevocable permission to make the Dataset available to the public under
  a CC0 instrument."
- **The requirements page agrees:** "Dryad does not accept any files with licensing terms that are incompatible with the
  Creative Commons Zero waiver" ([requirements](https://datadryad.org/requirements)).
- **One caveat.** Code and "supplemental information" can be routed to **Zenodo**, which offers "additional licensing
  options". Check the licence of any linked Zenodo software record separately.
- **Zenodo and Figshare have no single default licence.** Each record states its own; the records cited below were read
  through their APIs.

### 3.2 Datasets found (all CC0 per the Dryad API unless noted)

| Dataset | Bird | What it contains (from the record) | Format | Use for the goose |
|---|---|---|---|---|
| Schwaner, Nishikawa & Daley 2022, [doi:10.5061/dryad.k0p2ngfbb](https://doi.org/10.5061/dryad.k0p2ngfbb) | Guineafowl | Treadmill walking with belt-speed perturbations; joint kinematics; keywords "guinea fowl, Walking" | One CSV (277 KB) + README docx | **Best leg reference.** A ground bird of similar build. Hip, knee, ankle and TMP angles over the stride, to check `walk` duty, knee/hock fold and foot lift. The CSV column layout was not inspected (download blocked, §7) |
| Andrada et al. 2014, [doi:10.5061/dryad.jh5h4](https://doi.org/10.5061/dryad.jh5h4) | Quail | "3D x-ray videography" plus force plates, walking and running | `.rar` of `.mat` (57 MB) | Leg segment angles and trunk pitch in walking, from an X-ray (skeletal) view. Good for the pronograde trunk |
| Tomotani & Muijres 2019, [doi:10.5061/dryad.g28t010](https://doi.org/10.5061/dryad.g28t010) | Pied flycatcher | 146 upward escape take-offs; "reconstructed the three-dimensional body and wing movements throughout each maneuver" | `DatabaseS1.mat` (0.96 MB) | **Take-off** wing-stroke and body-pitch reference (a small passerine, not a goose) |
| Deetjen, Chin, Heers, Tobalske & Lentink 2023, [doi:10.5061/dryad.wwpzgmsqs](https://doi.org/10.5061/dryad.wwpzgmsqs) | Ringneck dove | Take-off; "3D wing surface … at 1000 Hz" plus forces and muscle strain | One 19 GB zip + README | Wing surface over a whole wingbeat at take-off. The download is too large for casual use; the paper's derived angles may be enough |
| Roderick, Chin, Cutkosky & Lentink 2019, [doi:10.5061/dryad.89rr53h](https://doi.org/10.5061/dryad.89rr53h) | Pacific parrotlet | Perch landings; "stereotyped leg and wing dynamics" | Zip (210 MB) + README docx | **Landing**: leg extension and wing braking before touchdown |
| Evangelista et al. 2014, [doi:10.5061/dryad.s6k44](https://doi.org/10.5061/dryad.s6k44) | Chukar (juvenile) | Aerial righting; transition to "bilaterally symmetric flapping" | `data.tar.gz` (19 KB) | Minor: flapping onset in a ground bird |
| Henningsson 2021, [doi:10.5061/dryad.rr4xgxd8j](https://doi.org/10.5061/dryad.rr4xgxd8j) | Budgerigar | 3D trajectories, "speed, wingbeat frequency and accelerations" through gaps | Zip (81 MB) | Minor: wingbeat frequency and speed |
| Meir et al. 2019, [doi:10.5061/dryad.fg80hp6](https://doi.org/10.5061/dryad.fg80hp6) | Bar-headed goose | Wind-tunnel flight physiology (heart rate, metabolism) | Zip (58 KB) | The only goose dataset found. Physiology, not kinematics; whether it includes wingbeat frequency is **(unverified)** |
| 3D-POP (§1.4) | Pigeon | Head and torso keypoints while walking | CSV + video | Head-bob only. **CC BY 4.0** |
| Magpie take-off jump, [Figshare 14871138](https://frontiersin.figshare.com/articles/dataset/Data_Sheet_1_On_the_3D_Nature_of_the_Magpie_Aves_Pica_pica_Functional_Hindlimb_Anatomy_During_the_Take-Off_Jump_PDF/14871138) | Magpie | A supplementary PDF, not raw data | PDF | Reading only. CC BY 4.0 |

**No goose (Anser/Branta) wing or leg kinematics dataset under any open licence was found** on Dryad, Zenodo or
Figshare (searches: "goose flight", "goose", "mallard", "duck locomotion", "waterfowl"). The goose-specific sources
remain:
1. the Mesh2Motion bird rig (CC0; already mapped in mesh2motion.md §6d);
2. **numbers** read from published papers.

Facts such as wingbeat frequency, stroke amplitude, downstroke fraction or duty factor are not copyrightable in the US:
copyright does not "extend to any idea, procedure, process, system, method of operation, concept, principle, or
discovery" ([17 U.S.C. §102(b)](https://www.law.cornell.edu/uscode/text/17/102)). Re-measuring a published plot is the
same. Copying tables or figures verbatim is not. Other jurisdictions (for example the EU database right) are not
analysed here.

### 3.3 Can these drive a side view?

- **Legs: probably, below the knee.** The guineafowl CSV and the quail X-ray data describe the segments our
  `legNear`/`shinNear`/`footNear` chain uses.
  - How planar they are is **(unverified)** for these datasets.
  - Mesh2Motion's bird rig splays the femur 40–68° sideways (mesh2motion.md §1).
  - The magpie study reports "considerable non-sagittal plane motion" during take-off jumps.
  - Expect to project the shank and tarsometatarsus cleanly and to fold the femur into the body, as mesh2motion.md
    already does.
- **Wings: as a reference, not as frames.** Our goose has a single `wing` bone (`figures/goose.json`, `rig.wings:
  ["wing"]`). Its `flap` motion is a hand-keyed 8-frame `rot` track (0, 55, 10, 60…).
  - What a 3D wing dataset can give it: elevation-angle-versus-phase in the side projection, the downstroke/upstroke time
    split, and wingbeat frequency. That is three numbers and one curve.
  - The datasets' formats are 3D marker trajectories or wing surfaces (`.mat`), not BVH. A small offline script would
    project the wrist and tip markers onto the sagittal plane and fit the curve.
- **Take-off and landing:** use the flycatcher, dove and parrotlet data for **phase structure**, for example: crouch,
  leg push, first downstroke, then gear-up; or wings braking, legs extending, touchdown. Our `jump` model already
  emits `launch`/`land` events, so a take-off is mostly a new `pose` track timed against them.

---

## 4. Quadruped (dog, fox) data

| Source | Licence | Verdict | Notes |
|---|---|---|---|
| Mesh2Motion fox (21 clips) and horse (14 clips) | CC0 | **OK** | Measured near-planar in mesh2motion.md §5.2 |
| Quaternius Ultimate Animated Animal Pack | CC0 | **OK** | "12 different animals, each with more than 12 unique animations (Attack, Death, Kicks, Gallops, Walk, Jump and many more!)". FBX/OBJ/glTF/Blend. The preview image shows fox, shiba, husky, wolf, deer, stag, alpaca, cow, bull, donkey and horse ([pack page](https://quaternius.com/packs/ultimateanimatedanimals.html)). The exact clip list per animal is **(unverified)** |
| AI4Animation dog mocap (SIGGRAPH 2018) | CC BY-NC 4.0 | Fails | Real dog mocap, but NC: "The motion capture data is available only under the terms of the Attribution-NonCommercial 4.0 International" ([README](https://github.com/sebastianstarke/AI4Animation)) |
| RGBD-Dog (Bath) | Academic release form | Fails | 5 dogs; walk, trot, jump. "available for academic use", by form ([README](https://github.com/CAMERA-Bath/RGBD-Dog)) |
| PFERD (horses) | Non-commercial research licence | Fails | Dataverse terms: "Data Copyright License for non-commercial scientific research purposes" |
| AcinoSet (cheetahs) | None stated | Fails (unverifiable) | 3D keypoints from wild cheetah runs; GitHub reports no licence |
| Loscher et al. 2016, [doi:10.5061/dryad.rf5bj](https://doi.org/10.5061/dryad.rf5bj) | CC0 | OK, marginal | Head-nodding timing in walking ungulates (Matlab code + data). A reference for head bob in a trot |
| Usherwood & Granatosky 2020, [doi:10.5061/dryad.76hdr7sv4](https://doi.org/10.5061/dryad.76hdr7sv4) | CC0 | OK, marginal | Quadruped limb-work data and simulations; force-profile shapes, not joint angles |

**Conclusion.** No openly licensed *measured* dog or fox kinematics were found. Every real dog mocap set is NC or
academic-only. For the dog figure:
1. the Mesh2Motion fox and the Quaternius shiba/husky/fox (CC0, stylized) are the shippable sources;
2. published gait numbers (duty factor and phase offsets for walk and trot) are the factual reference.

---

## 5. Libraries for the import pipeline

The engine has no runtime dependencies (`package.json` has no `dependencies`), and that should not change. Everything
below belongs in a dev-time CLI or script, and could be an optional `devDependency`. As in mesh2motion.md §6c, the
importer outputs plain `rot` tracks.

| Need | Library | Licence | Maintenance (npm / GitHub API, 2026-11-09) | Recommendation |
|---|---|---|---|---|
| GLB/glTF reading | `three` GLTFLoader | MIT | 0.187.0, published 2026-10-30; 0 deps | Fine as a reference. Pulls in a 3D runtime for something a 100-line GLB chunk reader does |
| | `@gltf-transform/core` (+ `extensions`) | MIT | 4.5.1, 2026-09-28; core has 1 dependency | Use it if we want a document model and Node I/O. Its docs: "Geometry and other data are decompressed while reading the file" once `EXTMeshoptCompression` and the decoder are registered ([docs](https://gltf-transform.dev/modules/extensions/classes/EXTMeshoptCompression)) |
| | `@loaders.gl/gltf` | MIT | 4.5.4, 2026-10-10; 7 deps | No advantage here |
| Meshopt decoding | `meshoptimizer` (`MeshoptDecoder`) | MIT | 1.3.0, 2026-09-25; 0 deps; repo active | **Use.** The minimal path is our GLB reader plus this decoder |
| Draco (if a source uses it) | `draco3d` | Apache-2.0 | 1.5.9, 2026-10-16 | Only if needed; Mesh2Motion uses meshopt, not Draco |
| BVH | three.js `BVHLoader.js` | MIT | Part of three r187; 486 lines; "only supports BVH files containing a single root" | **Reference for our own parser** |
| | `bvh-parser` (npm), `bvh` (npm) | MIT per npm metadata | Last published 2018-01-31 and 2018-12-20 | Do not depend on them; `parse-bvh`'s repo has no LICENSE file. Testing later showed `bvh-parser` drops each offset's X and npm `bvh` is not a mocap parser ([mit-libraries.md](mit-libraries.md)) |
| FBX | three.js `FBXLoader.js` | MIT | r187; "Requires FBX file to be >= 7.0 and in ASCII or >= 6400 in Binary format" | Works for Mixamo-era FBX, but drags three.js in |
| | `ufbx` (C, single file) | MIT **or** Unlicense | Repo active (push 2026-10-01, about 1.4k stars); "Supports binary and ASCII FBX files starting from version 3000"; no npm package | Best permissive FBX reader. Would need our own WASM build. Only worth it if FBX import becomes a feature |
| | `fbx-parser` (npm) | MIT | 2.1.3, published 2021-02-12 | Low-level node tree only; stale |
| | `assimpjs` (WASM assimp) | MIT wrapper; assimp is BSD-3-Clause ([LICENSE](https://github.com/assimp/assimp/blob/master/LICENSE)) | 0.0.10, 2023-07-13 | Heavy; no |
| | Autodesk FBX SDK | Proprietary | — | Avoid; not needed given the above. Its licence was not reviewed |
| C3D (research mocap) | `ezc3d` | MIT | Repo active (2026-10-27); C++/Python/MATLAB, no JS | Offline conversion of CMU/ACCAD/Fukuchi C3D to JSON/CSV. The npm package named `c3d` is unrelated (an Ethereum tool) |
| IK | our `ccd` in `src/core/rig.js` | MIT (ours) | — | **Keep.** Our legs are 2-3 bone planar chains |
| | `closed-chain-ik` | Apache-2.0 | 0.0.3 (2023); repo active | Not needed |
| | `three-ik` (THREE.IK) | MIT | 0.1.0 (2018) | Stale; not needed |
| Retargeting | three.js `SkeletonUtils.retargetClip` | MIT | r187 | Reference only. Our retarget is a bone map plus a 2D projection, as in mesh2motion.md §6a |

**FBX is proprietary.** That does not block us, because permissive readers exist (ufbx, three's FBXLoader), and
because Blender can convert FBX to glTF offline with output we own (§1.6). The importer should accept **glTF/GLB and
BVH** only. FBX sources go through Blender or a one-off ufbx step.

---

## 6. Shipping CC-BY-derived motion: what "attribution required" means in practice

CC BY 4.0 §3(a)(1) requires, "If You Share the Licensed Material (including in modified form)":
- the creator's identification;
- a copyright notice and a licence notice;
- a URI to the material "to the extent reasonably practicable";
- "indicate if You modified the Licensed Material";
- a link to the licence.

It also allows satisfying this "in any reasonable manner based on the medium, means, and context"
([legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en)).

For Pixel Studio, that means:
- a `source` field on each imported animation: dataset, creator, licence, URL and "modified: projected to 2D,
  resampled";
- the same lines collected into a `CREDITS` or `NOTICE` file shipped in the npm package (`files` in `package.json`).

Keyframes derived from CC0 and from CC-BY sources should be kept in clearly separate files, so the CC0 ones stay
string-free. This is the same `"source": {...}` field mesh2motion.md §7 already proposes.

---

## 7. The proposed Blender "bone guide" workflow, against projecting in our own code

**The proposal:** import the skeleton into Blender, set an orthographic side camera, render a stick figure, and trace it.

**Licensing is fine** (§1.6: output is ours). **For our engine it is the weaker path:**

- **What the engine wants is numbers, not pictures.** A figure's animation is a set of per-frame `rot` tracks on named
  bones (`figures.md`, "Your tracks on top of a motion"). The clip already holds those rotations. Projecting them is a
  few lines of math per bone (mesh2motion.md §6a: FK, then `atan2(fwd, −up)`, then parent-relative, then minus rest).
  Tracing a render throws the numbers away and asks a human or agent to recover them by eye.
- **It is not reproducible or measurable.** The reference-curve tooling in mesh2motion.md §8 step 1 (duty, stride/leg,
  lift/leg, angle curves next to our `generateMotion`) only works if the curves come from code. A traced guide cannot be
  diffed when a preset changes.
- **Planarity is already known to be good** (legs within about 3° of the sagittal plane, mesh2motion.md §5.2). The
  view direction Blender's camera would "solve" is a single axis choice in code.
- **Blender does help in three cases:**
  1. **FBX to glTF conversion** for sources that only ship FBX. This can run headless, e.g.
     `blender -b --python export.py`, keeping the script outside `src/`.
  2. **Eyeball checks:** load the clip and our exported tracks side by side.
  3. **Non-skeletal reference** a pixel artist might want, such as wing-feather silhouettes through a wingbeat. Grease
     Pencil tracing over a CC0 render is legitimate for that, but it produces art, not tracks.

**Recommendation.**
- Project in our own code: `pixel import-motion` plus the reference script from mesh2motion.md §8.
- Treat Blender as an optional offline converter and viewer, never as a required step and never a dependency.
- For the goose wing, fit the single `wing` angle curve from projected 3D markers (Dryad data or the Mesh2Motion bird
  rig's `Flap`) in code, rather than tracing.

---

## 8. Could not be verified

- **Whether ActorCore's "free" motions carry different terms** from the Content EULA.
  `actorcore.reallusion.com/license` returned an empty JavaScript shell.
- **Whether Adobe Character Animator Starter requires an Adobe account sign-in.** The product page does not say.
- **Cascadeur's full EULA text** (`cascadeur.com/eula` returned "page not found"). The verdict rests on the plans page
  and its FAQ.
- **Truebones' licence for its free packs.** No licence text appeared on the Gumroad pages read
  ([new free animals](https://truebones.gumroad.com/p/new-free-animals-animations)), and `truebones.com/license` returned
  no content.
- **The contents and column layouts of the Dryad files.** Scripted downloads were refused (the API answered
  "Unauthorized, must have current bearer token"; the web file stream answered 403). Descriptions above come from the
  Dryad API metadata (title, abstract, methods, file names and sizes), not from opening the files.
- **Whether the bar-headed goose dataset** (doi:10.5061/dryad.fg80hp6) **includes wingbeat frequency.**
- **The exact clip list per animal** in the Quaternius Ultimate Animated Animal Pack. The animal list is read from the
  preview image; "12 animals, 12+ animations each" is from the page text.
- **Licence statements inside downloaded archives** (for example a README inside `100STYLE.zip`). Only the repository
  record's licence field was checked.
- **CMU's total clip count**, and the licence of third-party BVH conversions of CMU data.
- **Licences of individual OpenSim/SimTK datasets**, and of the hSMAL model referenced by PFERD.
- **The Autodesk FBX SDK licence terms.** Not reviewed, because no FBX SDK is needed.
- **Copyright outside the US.** The status of factual measurements under other jurisdictions (e.g. the EU sui generis
  database right) was not analysed. For CC0 sources this is moot, because CC0 waives database rights too.
