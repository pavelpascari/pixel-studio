# Where our motion comes from

Every motion value or pose we take from the outside world is logged here, with its source cited in full, so
anyone can check it, credit it, or trace a frame back to the photograph it was measured from. Background and the
sources themselves: [docs/research/motion-references.md](../../../docs/research/motion-references.md).

**The licence rule.** Free, no strings attached:
- **Poses (frames)** may come only from images or video that are public domain, CC0 or CC BY (CC BY: credit
  required, see `CREDITS.md`).
- **Numbers** (a duty factor, a wingbeat rate) may also come from copyrighted papers, as `facts-only`: measured
  facts are not protected (17 U.S.C. §102(b)), but we never copy their text or figures.
- Non-commercial, no-derivatives and share-alike sources fail. So do vendor terms that restrict redistribution
  (Mixamo, ActorCore, Rokoko; see [motion-data-sources.md](../../../docs/research/motion-data-sources.md)).

## Files

| File | What it holds |
|---|---|
| `sources.json` | The registry: one entry per source, cited in full |
| `<figure>.json` | The log for `figures/<figure>.json` (or `"character"` for `examples/<name>.json`) |
| `measurements/` | Raw measurements: joint points read off a plate or video frame, per frame |
| `CREDITS.md` | Generated from the registry: the attributions CC BY asks for, and every source |

## `sources.json`

```json
"muybridge-1887-pl706": {
  "kind": "photo-sequence",
  "title": "Animal locomotion. Plate 706 (Dog; trotting; interrupted; mastiff. Smith)",
  "creator": "Eadweard Muybridge", "year": 1887,
  "holder": "Boston Public Library, Rare Books Department", "recordId": "BPLDC 08_11_000674",
  "url": "https://ark.digitalcommonwealth.org/ark:/50959/707969402",
  "image": "https://upload.wikimedia.org/wikipedia/commons/8/85/…Plate_706….jpg",
  "licence": "public-domain",
  "rights": "No known copyright restrictions.", "rightsUri": "http://rightsstatements.org/vocab/NoC-US/1.0/",
  "attribution": null,
  "plate": 706,
  "frames": "12 lateral only, 2 rows x 6, numbered 1-12 left to right, dog facing right",
  "intervalMs": 110, "intervalSource": "muybridge-1887-catalogue"
}
```

- **Required:** `kind` (`photo-sequence`, `paper`, `dataset`, `video`, `image`, `book`), `title`, `creator`,
  `year`, `url`, `licence` (`public-domain`, `CC0-1.0`, `CC-BY-4.0`, `CC-BY-3.0`, `facts-only`), and `rights`: the
  rights statement **word for word** from the holder.
- `attribution` is the credit line, set exactly when the licence is CC BY.
- A photo sequence also needs `plate` and `frames`, which says how the frames are laid out and numbered. Add
  `intervalMs` when the time between exposures is known. A video needs `fps`.
- Papers: `doi`, `journal`. Records: `holder`, `recordId`, `image` (the scan used).

## `<figure>.json`: what each value and frame came from

```json
{
  "figure": "dog",
  "params": [
    {"param": "motions.trot.duty", "value": 0.46, "source": "maes-2008",
     "location": "Appendix 1, DF = 0.652 - 0.210 ln u, at u = 2.5 m/s", "method": "computed",
     "by": "Pavel Pascari", "date": "2026-11-09"}
  ],
  "frames": {
    "trot": [
      {"frame": 0, "source": "muybridge-1887-pl706", "sourceFrame": 1,
       "method": "joint points on the scan, angles by atan2", "points": "references/measurements/dog-trot-pl706.json",
       "by": "Pavel Pascari", "date": "2026-11-09"}
    ]
  }
}
```

- **`params`**: `param` is a path in the figure (or character) file and `value` repeats the number. If someone
  later edits the value, the check fails until the log is updated, so a stale citation can't hide.
  `location` says where in the source: a table, page, appendix equation, or plate frame.
- **`frames`**: our frame index in an animation, mapped to a frame of the source (`sourceFrame`, numbered the way
  the source's `frames` description says). `points` links the raw measurements.
- Every entry says `method`, `by` and `date`.

## Checking and credits

```sh
node scripts/references.mjs           # check every log (also part of npm test)
node scripts/references.mjs credits   # rewrite CREDITS.md after editing sources.json
```

The check fails on:
- a source that isn't in the registry, or is missing citation fields;
- a licence outside the rule, or an attribution that doesn't match its licence;
- a logged value that no longer matches the figure;
- a frame outside its animation;
- a frame taken from a `facts-only` source;
- a missing measurement file;
- a `CREDITS.md` that is out of date.
