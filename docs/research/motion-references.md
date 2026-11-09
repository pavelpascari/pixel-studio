# Motion references that are not animation data: plates, papers, footage

*Research date: 2026-11-09. Primary sources only, all read on this date:
- holding-institution records: Boston Public Library via Digital Commonwealth and its Wikimedia Commons mirror, University of Pennsylvania Archives, Internet Archive, Cleveland Museum of Art Open Access;
- Muybridge's own 1887 catalogue of plates;
- the papers themselves (PMC full text, publisher PDF, supplementary files);
- dataset records (figshare);
- Wikimedia Commons file pages and the Commons API (`extmetadata`);
- the US Code, the Copyright Office Compendium and the Bridgeman v. Corel opinion.

Numbers marked **COMPUTED** were calculated here from a published equation or from open raw data. They are not printed in the source. Anything not checked against a primary source is marked **(unverified)** and collected in §9. This report adds to [mesh2motion.md](mesh2motion.md) and [motion-data-sources.md](motion-data-sources.md), which cover animated 3D clips and mocap. Their material is not repeated here. This is a reading of licence texts, not legal advice.*

**Question.** Are there freely available resources that describe the motions we want but are not yet animation data? We mean photographic motion studies, published gait and flight measurements, animation-craft references and raw video. Could they be the basis for the goose, dog and human motions? The licence rule is unchanged:
- **Anything we copy or derive images from** must be public domain, CC0, or CC-BY with attribution flagged. CC BY-SA, NC and ND fail.
- **Measured facts and numbers from papers** are fine whatever the paper's licence, but we must not copy copyrighted figures or text (§1).

The owner added one requirement. Every frame or number we derive must be traceable to its source. Each resource below therefore carries the citation data a provenance log needs, and §8 proposes the log format.

---

## At a glance

