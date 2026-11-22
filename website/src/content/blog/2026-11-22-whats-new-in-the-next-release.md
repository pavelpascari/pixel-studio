---
title: "What's new in the next release: lighter pages, characters you can hold on a phone"
description: "Characters that load only when the reader gets near, pick up and throw on touch screens, bundles with only the animations a page plays, and a simpler way into the studio."
date: 2026-11-22
authors: [pavel-pascari]
tags: [release]
draft: true
---

<!--
  Before publishing: put the version (0.2.0-alpha.3) in the title, set `date` to the release day, and set
  `draft: false`.
-->

Pixel Studio 0.2.0-alpha.3 is out: `npm i @pixel-studio/core@0.2.0-alpha.3`, or
`npm i @pixel-studio/runtime@0.2.0-alpha.3` for a site that only plays characters. This release cuts what a page
downloads, and it gives touch screens the pick-up and throw that a mouse already had. The
[changelog](/changelog/) lists each change, with upgrade notes.

## Characters that load when they are needed

Until now, a character far down a long page downloaded and unpacked as soon as the page loaded. Add
`loading="lazy"` and it waits until the reader is about a screen away, the way an image does:

```html
<pixel-sprite src="/fox.bundle.json" size="64" loading="lazy" alt="Ember the fox"></pixel-sprite>
```

The [runtime docs](/docs/reference/runtime/) give a short CSS rule that reserves the character's space before its
script runs, so the page doesn't shift when the character appears. The new
[performance page](/docs/reference/performance/) lists what each example weighs, what it costs to load and to
animate, and how to keep it small.

## Bundles with only what your page plays

Most pages play a handful of a character's animations. `pixel bundle --anims` keeps those, plus what they need to
play:

```sh
npx pixel bundle goose.json --anims idle,waddle,honk --out goose.bundle.json   # 16 KB instead of 57 KB
npx pixel bundle goose.json --anims stage --out goose.bundle.json              # what <pixel-stage> uses
```

**One change to check when you update:** `pixel bundle` now writes the side view only, which halves a goose's
bundle. If your page turns a character towards the reader (on a `<pixel-stage>`, or with animations such as
`idle@front`), add `--views all`. Bundles you build in code with `buildBundle()` keep their views as before. The
[CLI docs](/docs/reference/cli/) list each option, and the studio's export dialog offers the same choices.

## Pick them up on a phone

On a `<pixel-stage>`, a mouse could pick a character up and throw it, and a finger could only shoo it. Now you can
press and hold a character for a moment, carry it, and let go to throw it. A quick tap still shoos it, and a swipe
that starts on a character still scrolls the page. On iPhones, a held character no longer drops when iOS cancels
the pointer partway through the hold. Hover reactions work on touch screens too: a tap counts as hovering.

If you'd rather keep pick-up off touch screens, set `grab="mouse"` on the stage for mouse and pen only, or
`grab="off"` to turn it off. Either way the stage adds no touch listener, and swipes on the page start scrolling a
frame sooner.

The new `pixel-grab` and `pixel-throw` events, and the `pointerType` on `pixel-tap`, tell your page what happened
and with which input, so it can react the same way on each device. The [stage docs](/docs/reference/stage/) have a
table of what each input does, keyboard and screen readers included.

Two tap fixes land as well. On iPhones, a tap on a character no longer opens a link underneath it. And a tap
elsewhere within half a second of shooing a character now reaches the page.

## A simpler way into the studio

You can now open any example in the studio from a link. It opens in a simple view: the character large, a few
animations, its looks and sizes, then Customise, Create with Claude or Export. Try
[root in its party look](/apps/studio/?c=goose-root&skin=party). The full editor can now switch a character's
looks, and the export includes the one you picked.

## On the website

The [home page](/) starts with a character for you to direct: make it walk, jump and hide, change its look and copy
its embed. The site also has a [changelog](/changelog/) with an [RSS feed](/changelog/rss.xml), so you can follow
what changes between releases, in the studio and on the site as well.
