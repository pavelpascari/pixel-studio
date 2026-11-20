---
title: Introducing Pixel Studio
description: "Agents describe characters; the engine draws them as pixel art at every level of detail; websites play them with one tag."
date: 2026-11-20
authors: [pavel-pascari]
tags: [announcement]
draft: true
---

<!-- Drafted by `project-site init` from README.md. Read it through, make it yours, then set `draft: false`. -->

## What it is

Agents describe characters; the engine draws them as pixel art at every level of detail; websites play them with one tag.

## Why

<!-- TODO: why Pixel Studio exists: the problem, and what it does differently. -->

## Getting started

Install:

```sh
npm i github:pavelpascari/pixel-studio#v0.2.0-alpha.0   # one package, no dependencies
```

Make a character by changing an example (my-goose.json):

```json
{ "extends": "./node_modules/pixel-studio/examples/goose-base.json",
  "name": "Marigold",
  "materials": { "feather": { "color": "#e8b04a" }, "beak": { "color": "#d94b32" } } }
```

Run npx pixel validate, preview and bundle:

```sh
npx pixel validate my-goose.json                          # errors with JSON paths and did-you-mean
npx pixel preview  my-goose.json --out my-goose.png       # every animation at 16, 32 and 64 px
npx pixel bundle   my-goose.json --out my-goose.bundle.json
```

The [documentation](/docs/reference/getting-started/) has the rest.

## What's next

- What changed in each release is in the [changelog](/docs/project/changelog/).
- The source, issues and discussions are on [github.com/pavelpascari/pixel-studio](https://github.com/pavelpascari/pixel-studio).
- Contributions are welcome: see [contributing](/docs/project/contributing/).

<!-- TODO: what you are working on next. -->