| Resource | What it shows | Rights (verified) | How we'd use it | Link |
|---|---|---|---|---|
| Muybridge, *Animal Locomotion* (1887), BPL scans: dog plates 706, 708–710 | Dog trotting (side view, 12 frames) and hounds galloping (10–12 side frames) | "No known copyright restrictions." / NoC-US (BPL record); Commons: "Public domain" | Measure leg angles per frame, take footfall timing for `dog.trot` and a future gallop. Recorded intervals give real time | [Plate 706](https://ark.digitalcommonwealth.org/ark:/50959/707969402) |
| Same, human plates 1, 6, 13 (walk), 60–64 (run), 88/109/111 (stairs, ladders), 152–162 (jumps), 236/249 (sit, rise) | Nude models in side, front and rear rows, 10–12 frames each | Same | Check `human.walk/run/jump/sit/climb` poses and timing | [Plate 1](https://ark.digitalcommonwealth.org/ark:/50959/70795t76c) |
| Same, bird plates 755–780 | Pigeon, cockatoo, vulture, eagle in flight; ostrich and adjutant walking; swans only in group scenes (776–780) | Same | Wingbeat timing for large birds in side view. **No goose, duck or crane plate exists** | [Plate 755](https://ark.digitalcommonwealth.org/ark:/50959/70796b86w) |
| Muybridge, *Prospectus and Catalogue of Plates* (1887) | Per plate: views, frame count, fraction of a cycle shown, interval between exposures in ms | Published 1887, so US public domain by age. The IA copy says "There are no known copyright restrictions in the United States on the use of the text." | Frame interval gives fps and cycle time (§2.5) | [Penn Archives PDF](https://archives.upenn.edu/wp-content/uploads/2018/01/muybridge-animal-locomotion-catalogue.pdf), [IA](https://archive.org/details/cu31924024580353) |
| Marey, *Chronophotograph of a Flying Heron* (c. 1883–87), Cleveland Museum of Art 2009.349 | About 12 overlapping positions of a heron in flight on one plate | CC0 (CMA Open Access `share_license_status`) | Wing-silhouette reference for a large bird's stroke | [clevelandart.org/art/2009.349](https://clevelandart.org/art/2009.349) |
| Marey, *Le vol des oiseaux* (1890), Getty scan on IA | Measured wingbeats per second: duck 9, pigeon 8, gull 3½ (about 5 at take-off) | IA: "NOT_IN_COPYRIGHT"; published 1890 | Wingbeat frequency for take-off vs cruise | [archive.org/details/gri_33125008636926](https://archive.org/details/gri_33125008636926) |
| Maes et al. 2008, *J Exp Biol*: dog footfall timing (5 malinois, 0.4–10 m/s) | Duty factor, cycle time and stride length as functions of speed; limb time lags per gait | © The Company of Biologists 2008: free to read, **facts only** | Sets `dog.walk/trot` `duty`, `stride`, `fps` and walk `phases` | [doi:10.1242/jeb.008243](https://doi.org/10.1242/jeb.008243) |
| Fukuchi et al. 2018 (walking) and 2017 (running), *PeerJ*, with figshare data | Joint-angle curves, speeds, stride, cadence; raw force data gives duty factor | CC BY 4.0, **attribution required** | Checks `human.walk/run` stride, duty and timing; hip/knee/ankle curves as `tracks` reference | [doi:10.7717/peerj.4640](https://doi.org/10.7717/peerj.4640), [doi:10.7717/peerj.3298](https://doi.org/10.7717/peerj.3298) |
| Wang et al. 2025, *Front Vet Sci*: domestic goose head and neck while walking | Geese head-bob: thrust about 62%, hold about 38% of each step | CC BY 4.0, **attribution required** | Adds `head.hold` to `goose.walk` | [doi:10.3389/fvets.2025.1554240](https://doi.org/10.3389/fvets.2025.1554240) |
| Han et al. 2023, *PeerJ*: mallard walking vs grounded running | Duty 0.74 walking, 0.62 running, never below 0.5; stride times | CC BY 4.0, **attribution required** | `goose.walk` / `goose.run` duty; no flight phase in waterfowl running | [doi:10.7717/peerj.15362](https://doi.org/10.7717/peerj.15362) |
| Meir et al. 2019, *eLife*: bar-headed goose in a wind tunnel | Wingbeat 4.97 Hz; downstroke 116 ms, upstroke 86 ms; stroke amplitude about 73° | **CC0** ("free of all copyright") | Checks `goose.flap` / `rush` wing timing, amplitude and down/up asymmetry | [doi:10.7554/eLife.44986](https://doi.org/10.7554/eLife.44986) |
| Bishop et al. 2018, *PLoS One*: bird duty factor vs speed | Duty factor = 0.5278·v*^−0.3651 (v* = v/√(g·hip height)) | CC BY 4.0, **attribution required** | Keeps goose `duty` consistent with its speed | [doi:10.1371/journal.pone.0192172](https://doi.org/10.1371/journal.pone.0192172) |
| Mainka et al. 2023, *J Neural Transm*: arm swing | Arm-swing range about 47–58° at preferred speed (healthy, mean age 64.5) | CC BY 4.0, **attribution required** | `human.walk.armSwing` | [doi:10.1007/s00702-023-02619-4](https://doi.org/10.1007/s00702-023-02619-4) |
| Greylag goose take-off video, Jonn Leffmann (2026) | Take-off, 1920×1080 at 59.94 fps, 18.75 s | CC BY 4.0, "Foto: Jonn Leffmann / Wikipedia" | Frame-by-frame take-off reference (none exists in Muybridge) | [Commons](https://commons.wikimedia.org/wiki/File:Uppflog_-_Ystad_2026.webm) |
| USFWS Canada goose clips on Commons | Flight, family, trail-camera grazing; 720p–1080p, 24–30 fps | `{{PD-USGov-FWS}}`, public domain | Walking and grazing frames from a fixed camera | [Canada Geese (25738746322)](https://commons.wikimedia.org/wiki/File:Canada_Geese_(25738746322).webm) |
| Marey & Comte athletics films, 1900 | Long jump, hurdles, high jump; side view, about 25 fps transfers | `{{PD-US-expired}}` on Commons | Human jump arcs and run-up | [Saut en longueur… (1900)](https://commons.wikimedia.org/wiki/File:Saut_en_longueur_par_Sweeney_(champion_americain)_%C3%A0_la_station_physiologique_(1900).webm) |
| *Hurdle Jumping by Trained Dogs* (Biograph, 1899) | Dogs jumping hurdles | `{{PD-US}}` | `dog.jump` arc and tuck | [Commons](https://commons.wikimedia.org/wiki/File:Hurdle_Jumping_by_Trained_Dogs_-_1899_-_American_Mutoscope_and_Biograph_(US)_-_EYE_FLM75062_-_OB_685436.ogv) |
| Hildebrand-style gait graphs and Blender/Wikibooks walk-cycle pages | Footfall diagrams, animation principles | CC BY-SA, **fails for images**; facts only | Read, don't copy | §5 |
| Williams, Blair, Dover Muybridge reprints | Animation craft; plate selections | Copyrighted (§5) | Facts only. Use the BPL 1887 scans instead of Dover pages | §5 |

---

## Highest-value first pass

Each item names the source, the parameter it sets and the expected change. Run `node bin/pixel.mjs validate <figure>` after each change: some strides below may be too long for the legs, and the validator reports missed foot targets. The scale used to convert metres to canvas units is stated each time.

1. **Re-time `dog.walk` and `dog.trot` from Maes et al. 2008.** Our trot moves at walking speed, and the walk has short, slow steps.
   - **Scale:** the Maes dogs have a withers height of 0.61 m, and our dog's withers stand 32.5 units above the ground, so 1 unit ≈ 1.9 cm. Details in §3.1.
   - **`walk`, matched to a real dog at 1 m/s (COMPUTED from the Appendix 1 fits):**
     - cycle 0.81 s, duty 0.65, stride length 0.79 m (42 units)
     - set `fps` 10 with `frames` 8 (0.8 s)
     - set `stride` (our per-stance foot sweep = cycle distance × duty) to about 27, up from 15
     - keep `duty` at 0.65
   - **`walk` phases (Table 2):** the lateral-walk pair lag of 84% means each forefoot lands 16% of a cycle after the same-side hindfoot. Ours is 25%. Set the walk `phases` to `{thighHindNear: 0, armForeNear: 0.16, thighHindFar: 0.5, armForeFar: 0.66}`.
   - **`trot`, at 2.5 m/s:**
     - cycle 0.48 s, duty 0.46, stride length 1.23 m (65 units)
     - set `frames` 6 at `fps` 12 (0.5 s), `duty` 0.46, `stride` about 30, up from 17
     - Today `dog.trot` runs at 56.7 units/s, about 1.1 m/s at this scale, which is walking speed for a dog of that size.
   - **Cross-check with Muybridge plate 706** (mastiff "Smith" trotting): about a 0.81 s cycle. That dog is heavier and the trot slower.
2. **Give the goose a real head-bob and a grounded run.**
   - **Head-bob, from Wang et al. 2025:** domestic geese hold the head still in the world for about 38% of each step, then thrust it forward. Add `"hold": 0.38` to `goose.walk.head`, and to `sneak`. The engine already implements `hold` (docs/figures.md, `head`).
   - **Duty factor, from Han et al. 2023 (mallard):**
     - Walking duty is 0.74 and grounded running is 0.62; a duck's duty factor never falls below 0.5.
     - Raise `goose.walk.duty` from 0.62 to about 0.7.
     - Raise `goose.run.duty` and `goose.rush.duty` from 0.42 (a run with a flight phase) to about 0.55–0.6, keeping `bounce: "spring"`. That makes a grounded run, which is what waterfowl do.
   - **Speed check (Bishop et al. 2018 equation, COMPUTED):** duty 0.42 corresponds to v* ≈ 1.9, a sprint. Duty 0.6 corresponds to v* ≈ 0.7.
3. **Check goose wing timing against Meir et al. 2019 (CC0) and Marey 1890.**
   - **Cruise:** the bar-headed goose cruises at 4.97 Hz. Its downstroke takes 58% of the beat (116 ms of 202 ms) and its stroke-plane amplitude is about 73°.
   - **Take-off:** Marey's gull beats 3½ times a second in level flight and about 5 at take-off, a ratio of about 1.4. That puts take-off for a goose at about 7 Hz.
   - **Our presets:** `goose.flap` beats once per 2 frames at 12 fps, which is 6 Hz. `goose.rush` beats once per 2 frames at 14 fps, which is 7 Hz. Both fit take-off and hurried flapping, so keep them.
   - **For a future level-flight `fly` motion:**
     - use 5 Hz, i.e. 4 frames per beat at 20 fps, or 2 frames per beat at 10 fps;
     - make the down-sweep longer than the up-sweep;
     - widen the wing's swing toward about 70°. Today the swing is 10→60°, i.e. 50°.
4. **Lengthen `human.walk` and adjust `human.run` from the Fukuchi CC BY data.**
   - **Scale:** our human is about 82 units tall. Assuming an adult of 1.70 m **(assumption, not from a source)**, 1 unit ≈ 2.1 cm.
   - **Walk:** comfortable overground speed is 1.24 m/s, the stride period is about 1.03 s, and stride length is 1.28–1.34 m (Fukuchi; Mainka Table 2). That is about 62–65 units per cycle; ours covers 43. Raise `stride` from 26 toward about 32–36 (validate reach). Keep `duty` 0.6, which matches the measured 0.59–0.62, and keep 1.0 s per cycle.
   - **Run, at 2.5 m/s (Table 4):** stride 1.86 m, 80.8 strides/min (a 0.74 s cycle), duty about 0.36 (COMPUTED from the force data). Set `duty` 0.34–0.36, `stride` about 30 (from 26), and `fps` 11 (8 frames = 0.73 s).
   - **Hip flexion:** it reaches 44° in running. Ours peaks at 33°, so expect more thigh swing once the stride is longer.
5. **Measure one Muybridge plate end to end** to prove the method (§7.1). Plate 706 (dog trot) is the best choice: a single clean side-view row of 12 frames numbered 1–12 left to right, a 0.110 s interval, and public domain. The output is a `tracks` set or a list of tuned parameters for `dog.trot`, plus a provenance entry per frame (§8).

---

## 1. What we may take from copyrighted sources: facts, not expression

- **The statute.** "In no case does copyright protection for an original work of authorship extend to any idea, procedure, process, system, method of operation, concept, principle, or discovery, regardless of the form in which it is described, explained, illustrated, or embodied in such work." [17 U.S.C. §102(b)](https://www.law.cornell.edu/uscode/text/17/102).
- **The Copyright Office's reading.** Its [Compendium (Third), ch. 300](https://www.copyright.gov/comp3/chap300/ch300-copyrightable-authorship.pdf) says:
  - §313.3(C) "Facts": facts "are not copyrightable".
  - §313.3(A): copyright owners "do not have the right to prevent others from using the ideas, concepts, principles, or discoveries or from implementing the procedures, processes, systems, or methods of operation described in such works."
- **The line in practice.**
  - A duty factor of 0.46, a wingbeat of 4.97 Hz, or a curve we re-plot from our own measurements of a dataset are facts. We can use them.
  - A paper's figure, table layout or prose is expression. We must not copy it into the repo or into sprites.
  - A Hildebrand gait graph drawn by someone else is expression too, even though the footfall timing it shows is a fact.
- **Scans of public-domain plates.** In *Bridgeman Art Library v. Corel Corp.*, 36 F. Supp. 2d 191 (S.D.N.Y. 1999), the court held that "'slavish copying,' although doubtless requiring technical skill and effort, does not qualify" ([opinion on Wikisource](https://en.wikisource.org/wiki/Bridgeman_Art_Library,_Ltd._v._Corel_Corp.)).
  - Commons applies this to "faithful reproduction[s] of an old, public domain, two-dimensional work of art" and warns that "The case of Bridgeman applies in the United States only" ([Commons:When to use the PD-Art tag](https://commons.wikimedia.org/wiki/Commons:When_to_use_the_PD-Art_tag)).
  - For the BPL Muybridge scans this question does not arise, because BPL states "No known copyright restrictions" itself.
- **Age.** Works published in the US before 1931 are "In the public domain due to copyright expiration" ([Cornell copyright term chart](https://guides.library.cornell.edu/copyright/publicdomain), current as of 1 January 2026). This covers Muybridge's 1887 plates and catalogue, Marey's 1890 book and the 1899 and 1900 films.

## 2. Photographic motion studies in the public domain

### 2.1 Where the scans are, and the rights statements

**Boston Public Library, Rare Books Department** holds a complete *Animal Locomotion* (1887, collotypes).
- **Digital Commonwealth.** The ark links below work. The website now sits behind a bot check, so the record fields were read through the Commons mirror and by the research agent before the check.
- **Rights, verbatim from the BPL record:**
  - "No known copyright restrictions."
  - "No known restrictions on use."
  - rightsstatements.org "No Copyright - United States" (NoC-US).
- **Wikimedia Commons mirror.** Files are named `File:Animal locomotion. Plate N (Boston Public Library).jpg`, and the API reports "Public domain".
  - Checked for plates 1, 706 and 755. Each description quotes the BPL record: e.g. plate 706 "BPLDC no.: 08_11_000674 … Creator: Muybridge, Eadweard, 1830-1904 … Copyright Date: 1887".
  - **The BPLDC number is not the plate number.** Record the BPLDC number as the record ID.
- **Resolution.** BPL's IIIF images are about 4950–5045 × 3900–4010 px.
  - Pattern: `https://iiif.digitalcommonwealth.org/iiif/2/commonwealth:<image-id>/full/full/0/default.jpg`. Only `/full/1400,/` was fetched; the full size is **(unverified)**.
  - Commons copies are 1500 px wide, or about 3000–3300 px for plates 1, 6, 13, 62, 64, 88, 109, 111, 236 and 249.
- **Other holders not checked:** Library of Congress, Wellcome Collection, NYPL, Getty and Smithsonian were not read (§9). Pick BPL: it has one clear statement and the largest scans.

### 2.2 Birds: no goose

Muybridge photographed **no goose, duck or crane** by name. The only waterfowl are swans, in group plates 776–780 ("Storks; swans, etc."). The catalogue gives those plates "no record of intervals of time", and plates 776 and 779 (viewed) are isolated scenes, mostly swimming. Useful bird plates, all BPL:

| Plate | Catalogued title | Record (ark) | Views; cycle fraction; interval | Frame layout |
|---|---|---|---|---|
| 755 | Pigeon; flying | [70796b86w](https://ark.digitalcommonwealth.org/ark:/50959/70796b86w), BPLDC 08_11_000746, [Commons image](https://upload.wikimedia.org/wikipedia/commons/7/74/Animal_locomotion._Plate_755_%28Boston_Public_Library%29.jpg) | 12 lateral + 12 front; 1¾; **19 ms** | Seen: row 1 is 12 laterals numbered **12→1 left to right** (reads right to left); rows 2–3 are front views |
| 756 | Pigeon; flying | [70796b88f](https://ark.digitalcommonwealth.org/ark:/50959/70796b88f) | 12 lat + 12 front; 2; 21 ms | not viewed |
| 757 | Pigeon; flying | [70796b90g](https://ark.digitalcommonwealth.org/ark:/50959/70796b90g) | 12 lat + 12 rear; 1½; 20 ms | not viewed |
| 758 | Cockatoo; flying | [70796b921](https://ark.digitalcommonwealth.org/ark:/50959/70796b921) | 24 lat; 2; 28 ms | not viewed |
| 765 | Vulture; flying | [70796c065](https://ark.digitalcommonwealth.org/ark:/50959/70796c065) | 24 lat; 1¼; 19 ms | not viewed |
| 768 | Vulture; flying | [70796c129](https://ark.digitalcommonwealth.org/ark:/50959/70796c129) | 12 lat + 12 rear; 1¼; 40 ms | not viewed |
| 772 | Ostrich; walking | [70796c200](https://ark.digitalcommonwealth.org/ark:/50959/70796c200) | 12 lat + 12 rear; 1; 91 ms | Seen: 4×6 grid, rows 1–2 lateral |
| 774 | Adjutant; walking | [70796c243](https://ark.digitalcommonwealth.org/ark:/50959/70796c243) | 12 lat; ⅝; no interval recorded | not viewed |

Other bird plates in the catalogue, with no item pages pulled:
- 759–762 Cockatoo, flying
- 763 Red-tailed hawk
- 764 Fish hawk
- 766–767 Vulture
- 769–771 American eagle, including "near the ground"
- 773 Ostrich running
- 775 Adjutant "flying run"

The vulture and eagle are the closest stand-ins for a large bird's slow stroke. The **adjutant (a stork) walking and its "flying run"** are the closest Muybridge comes to a big long-legged bird walking or taking off.

### 2.3 Dogs

| Plate | Catalogued title | Record (ark) | Views; fraction; interval | Layout |
|---|---|---|---|---|
| **706** | Dog; trotting; interrupted; mastiff. Smith | [707969402](https://ark.digitalcommonwealth.org/ark:/50959/707969402), BPLDC 08_11_000674, [Commons image](https://upload.wikimedia.org/wikipedia/commons/8/85/Animal_locomotion._Plate_706_%28Boston_Public_Library%29.jpg) | **12 lateral only**; 1½; **110 ms** | Seen: 2 rows × 6, numbered **1–12 left to right**, dog facing right |
| **708** | Dog; galloping; brown racing hound. Ike | [707969445](https://ark.digitalcommonwealth.org/ark:/50959/707969445) | 10 lat + 10 rear; 1¼; 43 ms | Seen: 2 rows × 5 laterals, then 1 row × 10 rear |
| 709 | Dog; galloping; white racing hound. Maggie | [70796946q](https://ark.digitalcommonwealth.org/ark:/50959/70796946q) | 12 lat + 12 rear; 1½; 41 ms | not viewed |
| 710 | Dog; galloping; white racing hound. Maggie | [707969488](https://ark.digitalcommonwealth.org/ark:/50959/707969488) | 12 lat + 12 rear; 2; 49 ms | not viewed |
| 707 | Dog; galloping; interrupted; mastiff. Dread | [70796942m](https://ark.digitalcommonwealth.org/ark:/50959/70796942m) | 8 lat + 8 rear; 1; no interval | not viewed |

**Plates with no side view, so not useful for a side-view walk or jump:**
- 703 and 704 (mastiff "Dread" walking): oblique front and rear only, no interval.
- 705 (trotting, interrupted): oblique only, no interval.
- 712 (jumping hurdle): oblique only, no interval.

The catalogue says "racing hound", never "greyhound". Commons has animated GIFs built from 710 ([Dog_galloping.gif](https://commons.wikimedia.org/wiki/File:Dog_galloping.gif)) and 707, marked Public domain.

### 2.4 Humans

All plates have a lateral row on top; "N" means nude and "PC" means pelvis cloth, as in the catalogue.

| Plate | Catalogued title | Record (ark) | Views; fraction; interval | Layout |
|---|---|---|---|---|
| **1** | Walking (model 36, N) | [70795t76c](https://ark.digitalcommonwealth.org/ark:/50959/70795t76c), BPLDC 08_11_000001, [Commons image](https://upload.wikimedia.org/wikipedia/commons/e/e3/Animal_locomotion._Plate_1_%28Boston_Public_Library%29.jpg) | lat, front, rear × 12; ⅝; **69 ms** | Seen: 3 rows × 12 (side, front, rear) |
| 6 | Walking (model 22, N) | [70795t842](https://ark.digitalcommonwealth.org/ark:/50959/70795t842) | 12 lat only; ⅝; 75 ms | not viewed |
| 13 | Walking (female model 1, N) | [70795x34g](https://ark.digitalcommonwealth.org/ark:/50959/70795x34g) | lat, front, rear × 12; 1; 95 ms | not viewed |
| 60 | Running at a half mile gait (37, PC) | [707964002](https://ark.digitalcommonwealth.org/ark:/50959/707964002) | 10 lat + 10 front; ⅝; 42 ms | not viewed |
| 62 | Running full speed (37, N) | [70795v02s](https://ark.digitalcommonwealth.org/ark:/50959/70795v02s) | 12 lat + 12 rear; 1; 41 ms | not viewed |
| 64 | Running full speed (33, N) | [70795v06w](https://ark.digitalcommonwealth.org/ark:/50959/70795v06w) | 12 lat + 12 rear; ⅝; 28 ms | not viewed |
| 88 | Ascending stairs (36, N) | [70795v228](https://ark.digitalcommonwealth.org/ark:/50959/70795v228) | lat, front, rear × 11; 1; 128 ms | Seen: 3 × 11 |
| 109 | Ascending step-ladder (26, N) | [70795v30z](https://ark.digitalcommonwealth.org/ark:/50959/70795v30z) | 12 lat + 12 rear; 1; 108 ms | not viewed |
| 111 | Ascending ladder (30, N) | [70795v32h](https://ark.digitalcommonwealth.org/ark:/50959/70795v32h) | 11 lat + 11 rear; ½; 95 ms, "a double interval of time between phases 5 and 6" | not viewed |
| 152 | Running straight high jump (37, PC) | [707964045](https://ark.digitalcommonwealth.org/ark:/50959/707964045) | 12 lat + 12 front; 1; 87 ms | not viewed |
| 159 | Running broad jump (37, PC) | [70796412v](https://ark.digitalcommonwealth.org/ark:/50959/70796412v) | 12 lat + 12 front; 1; 95 ms | not viewed |
| 161 | Standing high jump (40, PC) | [70796416z](https://ark.digitalcommonwealth.org/ark:/50959/70796416z) | 12 lat + 12 rear-oblique; 1; 139 ms | not viewed |
| **162** | Standing broad jump (40, PC) | [70796418h](https://ark.digitalcommonwealth.org/ark:/50959/70796418h) | 12 lat + 12 rear-oblique; 1; **156 ms** | Seen: 2 × 12, side row on top |
| **236** | Placing chair and sitting down (31, N) | [70795v627](https://ark.digitalcommonwealth.org/ark:/50959/70795v627) | 12 lat + 12 front; 1; **183 ms** | Seen: 2 × 12; the action appears to run right to left (frame numbers unreadable at 1400 px) |
| 249 | Rising from chair (31, N) | [70795v64s](https://ark.digitalcommonwealth.org/ark:/50959/70795v64s) | 10 lat + 10 front; 1; 92 ms | not viewed |

### 2.5 Muybridge's timing, and what it gives us

**The source.** Muybridge, *Animal Locomotion … Prospectus and Catalogue of Plates* (Philadelphia: Lippincott, 1887).
- Copies: [Penn Archives record](https://archives.upenn.edu/digitized-resources/docs-pubs/muybridge/catalogue) with a [PDF](https://archives.upenn.edu/wp-content/uploads/2018/01/muybridge-animal-locomotion-catalogue.pdf); a Cornell copy on [Internet Archive](https://archive.org/details/cu31924024580353).
- The OCR of the tables is unusable, so the values above were read from page images.

**What the "Time" column means.** It gives "the interval of time between each successive exposure … in one-thousandth parts of a second, as recorded by a chronograph with a tuning-fork making 100 single vibrations in a second."
- So 110 means 0.110 s between frames, i.e. 9.1 fps.
- The catalogue's reference notes say when no interval was recorded ("No record of intervals of time between phases") or when frames are "Isolated phases of motion from a single point of view".

**Cycle times (COMPUTED).** Formula: (frames − 1) × interval ÷ the catalogue's cycle fraction. Treat these as ±15%, because the catalogue's fractions (⅝, 1¼…) are approximate.

| Plate | Motion | Source fps | Cycle (COMPUTED) | Our preset |
|---|---|---|---|---|
| 1 / 6 / 13 | Human walk | 14.5 / 13.3 / 10.5 | 1.21 / 1.32 / 1.05 s | `human.walk` 1.0 s |
| 60 | Run, "half mile gait" | 23.8 | 0.60 s | `human.run` 0.67 s |
| 62 / 64 | Run, full speed | 24.4 / 35.7 | 0.45 / 0.49 s | (no sprint) |
| 706 | Mastiff trot | 9.1 | 0.81 s | `dog.trot` 0.67 s |
| 708 / 709 / 710 | Hound gallop | 23–24 / 24.4 / 20.4 | 0.31 / 0.30 / 0.27 s | (no gallop) |
| 755 / 756 / 757 | Pigeon wingbeat | 53 / 48 / 50 | 0.119 / 0.116 / 0.147 s, i.e. 6.8–8.7 Hz | — |
| 758 / 765 | Cockatoo / vulture wingbeat | 36 / 53 | 0.32 / 0.35 s, i.e. about 3 Hz | — |
| 162 | Standing broad jump, whole action | 6.4 | 12 frames = 1.72 s | `human.jump` 1.0 s |
| 236 | Placing chair and sitting | 5.5 | 12 frames = 2.0 s | `human.sit` 2.0 s (12 @ 6) |

**Cross-checks.**
- The pigeon figure agrees with Marey's own measurement of 8 beats per second for the pigeon (§2.6).
- The 1.05–1.32 s human walk agrees with the Fukuchi stride period of about 1.03 s (§3.2) at the faster end.

**Converting to our fps.** Multiply the cycle time by our `fps` to get `frames`. Pick source frames nearest to each of our frame times; don't assume one-to-one.

### 2.6 Marey

- ***Chronophotograph of a Flying Heron*.**
  - Étienne-Jules Marey, c. 1883–87, gelatin silver print.
  - Cleveland Museum of Art, Dudley P. Allen Fund, accession **2009.349**: [clevelandart.org/art/2009.349](https://clevelandart.org/art/2009.349).
  - Rights: Open Access `share_license_status` "CC0".
  - Image: [TIFF 5103×2034](https://openaccess-cdn.clevelandart.org/2009.349/2009.349_full.tif).
  - About 12 overlapping positions on one plate, flying left to right and climbing. The exposure rate is **(unverified)**, so use it for wing silhouettes, not timing.
- ***Physiologie du mouvement : le vol des oiseaux*** (Paris, 1890).
  - Getty Research Institute scan: [archive.org/details/gri_33125008636926](https://archive.org/details/gri_33125008636926), "NOT_IN_COPYRIGHT".
  - **p. 100, §69:** his own measurements, wing strokes per second, from muscle tracings: sparrow 13, **duck 9**, **pigeon 8**, harrier 5¾, barn owl 5, buzzard 3.
  - **p. 24, §20:** figures quoted from other authors: stork 1¾, gull 3½, pelican 1⅙ ("soit 70 par minute").
  - **The gull:** it "ne donne que 3 1/2 battements d'ailes par seconde en plein vol" and about 5 at take-off. A full gull cycle is "1/5 de seconde environ" in his 50 images-per-second series (gull figures 75–79 at 10, 25 and 50 images per second).
- ***Movement*** (English edition, 1895): [archive.org/details/movement00mare](https://archive.org/details/movement00mare), "NOT_IN_COPYRIGHT". Here the sparrow is 12 strokes a second rather than 13; pigeon 8, buzzard 3.

## 3. Published numbers we can turn into parameters

### 3.1 Dog: Maes et al. 2008

Maes L.D., Herbin M., Hackert R., Bels V.L., Abourachid A. (2008). "Steady locomotion in dogs: temporal and associated spatial coordination patterns and the effect of speed." *J Exp Biol* 211:138–149. [doi:10.1242/jeb.008243](https://doi.org/10.1242/jeb.008243). Read from the [publisher PDF](https://journals.biologists.com/jeb/article-pdf/211/1/138/1262882/138.pdf).

**Licence.** The PDF says "Published by The Company of Biologists 2008". The publisher's [User Licence 1.1](https://www.biologists.com/user-licence-1-1/) allows free reading but not commercial reuse of the text and figures. **Facts only**: do not copy the figures.

**Subjects.** "withers height=0.61±0.02 m, body mass=28.0±2.4 kg" (5 malinois). Speeds "from 0.4 to 10.0 m s–1".

**Lags (Methods).** "FL = time between the f1 and f2 footfalls; HL = the time between the h1 and h2 footfalls; and PL = the time between the f1 and h1 footfalls, as a percentage of f1 cycle duration."

**Table 2, lags as % of cycle:**

| Gait | FL | HL | PL |
|---|---|---|---|
| Lateral walk | 51±3 | 50±4 | 84±5 |
| Trot | 51±3 | 49±4 | 50±4 |
| Pace | 51±3 | 50±3 | 96±3 |
| Transverse gallop | 29±4 | 20±4 | 63±9 |
| Slow rotary gallop | 21±3 | −18±3 | 76±6 |
| Fast rotary gallop | 18±1 | −15±2 | 68±3 |

**What PL means for us.** A walk PL of 84% puts the same-side hindfoot 84% after the forefoot. Put the other way round, the forefoot lands **16%** of a cycle after its hindfoot. In our rig the forefoot phase minus the hind phase on the same side must equal 0.16; today it is 0.25. A trot PL of 50% means diagonal pairs land together, which `dog.trot.phases` already does.

**Appendix 1, "All gaits (N=486)"**, u in m/s:
- cycle duration D = 0.383 + 1.168·e^(−u) s
- duty factor DF = 0.652 − 0.210·ln u
- stride length L = 0.489 + 0.297·u m

**Other results.**
- Duty factor "fell below 50%… for speeds exceeding 2.0 m s–1 (approximately Fr=0.7)".
- Cycle duration stops falling at about 4 m/s (about Fr 2); above that, dogs go faster by lengthening the stride.

**COMPUTED from the fits, with our dog at 1 unit ≈ 1.88 cm** (withers 32.5 units = 0.61 m):

| Speed | Cycle D | Duty | Stride L | L in units | Our sweep `stride` = L × duty |
|---|---|---|---|---|---|
| 0.43 m/s (our current walk speed) | 1.14 s | 0.83 | 0.62 m | 33 | — |
| 1.0 m/s (walk) | 0.81 s | 0.65 | 0.79 m | 42 | 27 |
| 2.0 m/s (slow trot) | 0.54 s | 0.51 | 1.08 m | 58 | 29 |
| 2.5 m/s (trot) | 0.48 s | 0.46 | 1.23 m | 65 | 30 |
| 4.0 m/s (gallop) | 0.40 s | 0.36 | 1.68 m | 89 | — |

The fits pool all gaits, so the duty at 1 m/s is a walking value and the duty at 2.5 m/s a trotting one. Check this against the gait ranges plotted in the paper's Fig. 2 before relying on it.

### 3.2 Human: Fukuchi et al. 2018 and 2017, Mainka et al. 2023

**Walking.** Fukuchi C.A., Fukuchi R.K., Duarte M. (2018). "A public dataset of overground and treadmill walking kinematics and kinetics in healthy individuals." *PeerJ* 6:e4640. [doi:10.7717/peerj.4640](https://doi.org/10.7717/peerj.4640).
- Data: [figshare 5722711](https://doi.org/10.6084/m9.figshare.5722711).
- Licence: "©2018 Fukuchi et al. … https://creativecommons.org/licenses/by/4.0/", and figshare also says CC BY 4.0. **Attribution required.**
- The paper shows angles only as figures. The numbers below were **COMPUTED** from the dataset's `*walkOCang.txt` and treadmill force files, and are not printed in the paper.

**Speeds** (`WBDSinfo.csv`, young adults n=24, overground):

| Condition | Speed (m/s) |
|---|---|
| Slow | 0.88 ± 0.11 |
| Comfortable | 1.24 ± 0.14 |
| Fast | 1.58 ± 0.18 |

**Joint-angle peaks, comfortable speed, as % of the gait cycle:**

| Joint | Peaks |
|---|---|
| Hip | flexion 31.9° at 89%; extension −7.7° at 54% |
| Knee | loading flexion 14.7° at 13%; swing flexion 62.2° at 73% |
| Ankle | dorsiflexion 13.2° at 45%; plantarflexion −13.0° at 65% |

**Curves at 5% steps (0–100%), comfortable speed:**
- hip: 30.5, 29.9, 28.8, 24.1, 18.6, 13.2, 7.7, 3.0, −1.0, −4.4, −6.9, −7.7, −4.2, 4.0, 13.9, 22.3, 27.9, 31.1, 31.9, 30.7, 30.2
- knee: 0.1, 6.2, 13.5, 14.3, 12.0, 9.1, 6.2, 4.3, 3.5, 4.5, 8.3, 15.8, 30.0, 47.9, 59.9, 61.7, 54.0, 38.8, 19.4, 2.4, −0.2
- ankle: 0.9, −4.4, −1.9, 2.5, 5.3, 7.1, 8.7, 10.4, 12.2, 13.2, 12.1, 6.5, −6.2, −13.0, −7.2, 0.2, 5.0, 6.4, 4.4, 1.4, 1.1

**Treadmill force data.** Duty factor 0.59–0.62 per foot, double support about 15–20%, stride period 0.84–1.20 s (mean about 1.03 s).

**Running.** Fukuchi R.K., Fukuchi C.A., Duarte M. (2017). "A public dataset of running biomechanics and the effects of running speed on lower extremity kinematics and kinetics." *PeerJ* 5:e3298. [doi:10.7717/peerj.3298](https://doi.org/10.7717/peerj.3298).
- Data: figshare 4543435, CC BY 4.0. **Attribution required.**
- **Table 4** (28 runners):

| Measure | 2.5 m/s | 3.5 m/s | 4.5 m/s |
|---|---|---|---|
| Stride length (m) | 1.86 | 2.46 | 2.96 |
| Cadence (strides/min) | 80.8 | 85.7 | 91.7 |
| Max hip flexion | 43.8° | 52.8° | 60.5° |
| Max knee flexion | 93.5° | 108.7° | 119.1° |

- **Duty factor, COMPUTED from the force files:** about 0.36 at 2.5 m/s, 0.32 at 3.5 m/s, 0.31 at 4.5 m/s.

**Arm swing.** Mainka T., Lauermann M., Ebersbach G. (2023). "Arm swing deviations in patients with Parkinson's disease at different gait velocities." *J Neural Transm* 130:655–661. [doi:10.1007/s00702-023-02619-4](https://doi.org/10.1007/s00702-023-02619-4), CC BY 4.0.
- Table 2, healthy controls: at preferred speed (1.28 m/s, 111 steps/min, stride 1.34 m) the arm-swing range is 46.9° / 58.1° (weaker / stronger arm).
- Measured with wrist sensors on older adults (mean age 64.5). Treat it as a rough range, not a joint angle.

### 3.3 Goose and duck walking

**Head-bob.** Wang et al. (2025). "Study on the characteristics of head and neck movements of geese walking in a straight line at different speeds." *Front Vet Sci* 12:1554240. [doi:10.3389/fvets.2025.1554240](https://doi.org/10.3389/fvets.2025.1554240) ([PMC12162510](https://pmc.ncbi.nlm.nih.gov/articles/PMC12162510/)).
- Licence: "This is an open-access article distributed under the terms of the Creative Commons Attribution License (CC BY)". **Attribution required.**
- Subject: one "2-year-old Chinese domestic goose that weighed about 4 kg".
- Findings: "domestic geese exhibit nodding behavior similar to other birds, comprising thrust and hold phases".
  - "The stage from 11 to 73% of the half a gait cycle represents the thrust phase", which is 62% of a step, so the hold is about 38%.
  - "In a complete step, the thrust phase is always longer than the hold phase."
- No stride length, hip height or duty factor is reported.

**Duty factor and stride time.** Han et al. (2023). "Effects of the speed on the webbed foot kinematics of mallard (Anas platyrhynchos)." *PeerJ*. [doi:10.7717/peerj.15362](https://doi.org/10.7717/peerj.15362) ([PMC10194065](https://pmc.ncbi.nlm.nih.gov/articles/PMC10194065/)), CC BY 4.0.
- Table 2:

| Measure | Walking | Grounded running |
|---|---|---|
| Speed | 0.60 m/s | 1.26 m/s |
| Stride duration | 0.59 s | 0.37 s |
| Stride length | 0.34 m | 0.46 m |
| Duty factor | 0.74 | 0.62 |

- The walk–run transition is "between 0.73 and 0.93 m/s". Duty factor never fell below 0.5.
- No roll (waddle) angle is reported.

**Duty factor vs speed for birds.** Bishop P.J. et al. (2018). "The influence of speed and size on avian terrestrial locomotor biomechanics: predicting locomotion in extinct theropod dinosaurs." *PLoS One*. [doi:10.1371/journal.pone.0192172](https://doi.org/10.1371/journal.pone.0192172), CC BY 4.0.
- Table 3: duty factor β = 0.5278·v*^(−0.3651), with v* = v/√(g·h) and h the hip height.
- **COMPUTED by inverting it:**

| Our preset | Duty | Implied v* | Reading |
|---|---|---|---|
| `goose.walk` | 0.62 | about 0.64 | |
| `goose.run`, `rush` | 0.42 | about 1.9 | a sprint, beyond the grounded running a goose does |
| mallard walking | 0.74 | about 0.40 | |

### 3.4 Goose flight

**Wind-tunnel kinematics.** Meir J.U. et al. (2019). "Reduced metabolism supports hypoxic flight in the high-flying bar-headed goose (Anser indicus)." *eLife* 8:e44986. [doi:10.7554/eLife.44986](https://doi.org/10.7554/eLife.44986) ([PMC6721836](https://pmc.ncbi.nlm.nih.gov/articles/PMC6721836/)).
- **Licence:** "This is an open-access article, free of all copyright, and may be freely reproduced, distributed, transmitted…" (CC0).
- **Wingbeat:** "mean 4.97 ± 0.27 Hz in normoxia" (the supplementary table gives 4.97 ± 0.14).
- **[Supplementary file 4](https://cdn.elifesciences.org/articles/44986/elife-44986-supp4-v1.docx)**, normoxia, read from the file:
  - downstroke period 116.3 ± 3.8 ms; upstroke 85.6 ± 3.2 ms
  - **downstroke fraction 0.576** (COMPUTED)
  - stroke-plane amplitude 73.4 ± 5.2° down / 72.1 ± 5.8° up
  - stroke-plane angle 75.3° / 71.0°
- **Speeds:** wind-tunnel birds flew 12.5–15 m/s; wild birds 17.1 m/s.
- **This settles an open item:** motion-data-sources.md §8 could not say whether the related Dryad dataset includes wingbeat frequency. The paper does report it.

**Cruising airspeeds.** Pennycuick C.J., Åkesson S., Hedenström A. (2013). "Air speeds of migrating birds observed by ornithodolite and compared with predictions from flight theory." *J R Soc Interface* 10:20130419 ([PMC3730693](https://pmc.ncbi.nlm.nih.gov/articles/PMC3730693/)), CC BY 3.0.
- Table 1: greylag 3.65 kg, span 1.60 m, 19.0 m/s; barnacle 1.70 kg, 1.34 m, 17.4 m/s; mute swan 17.5 m/s.
- No wingbeat frequencies are given. These numbers are useful only for scrolling speed in a flight scene.

**Take-off vs cruise.** Marey's gull, 3½ Hz in level flight and about 5 Hz at take-off (§2.6), is the only primary take-off frequency found. No goose take-off kinematics were accessible (§9).

### 3.5 Dynamic similarity (Froude scaling)

**The idea.** Animals of different size move alike at equal Froude number Fr = v²/(g·h), with h the hip height. Alexander (1984, [doi:10.1177/027836498400300205](https://doi.org/10.1177/027836498400300205)) states this in the abstract; the paper itself is closed access.

**The equation is unverified.** The relative-stride equation usually quoted, λ/h ≈ 2.3·Fr^0.3 (Alexander & Jayes 1983, [doi:10.1111/j.1469-7998.1983.tb04266.x](https://doi.org/10.1111/j.1469-7998.1983.tb04266.x)), could not be read in a primary source, so it is **(unverified)**.

**A cross-check that does not depend on it.** At 1 m/s the Maes dogs (h about 0.6 m, Fr about 0.17) cover 1.29 withers heights per stride. That equation would predict 1.34, so the two agree. The practical rule needs no constants: when you scale a figure's legs, keep stride ÷ leg length and cycle time × √(g / leg length) constant.

## 4. Our presets against the literature

**How the "ours" numbers were computed.** Cycle = frames ÷ fps. Distance per cycle = `stride` ÷ `duty` (the engine's `speed` = stride ÷ (duty × cycle), src/core/motion.js:125).

**Leg lengths, hip joint to ankle, from figures/*.json:**

| Figure | Leg length | Ground height of the joint |
|---|---|---|
| goose | 17.8 units | hip 18.5 above ground |
| dog | hind 32.4 units | withers 32.5 |
| human | 37.1 units | hip 41.5 above ground |

**Comparison:**

| Motion | Ours: cycle / duty / distance per cycle | Literature | Verdict |
|---|---|---|---|
| `dog.walk` | 1.0 s / 0.65 / 23 u (0.71 withers) | 1 m/s: 0.81 s / 0.65 / 1.29 withers (Maes fits); forefoot lands 16% after hindfoot (Table 2), ours 25% | Duty right; steps far too short and a bit slow; footfall offset too large |
| `dog.trot` | 0.67 s / 0.45 / 38 u (1.16 withers); 1.1 m/s at scale | 2–2.5 m/s: 0.48–0.54 s / 0.46–0.51 / 1.8–2.0 withers. Mastiff plate 706: about 0.81 s | Duty right; too slow and too short for a trot |
| `goose.walk` | 0.8 s / 0.62; head `steady` 0.6, no `hold` | Mallard walk duty 0.74 at 0.59 s (a 1 kg duck; a 4 kg goose should be slower); goose holds the head about 38% of each step | Raise duty; add `hold: 0.38` |
| `goose.run` / `rush` | 0.5 / 0.43 s, duty 0.42 (flight phase) | Waterfowl run without a flight phase: duty 0.62 (mallard); duty never < 0.5 | Raise duty to 0.55–0.6 |
| `goose.flap` / `rush` wings | 6 Hz / 7 Hz; symmetric; swing 50° | Cruise 4.97 Hz, downstroke 58%, amplitude about 73° (bar-headed); take-off about 1.4× cruise (Marey gull) | Fine for take-off; a cruise `fly` should be 5 Hz with a longer downstroke |
| `human.walk` | 1.0 s / 0.6 / 43 u | 1.03 s / 0.59–0.62 / 1.28–1.34 m, about 62–65 u at 1.7 m tall (assumed). Hip 32/−8°, knee swing 62° (Fukuchi) | Timing and duty right; stride about 30% short. Mesh2motion.md §5.3 found its angles close |
| `human.run` | 0.67 s / 0.38 / 68 u | 2.5 m/s: 0.74 s / about 0.36 / 1.86 m (about 90 u) | Slightly shorter cycle, slightly high duty, stride short |
| `human.walk.armSwing` | 20 (measured upper arm −24..16°, mesh2motion.md §5.3) | Range about 47–58° at preferred speed (older adults, wrist sensors) | Possibly low; try 25 and judge by eye |
| `human.jump` | 1.0 s | Plate 162 standing broad jump: 1.72 s over 12 frames, including preparation | Ours is snappier, which suits a game; no change |

**Caveats on the stride changes.** The longer strides proposed for `dog.walk`, `dog.trot` and `human.walk` push the planted-foot sweep toward 0.8–0.9 of leg length. The engine reports when a foot target is out of reach. If it does, lower `reach` or accept a shorter stride with a matching drop in `speed`; don't change `duty`.

## 5. Animation-craft references

**Free-licence items that can be used directly:**
- **Muybridge animations on Commons**, all marked Public domain:
  - [Muybridge_race_horse_animated.gif](https://commons.wikimedia.org/wiki/File:Muybridge_race_horse_animated.gif) (plate 626)
  - [Muybridge_horse_walking_animated.gif](https://commons.wikimedia.org/wiki/File:Muybridge_horse_walking_animated.gif)
  - [Descriptive_Zoopraxography_046_walkcycle.gif](https://commons.wikimedia.org/wiki/File:Descriptive_Zoopraxography_046_walkcycle.gif) (1893)
  - [Muybridge_human_male_walking_animated.gif](https://commons.wikimedia.org/wiki/File:Muybridge_human_male_walking_animated.gif) (made from plate 2 by Jjkutch)
  - the dog GIFs in §2.3
- **CC BY 3.0 walk-cycle GIFs:**
  - [Walk-Cycle.gif](https://commons.wikimedia.org/wiki/File:Walk-Cycle.gif), "Persian Poet Gal".
  - [4-frame-walk-cycle.gif](https://commons.wikimedia.org/wiki/File:4-frame-walk-cycle.gif), "Ajaykarat". Its description points to devilsgarage.com as the source, so its provenance is weak and it's better avoided.
- **Blender Studio.** Its [terms](https://studio.blender.org/terms-and-conditions/) say: "Unless notified otherwise, all digital content (webpages, video, artwork, 3D data) … is available under the Creative Commons Attribution 4.0". The walk-cycle lesson "Walking Vanilla P.1" shows "License CC-BY" but needs a login. It is CC BY, but not free to access.

**Facts only (share-alike, so it fails for images):**
- Hildebrand-style gait graphs on Commons: [Gait_graphs_v2.png](https://commons.wikimedia.org/wiki/File:Gait_graphs_v2.png) and [Gait_diagram_with_formulas.jpg](https://commons.wikimedia.org/wiki/File:Gait_diagram_with_formulas.jpg), both CC BY-SA 4.0.
- The Blender walk-cycle GIFs on Commons, CC BY-SA.
- [Wikibooks: Traditional Principles of Animation](https://en.wikibooks.org/wiki/Traditional_Principles_of_Animation): "Text is available under the Creative Commons Attribution-ShareAlike License".
- No CC-BY or CC0 open textbook on walk cycles was found.

**Copyrighted books (facts only).** Catalogue data comes from Open Library and the publisher; the LoC and Dover sites refused automated access.
- **Williams, *The Animator's Survival Kit*:** expanded ed., Faber and Faber, 2009, ISBN 9780571238347.
- **Blair, *Cartoon Animation*:** Walter Foster, 1994; revised edition 2020 ([Quarto page](https://www.quarto.com/books/9781633228900/cartoon-animation-with-preston-blair-revised-edition)).
- **Dover's Muybridge selections:** *Animals in Motion* (1957, "edited by Lewis S. Brown"; LCCN 57004552) and *The Human Figure in Motion* (1955).
  - The plates in them are the 1887 public-domain images, but the editor's text, selection and layout may carry new copyright **(unverified)**.
  - Work from the BPL scans, never from a Dover page.

## 6. Video (frame-by-frame measurement)

Licence, creator, resolution, frame rate and duration below come from the Commons API (`extmetadata`, file metadata) and the page wikitext. None of these clips was watched for this report, so the camera angle and the gait shown are **(unverified)** beyond the title and description.
- **Record ID:** the file name.
- **Direct media URL:** `https://upload.wikimedia.org/wikipedia/commons/<x>/<xy>/<File_name>`, as returned by `prop=imageinfo&iiprop=url`.

**Geese**

| File (Commons) | Licence verbatim / tag | Attribution line | Creator, date | Res, fps, duration | Shows |
|---|---|---|---|---|---|
| [Uppflog - Ystad 2026.webm](https://commons.wikimedia.org/wiki/File:Uppflog_-_Ystad_2026.webm) | "This file is licensed under the Creative Commons Attribution 4.0 International license." | "Foto: Jonn Leffmann / Wikipedia" | Jonn Leffmann, 2026 | 1920×1080, 59.94 fps, 18.75 s | Greylag take-off. **Best take-off reference** |
| [Kanadagänse am Untreusee … C1646.webm](https://commons.wikimedia.org/wiki/File:Kanadag%C3%A4nse_am_Untreusee_im_Sonnenlicht_20250918_C1646.webm) | `{{self\|cc-by-4.0}}` | "PantheraLeo1359531, CC BY 4.0" | 2025-09-18 | 3840×2160, 59.94 fps, 7.5 s | Canada geese flying |
| [Canada geese (Branta canadensis) in flight.webm](https://commons.wikimedia.org/wiki/File:Canada_geese_(Branta_canadensis)_in_flight.webm) | `{{cc-by-2.0}}` (Flickr review 2016-01-26) | "tuchodi, CC BY 2.0" | 2015-10-25 | 1920×1080, 23.976 fps, 26.3 s | Flight; stabilised by the uploader |
| [Canada Geese (25738746322).webm](https://commons.wikimedia.org/wiki/File:Canada_Geese_(25738746322).webm) | `{{PD-USGov-FWS}}`: "As a work of the U.S. federal government, the image is in the public domain." | none required (courtesy: "David Ellis/USFWS") | USFWS, 2016-03-17 | 1920×1080, 23.976 fps, 21.8 s | Not reviewed |
| [Canada Geese on Trail Camera (50222797812).webm](https://commons.wikimedia.org/wiki/File:Canada_Geese_on_Trail_Camera_(50222797812).webm) | `{{PD-USGov-FWS}}` | none (courtesy: USFWS) | 2020-08-13 | 1280×720, 30 fps, 10 s | Fixed camera, grazing and walking |
| [Canada goose (Branta canadensis) family.webm](https://commons.wikimedia.org/wiki/File:Canada_goose_(Branta_canadensis)_family.webm) | `{{PD-USGov-FWS}}`, also a cc-by-2.0 review | credit "Courtney Celley/USFWS" anyway | 2016-06-07 | 1920×1080, 29.97 fps, 46.7 s | Family foraging |
| [Canada goose family.webm](https://commons.wikimedia.org/wiki/File:Canada_goose_family.webm) | `{{self\|cc-zero}}` | none | Packer1028, 2024-04-20 | 1280×720, 29.97 fps, 8.3 s | Parents and gosling |
| [Grågås (Anser anser) Ystad 2016.ogv](https://commons.wikimedia.org/wiki/File:Gr%C3%A5g%C3%A5s_(Anser_anser)_Ystad_2016.ogv) | `{{Cc-by-3.0}}` | "Foto: Jonn Leffmann" | 2016 | 640×480, 29.97 fps, 67 s | Greylag grazing and walking |

No PD/CC0/CC-BY goose landing clip was found. The flying-goose clips from Stichting Natuurbeelden and several others on Commons are CC BY-SA, which fails our rule.

**Dogs**
- **[Hurdle Jumping by Trained Dogs (1899)](https://commons.wikimedia.org/wiki/File:Hurdle_Jumping_by_Trained_Dogs_-_1899_-_American_Mutoscope_and_Biograph_(US)_-_EYE_FLM75062_-_OB_685436.ogv)**
  - `{{PD-US}}`; from EYE Filmmuseum / Open Beelden.
  - 720×404, 66 s. The 25 fps is the transfer rate; the original cranking speed is unknown.
- **[Military Working Dog Training (1018153).webm](https://commons.wikimedia.org/wiki/File:Military_Working_Dog_Training_(1018153).webm)**
  - `{{PD-USGov-Military-Army}}`, DVIDS 1018153.
  - 1080p, 29.97 fps, 60 s.
- **[A Happy Dog on a Papuan Beach.webm](https://commons.wikimedia.org/wiki/File:A_Happy_Dog_on_a_Papuan_Beach.webm)**
  - CC BY 4.0, "Joaquim Baeta".
  - 1080p, 23.976 fps.
- The best gallop clip found, `Slow_motion_of_running_greyhound.webm`, is CC BY-SA 4.0 and fails. Use Muybridge 708–710 instead.

**Humans**
- **Marey & Comte, 1900**, `{{PD-US-expired}}`, side view, about 25 fps transfers:
  - [long jump](https://commons.wikimedia.org/wiki/File:Saut_en_longueur_par_Sweeney_(champion_americain)_%C3%A0_la_station_physiologique_(1900).webm), 1828×1012
  - [hurdles](https://commons.wikimedia.org/wiki/File:Saut_de_haie_par_l%27americain_Alvin_Kraenzlein_(1900).webm), 1920×1000
- **[Walking in the sands.webm](https://commons.wikimedia.org/wiki/File:Walking_in_the_sands.webm)**: CC BY 3.0, "sgu18ify", 720p, 30 fps.
- **Climbing and sitting:** no free-licence video was found. Use Muybridge 88, 109, 111, 236 and 249.

## 7. Turning each resource type into our data

### 7.1 A plate or video frame becomes `tracks` or tuned parameters

1. **Pick frames.**
   - Take one lateral row. Order it by the plate's own numbering, not by position: plate 755 reads 12→1, plate 236 appears to run right to left.
   - Compute each frame's time as (n − 1) × interval.
   - Choose the source frame nearest each of our frame times, t = k ÷ fps.
2. **Mark joints.**
   - Open the full-resolution scan in any image viewer that shows pixel coordinates.
   - For each chosen frame, note the coordinates of the joints our bones use, e.g. for the dog: hip, stifle, hock, paw, shoulder, elbow, carpus, toe.
   - Write them into a small JSON file, one entry per frame. No special tool is needed; a 20-line script can do the rest.
3. **Compute angles.**
   - Bone angle in the image = atan2(dy, dx) for each joint pair.
   - Our `rot` is a change from the rest pose, so subtract the bone's rest angle (from its `from`/`to` in figures/*.json) and its parent's change.
   - Muybridge's camera faces the animal at right angles, so lateral rows need no perspective correction beyond keeping to the near-side legs.
4. **Choose the output.** Either:
   - **(a)** write a `tracks` override for one motion (exact, but loses the model's planted-foot guarantee); or
   - **(b)** better: read off the few numbers the model needs (`duty` from the frames with a foot down, `stride` from paw travel against body length, `lift` from the highest paw, `phases` from touchdown frames), then let the gait model generate the motion.
   - Option (b) keeps feet planted and adapts to every character built on the figure.
5. **Log it.** Add one provenance entry per frame or parameter (§8).

### 7.2 Published numbers become parameters

| Published quantity | Our parameter | Conversion |
|---|---|---|
| Duty factor | `duty` | as is |
| Stride length L (m) and stride period D (s) | `stride`, `frames`/`fps` | scale L by figure leg ÷ real leg; `stride` = L × `duty`; frames ÷ fps = D |
| Forefoot vs hindfoot touchdown lag (Maes PL) | `phases` (fore − hind, same side) | 1 − PL/100 |
| Head-bob hold fraction | `head.hold` | as is |
| Wingbeat frequency f | wing `tracks` length | frames per beat = fps ÷ f |
| Downstroke fraction | wing keyframe spacing | frames spent going down ÷ frames per beat |
| Stroke amplitude | wing `rot` range | a starting value; the side-view projection of a 3D stroke is smaller, so judge by eye |
| Joint-angle curves (Fukuchi) | `tracks` reference, or a check on the gait model's output | sample at our frame times; joint angle = child `rot` − parent `rot` |

### 7.3 Video becomes measurements

Same steps as for a plate. The interval is 1 ÷ fps, read from the file metadata (use ffprobe if unsure). Prefer clips with a fixed camera, such as the USFWS trail camera. A panning shot needs the ground or background used as the reference for distances.

## 8. Provenance log format

**Where it lives.** Keep provenance **out of the specs and figure files**, in a sidecar folder:
- docs/SPEC.md:388 says "Unknown keys anywhere in the spec produce a warning". The allowed keys are the `KNOWN` lists in src/core/spec.js, and no `sources` key exists.
- Figure files (figures/*.json) did not show an unknown-key check, but keeping them free of citations keeps them readable.
- If an inline link is wanted later, add one optional top-level key, `"references": "references/dog.json"`, to `KNOWN.top` and to the figure loader. That is the only code change needed.

**`references/sources.json`**: one registry, id → citation, shared by all figures and characters:

```json
{
  "muybridge-1887-pl706": {
    "kind": "photo-sequence",
    "title": "Animal locomotion. Plate 706 (Dog; trotting; interrupted; mastiff. Smith)",
    "creator": "Eadweard Muybridge", "year": 1887,
    "holder": "Boston Public Library, Rare Books Department",
    "recordId": "BPLDC 08_11_000674",
    "url": "https://ark.digitalcommonwealth.org/ark:/50959/707969402",
    "image": "https://upload.wikimedia.org/wikipedia/commons/8/85/Animal_locomotion._Plate_706_%28Boston_Public_Library%29.jpg",
    "rights": "No known copyright restrictions.", "rightsUri": "http://rightsstatements.org/vocab/NoC-US/1.0/",
    "attribution": null,
    "plate": 706,
    "frames": "lateral row only, 2 rows x 6, numbered 1-12 left to right",
    "intervalMs": 110, "intervalSource": "muybridge-1887-catalogue"
  },
  "maes-2008": {
    "kind": "paper",
    "title": "Steady locomotion in dogs: temporal and associated spatial coordination patterns and the effect of speed",
    "creator": "Maes, Herbin, Hackert, Bels, Abourachid", "year": 2008,
    "journal": "J Exp Biol 211:138-149", "doi": "10.1242/jeb.008243",
    "licence": "Published by The Company of Biologists 2008 (facts only)", "attribution": null
  },
  "wang-2025-goose": {
    "kind": "paper", "doi": "10.3389/fvets.2025.1554240", "year": 2025,
    "licence": "CC BY 4.0",
    "attribution": "Wang et al. 2025, Front Vet Sci 12:1554240, CC BY 4.0"
  }
}
```

**Rules for the registry.**
- `attribution` is non-null exactly when the licence is CC BY. A credits file can then be generated from the registry.
- `kind` is one of `photo-sequence`, `paper`, `dataset`, `video`, `image`.
- Videos also get `fps`, `resolution` and `durationS`.

**`references/<figure>.json`** (or `references/<character>.json` for a spec): what each value or frame came from.

```json
{
  "figure": "dog",
  "params": [
    {"param": "motions.trot.duty", "value": 0.46, "source": "maes-2008",
     "location": "Appendix 1, DF = 0.652 - 0.210 ln u, at u = 2.5 m/s", "method": "computed",
     "by": "research agent", "date": "2026-11-09"},
    {"param": "motions.walk.phases.armForeNear", "value": 0.16, "source": "maes-2008",
     "location": "Table 2, lateral walk PL = 84%", "method": "1 - PL/100"}
  ],
  "frames": {
    "trot": [
      {"frame": 0, "source": "muybridge-1887-pl706", "sourceFrame": 1, "method": "joint points on scan, atan2",
       "points": "references/measurements/dog-trot-pl706.json", "by": "...", "date": "..."}
    ]
  }
}
```

**Rules for the per-figure file.**
- `param` is a path inside the figure file. `value` repeats the number, so a check can flag drift: when someone edits the figure and the value no longer matches, the entry is stale.
- `frames` maps our frame index to a source frame. Raw joint coordinates go in `references/measurements/`.
- **A small check, later:** a test that (1) every `source` id exists in the registry, (2) every `param` path resolves and equals `value`, and (3) any figure or character derived from images has an entry whose `rights` passes the licence rule.

## 9. Could not be verified

- **Hildebrand's own gait numbers** (Science 1965, doi:10.1126/science.150.3697.701; J Morphol 1968; 1976/77) are paywalled. The dog duty factors and lags above come from Maes 2008 instead.
- **The Alexander & Jayes constants** (λ/h ≈ 2.3·Fr^0.3), and the walk–run Fr ≈ 0.5 and trot–gallop Fr ≈ 2–3 thresholds, were not read in a primary source. Maes gives duty < 0.5 above about Fr 0.7 and a cycle-time plateau at about Fr 2 for dogs.
- **Pennycuick 1996 and 2001** wingbeat tables for Canada, greylag and barnacle geese: only the JEB abstracts loaded. The only goose wingbeat confirmed here is the bar-headed goose (Meir 2019).
- **Goose take-off and landing kinematics** (e.g. Usherwood et al. 2003; Bishop et al. 2015 Science) were not accessible. The take-off ≈ 1.4× cruise ratio comes from Marey's gull, not a goose.
- **Waddle roll angle** for geese or ducks: no number found. `goose.walk.rock` (3°) stays a judgement call.
- **Pigeon head-bob timing** (Frost 1978; Troje & Frost 2000): abstracts only.
- **Muybridge plates not viewed:** frame numbering on them is unchecked. Plate 236 numbering was unreadable at 1400 px. The full-size BPL IIIF URL was not fetched.
- **Digital Commonwealth record pages** now sit behind a bot check. The rights fields were read from the BPL record by the research agent, and the BPLDC numbers for plates 1, 706 and 755 from the Commons mirror.
- **Other holders not checked:** Library of Congress, Wellcome Collection, NYPL, Getty, Smithsonian and Collège de France item pages. The National Gallery of Art Muybridge pages returned 403. The Biodiversity Heritage Library copy of *Le vol des oiseaux* was behind Cloudflare. Gallica was not tried.
- **Marey heron exposure rate**, and the original cranking speeds of the 1899 and 1900 films.
- **Videos:** none was watched. Camera angle and gait come from the titles and descriptions.
- **Dover editions:** whether the 1955/1957 Dover editions carry a separate copyright in the editor's text and layout. Dover and LoC refused access.
- **The 1.7 m human height** used to convert human strides to canvas units is an assumption, not a measurement of our figure.
- **Copyright outside the US** was not analysed. The age-based and Bridgeman reasoning above is US law.
