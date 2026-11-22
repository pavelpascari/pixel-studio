---
title: "What's new in the next release: lighter pages, characters you can hold on a phone"
description: "Characters that load only when the reader gets near, pick up and throw on touch screens, bundles with only the animations a page plays, and a simpler way into the studio."
date: 2026-11-22
authors: [pavel-pascari]
tags: [release]
draft: true
---

<!--
  Before publishing: put the version in the title and the first paragraph (search for VERSION), set `date` to the
  release day, check every point against CHANGELOG.md's section for that version, and set `draft: false`.
-->

Pixel Studio VERSION is out: `npm i @pixel-studio/core@VERSION`, or `npm i @pixel-studio/runtime@VERSION` for a site
that only plays characters. This release is about pages that stay light and characters that behave the same on every
device. Every change, with upgrade notes, is in the [changelog](/changelog/).

## Characters that load when they are needed

A character far down a long page used to download and unpack as soon as the page loaded. Add `loading="lazy"` and it
waits until the reader is about a screen away, like an image does:

```html
<pixel-sprite src="/fox.bundle.json" size="64" loading="lazy" alt="Ember the fox"></pixel-sprite>
```

The [runtime docs](/docs/reference/runtime/) also have a short CSS rule that reserves the character's space before
its script runs, so nothing on the page moves when it appears. The new [performance page](/docs/reference/performance/)
has the numbers: what each example weighs, what it costs to load and to animate, and how to keep it small.

## Bundles with only what your page plays

Most pages play a handful of a character's animations. `pixel bundle --anims` keeps just those, plus what they need
to play:

```sh
npx pixel bundle goose.json --anims idle,waddle,honk --out goose.bundle.json   # 16 KB instead of 57 KB
npx pixel bundle goose.json --anims stage --out goose.bundle.json              # what <pixel-stage> uses
```

**One change to check when you update:** `pixel bundle` now writes the side view only, which halves a goose's
bundle. If your page turns a character towards the reader (on a `<pixel-stage>`, or with animations such as
`idle@front`), add `--views all`. Bundles made in code with `buildBundle()` are unchanged. The
[CLI docs](/docs/reference/cli/) have every option, and the studio's export dialog has the same choices.

## Pick them up on a phone

On a `<pixel-stage>`, a mouse could always pick a character up and throw it; a finger could only shoo it. Now press
and hold a character for a moment, carry it, and let go to throw it. A quick tap still shoos it, and a swipe that
starts on a character still scrolls the page. Hover reactions work on touch screens too: a tap counts as hovering.

Pages can react the same way on every device: the new `pixel-grab` and `pixel-throw` events, and the `pointerType`
on `pixel-tap`, say what happened and how. The [stage docs](/docs/reference/stage/) have a table of what each input
does, keyboard and screen readers included.

## A simpler way into the studio

The studio now opens any example from a link, in a simple view: the character large, a few animations, its looks and
sizes, then Customise, Create with Claude or Export. Try
[root in its party look](/apps/studio/?c=goose-root&skin=party). The full editor can now switch a character's looks,
and the export includes the one you picked.

## On the website

The [home page](/) starts with a character to direct: make it walk, jump and hide, change its look, copy its embed.
And there is now a [changelog](/changelog/) with an [RSS feed](/changelog/rss.xml), so you can follow what changes
between releases, in the studio and on the site too.
