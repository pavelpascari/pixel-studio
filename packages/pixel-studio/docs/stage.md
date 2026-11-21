# `<pixel-stage>`: characters that live on the page

`<pixel-stage>` lets characters move around a real web page: walk along the top of a card, drop off its end, jump to the
next one, climb its side, sit on an edge with their legs dangling, and duck behind a box and peek out. The page opts
elements in with `data-pixel-*` attributes; nothing else on the page changes, and the characters never block a click.

Source: [`@pixel-studio/runtime`, `src/pixel-stage.js`](../../runtime/src/pixel-stage.js) (it imports `pixel-sprite.js` from the same folder).
Demo: `npm run studio` and open `http://localhost:5173/demo/stage.html`. The design and the research behind it are in
[research/page-interactions.md](../../../docs/research/page-interactions.md).

- [Quick start](#quick-start)
- [Marking up the page](#marking-up-the-page)
- [Elements and attributes](#elements-and-attributes)
- [JavaScript API](#javascript-api)
  - [Styling](#styling)
- [Scenes](#scenes)
  - [Triggers](#triggers)
- [What the characters do](#what-the-characters-do)
- [What a character needs from its bundle](#what-a-character-needs-from-its-bundle)
- [How it works](#how-it-works)
- [Phones, accessibility and performance](#phones-accessibility-and-performance)
- [Limits](#limits)

## Quick start

```html
<script type="module" src="pixel-stage.js"></script>   <!-- with pixel-sprite.js next to it -->

<article class="card" data-pixel-surface data-pixel-climbable>…</article>
<div class="crate" data-pixel-hide></div>

<pixel-stage>
  <pixel-actor src="goose.bundle.json" size="64" alt="a goose" start=".card"></pixel-actor>
</pixel-stage>
```

`pixel-stage.js` imports `./pixel-sprite.js`, so copy both files from `@pixel-studio/runtime`'s `src/` into the same folder. With the
package installed (`npm i @pixel-studio/runtime`), `import '@pixel-studio/runtime/stage'`
registers `<pixel-stage>`, `<pixel-actor>` and `<pixel-sprite>`. See [getting-started.md](getting-started.md) for a
first page.

Put `<pixel-stage>` anywhere in `<body>` (the end is a good place). It is a 0 × 0 layer; its characters are positioned in
document coordinates, so they scroll with the page.

## Marking up the page

| attribute | meaning |
|---|---|
| `data-pixel-surface` | The element's top edge is a platform: characters stand and walk on it (off its rounded corners). `data-pixel-surface="animated"` marks a surface that moves by CSS animation or transform (a drifting cloud, a sliding panel): it is re-read every frame, characters standing on it ride along, and jumps onto it follow it in the air. |
| `data-pixel-climbable` | Its left and right sides are walls a character can climb, if the side's foot rests on a platform. Implies surface. |
| `data-pixel-perch` | A favourite place to sit. Implies surface. |
| `data-pixel-hide` | A hiding spot. A character stands behind it (on a platform whose line passes behind it), ducks and peeks out. |
| `data-pixel-occluder` | Characters are always drawn behind it: a sticky header, a foreground image. |
| `data-pixel-avoid` | Never stand on it or hide behind it (the main call to action, a form). |

The bottom of the page is a floor (`floor="none"` removes it).

Layout tips, learned building the demo:

- A climbable card needs a platform at its foot: make the row of cards stand on a shelf (`data-pixel-surface`) or on another surface.
- A hiding spot must stand on a platform too, and be shorter than the character standing but taller than it ducking, so it can peek over. In the demo the crate is 34 px for a 64 px goose.
- How high a character can jump is 1.8 × its displayed height. Taller steps need a climbable side.
- Occluders and hiding spots are boxes, so use opaque ones (cards, images, filled buttons), not text.

## Elements and attributes

`<pixel-stage>`

| attribute | default | |
|---|---|---|
| `controls` | `bottom-right` | Where the pause button sits: `bottom-right`, `bottom-left`, `top-right`, `top-left`, or `none` (then provide your own control and call `pause()`). |
| `label` | `character` or `characters` | The word on the button: "Pause characters" / "Play characters". Without it, the button says `character` when the stage has one actor. |
| `floor` | `document` | `none`: no floor at the bottom of the page. |
| `roam` | `viewport` | `page`: wander anywhere, not just near what is on screen. |

`<pixel-actor>`

| attribute | default | |
|---|---|---|
| `src`, `size`, `alt`, `skin` | `size` 64 | Passed to the inner `<pixel-sprite>`. Changing `size` on a live character works: its speed, jumps and hit area follow the new box. |
| `start` | a platform on screen | CSS selector of the element to stand on first. |
| `keep-in-view` | off | Stay in sight: when the reader scrolls the character off-screen, it comes back once scrolling settles. Close by, it runs there at 2.5× speed (feet still planted); further away, it drops in from the top of the screen onto a visible surface. |
| `behaviours` | `wander sit hide climb jump gaze` | What it may choose to do on its own. Behaviours the bundle cannot do (no `climb` animation, …) are skipped. `gaze`: now and then look at the reader (turn its head, or turn round), for characters with a front view. |
| `anims` | automatic | Map roles to animation names when the defaults don't find them: `anims="walk=waddle run=gallop"`. |

Animation roles and the names looked up for each, in order (an `anims` entry is tried first): idle `idle`; walk
`walk waddle trot travel`; run `run trot travel walk waddle`; rush `rush`; jump `jump`; fall `fall`; sit `sit`; duck
`duck sneak`; peek `peek`; climb `climb`; react `honk wave hop`. A character without a run uses its walk to run, and
without an `idle` the bundle's first animation. `rush` is optional: the run used in a hurry (see `hurry()`).

## JavaScript API

```js
const stage = document.querySelector('pixel-stage');
const goose = document.querySelector('#goose');           // a <pixel-actor>

goose.goTo(document.querySelector('#summit'), { then: 'sit' });   // walk, jump, drop and climb there, then sit
goose.hideBehind(document.querySelector('.crate'));               // run behind it, duck, peek
goose.say('honk?', 1800);                                          // speech bubble at the beak (or head)
goose.shoo();                                                      // startle and run away
goose.addEventListener('pixel-activity', (e) => console.log(e.detail.from, '→', e.detail.to));

stage.pause(); stage.resume(); stage.paused;                       // what the button does (remembered)
stage.world.invalidate();                                          // after moving elements with transforms
```

| member | |
|---|---|
| `actor.goTo(element \| {x, y}, {then})` | Plan a route and go. `then`: `'idle'` (default), `'sit'`, or `'hide'` (only when the element is a `data-pixel-hide` spot: same as `hideBehind`). Returns false if there is no route. Orders given mid-jump, mid-climb or mid-fall wait until the character lands. |
| `actor.hideBehind(element)` | Go behind a `data-pixel-hide` element. |
| `actor.perform(name, {ms})` | Play one of the bundle's own animations in place (a one-shot until it ends, a loop for `ms`, default 2400), then carry on. Waits if the character is in the air. Returns false for an unknown animation. |
| `actor.say(text, ms)` | Show a speech bubble, placed with the bundle's `beak` or `head` attachment point. |
| `actor.catchUp()` | Come back into view now, the way `keep-in-view` does. Returns `'run'`, `'drop'` or `null` (nothing visible to stand on). |
| `actor.shoo(from?)` | React (`honk`, `wave`, …) and run to the farthest reachable place on screen. Tapping a character does this. |
| `actor.run(action, ...args)` | The orders above as promises, for scripts: `await actor.run('goTo', el, {then: 'sit'})`, `run('hideBehind', el)`, `run('perform', name, {ms})`, `run('shoo', from?)`, `run('pickUp', el)`, `run('drop', how)`, `run('exit', side)`, `run('enter', from)`. Resolves `true` once carried out (arrived, sitting, hidden, played), `false` if impossible or interrupted (a tap, a drag, another order to the same character). |
| `actor.say(text, ms)` → Promise | Resolves when the bubble goes away. |
| `actor.face('left' \| 'right' \| actor \| element)` | Turn to face a side or something on the page. |
| `actor.face('viewer' \| 'away' \| 'side')` | For characters with views (a spec with `views`, see [figures.md](figures.md#views-the-same-character-from-other-angles)): turn toward the reader, turn its back, or back to the side. Plays the turn and resolves when it is done (`false` without that view). While facing the reader it idles, talks, sits and performs in that view (`idle@front`, …); before walking anywhere it turns back to the side by itself. `actor.view` is the current view, `actor.views` the ones it has. |
| `actor.hurry(rate = 1.6)` | Hurry: animate and move `rate` times faster (up to 4; feet planted), run instead of walk, with the `rush` gait if the figure has one. `hurry(1)` to stop. Scene steps' `speed` uses it. |
| `actor.pickUp(el)` | Walk to any element (a letter by a form, an icon) and pick it up: a copy, styled like it, rides at the `carry` point (else `beak`, `handR`, `head`, …); the original is hidden but keeps its space. `actor.carrying` is that element. |
| `actor.drop('here' \| 'back')` | Put it down at its feet (the copy stays on the stage) or send it back to where it came from (the original reappears). |
| `actor.exit('left' \| 'right' \| 'auto')` | Leave the screen by that edge: along a surface that reaches it, or with a leap from the end of one. Off screen it is hidden (`offstage` attribute); anything carried is delivered (`pixel-deliver` event; the original stays hidden). Undirected characters come back on their own after 5–9 s. |
| `actor.enter('left' \| 'right' \| 'top' \| 'auto' \| element)` | Come back: walk in from a side along a visible surface that reaches it, or drop in from the top (onto the element's surface if given). |
| `actor.directed` | `directed` attribute: the character does nothing on its own between orders and stays seated or hidden until told otherwise. Scenes set it on their cast while they play. |
| `actor.activity` | What it is doing: `idle`, `walking`, `running`, `jumping`, `falling`, `climbing`, `sitting`, `hiding`, `startled`, `dragged`, `performing`, `picking up`, `leaving`, `offstage`. |
| `actor.sprite` | The inner `<pixel-sprite>` (listen on it for `pixel-event`; `point()`, …). Its events stay inside the actor (see [Events](#events)). |
| events | See [Events](#events): `pixel-activity`, `pixel-land`, `pixel-arrive`, `pixel-tap`, `pixel-burst`, `pixel-calm`, `pixel-catchup`, `pixel-pickup`, `pixel-drop`, `pixel-deliver`, `pixel-exit`, `pixel-enter`. |
| `stage.actors`, `stage.pause()`, `stage.resume()`, `stage.paused`, `stage.world` | |
| `stage.scrollSpeed` | How fast the page is scrolling, px/s (+ down), smoothed. |
| `stage.playScene(scene, {trigger}?)` | Play a [scene](#scenes): an object, JSON text, or a selector for a `<script type="application/json">`; `trigger` is the element steps can call `"$trigger"`. Returns `{name, source, trigger, finished, stop()}` (`source` is the parsed scene object); `finished` resolves `true` at the end, `false` if stopped. A new scene stops the one playing. Throws with every problem listed (`err.errors`) if the scene is invalid. |
| `stage.scene` | The scene playing now, or null. |
| `stage.arm(scene)` | Arm a scene that has a `trigger`: it plays when that happens. Returns `{disarm()}`. Scenes in `<script type="application/json" data-pixel-scene>` are armed for you. See [Triggers](#triggers). |
| `scene` attribute | `<pixel-stage scene="#intro">` plays that scene once the page is parsed. |
| stage events | `pixel-scenestep`, `pixel-sceneevent`, `pixel-sceneend`, `pixel-fastscroll`, `pixel-scrollsettle`: see [Events](#events). |

The module also exports `World`, `PixelStage`, `PixelActor`, `checkScene(scene, castNames?)`, `runScene(scene, env)`,
`sceneEventName(name, onActorOrStage)` (a scene's short event name → the DOM event it listens to),
`jumpArc(x0, y0, x1, y1, lift, seconds)` and `cells(rects, w, h)`.

### Events

Every event bubbles and is composed, so a listener on the stage or the document hears every character. Names start
with `pixel-`; `e.target` is the actor (or the stage).

| on | event | `detail` | when |
|---|---|---|---|
| actor | `pixel-activity` | `{from, to}` | `actor.activity` changed (`idle` → `walking`, …). |
| actor | `pixel-tap` | `{count}` | Tapped or clicked on its opaque pixels; `count` counts quick taps. |
| actor | `pixel-burst` | `{count, rate}` | Rage taps (the third quick tap on): it panics. |
| actor | `pixel-calm` | none | The rage taps stopped. |
| actor | `pixel-arrive` | none | The end of a `goTo`. |
| actor | `pixel-land` | none | Landed from a jump or a fall. |
| actor | `pixel-catchup` | `{from: {x, y}}` | Coming back into view (`keep-in-view`, `catchUp()`); `from` is where it was. |
| actor | `pixel-pickup`, `pixel-deliver` | `{prop}` | Picked an element up; carried it off screen. |
| actor | `pixel-drop` | `{prop, how}` | Put it down (`here` or `back`). |
| actor | `pixel-exit`, `pixel-enter` | none | Left the screen; came back. |
| stage | `pixel-scenestep` | `{scene, step, path}` | A scene step starts. |
| stage | `pixel-sceneevent` | `{scene, name, detail}` | An `emit` step. |
| stage | `pixel-sceneend` | `{scene, completed}` | A scene finished or was stopped. |
| stage | `pixel-fastscroll` | `{speed}` | Scrolling went faster than 1.5 screen heights a second. |
| stage | `pixel-scrollsettle` | none | The fast scrolling stopped. |

An actor's inner `<pixel-sprite>` fires its own `pixel-` events (`pixel-end`, `pixel-burst`, …). They stop at the
actor's shadow root, so a listener on the actor (or above it) hears each thing once, from the actor. Listen on
`actor.sprite` itself for its baked events (`pixel-event`: footsteps, a honk).

#### Renamed in 0.2.0-alpha

The old names still fire for one alpha release (without bubbling, as before) and will be removed after 0.2.0-alpha.
Scenes keep their short names (`"waitFor": "tap"`, `"event": "arrive"`): they are mapped to the `pixel-` events.

| Old | New |
|---|---|
| `tap`, `burst`, `calm`, `arrive`, `land`, `catchup` | `pixel-tap`, `pixel-burst`, `pixel-calm`, `pixel-arrive`, `pixel-land`, `pixel-catchup` |
| `pickup`, `drop`, `deliver`, `exit`, `enter` | `pixel-pickup`, `pixel-drop`, `pixel-deliver`, `pixel-exit`, `pixel-enter` |
| `actorstate`, `actor.state` | `pixel-activity`, `actor.activity` |
| `scenestep`, `sceneevent`, `sceneend` | `pixel-scenestep`, `pixel-sceneevent`, `pixel-sceneend` |
| `fastscroll`, `scrollsettle` | `pixel-fastscroll`, `pixel-scrollsettle` |

### Styling

The elements expose shadow parts:

| part | element |
|---|---|
| `pixel-stage::part(control)` | The pause button. |
| `pixel-actor::part(sprite)` | The inner `<pixel-sprite>`. |
| `pixel-actor::part(bubble)` | The speech bubble (white, 2 px dark border, 12 px system font by default). |

```css
pixel-stage::part(control) { background: #222; color: #fff; }
pixel-actor::part(bubble) { font-family: "Press Start 2P", monospace; border-radius: 0; }
```

While a character carries something, the copy is a child of the `<pixel-actor>` with `slot="carry"`
(`pixel-actor > [slot=carry]`); it gets the original's computed styles inline. When it is dropped, it moves to the stage.

## Scenes

A scene is a scripted moment written as data: who goes where, says what, and when. Put it in the page and play it.

```html
<script type="application/json" id="the-plan">
{
  "name": "the plan",
  "cast": {"goose": "#goose", "moss": "#moss"},
  "steps": [
    {"together": [
      {"actor": "goose", "goTo": "#lakeside", "at": 0.2},
      {"actor": "moss", "goTo": "#lakeside", "at": 0.85}
    ]},
    {"actor": "goose", "face": "moss"},
    {"actor": "goose", "say": "honk?", "ms": 1400},
    {"actor": "moss", "perform": "think", "ms": 2400, "async": true},
    {"actor": "moss", "say": "Let me think about that…", "ms": 2600},
    {"waitFor": "tap", "on": "moss", "timeout": 8000},
    {"actor": "goose", "goTo": "#summit", "then": "sit"}
  ]
}
</script>
<script type="module">
  const run = document.querySelector('pixel-stage').playScene('#the-plan');
  await run.finished;   // or run.stop()
</script>
```

Steps run one after another. Each step does one thing:

| step | does | extra keys |
|---|---|---|
| `{"actor": a, "goTo": target}` | walk there (dropping, jumping, climbing). `target`: a selector, a cast name (stand next to them), or `{"x", "y"}` | `then`: `idle` `sit` `hide` (`hide` only if the target is a `data-pixel-hide` element); `at`: 0–1, where along the element's top; `speed` |
| `{"actor": a, "hideBehind": selector}` | go behind a `data-pixel-hide` element | `speed` |
| `{"actor": a, "perform": name}` | play one of its animations in place | `ms` for a looping one (default 2400) |
| `{"actor": a, "say": text}` | speech bubble | `ms` (default 1800) |
| `{"actor": a, "face": dir}` | turn: `left`, `right`, a cast name or a selector; `viewer`, `away` or `side` for characters with views (waits for the turn) | |
| `{"actor": a, "shoo": true}` | startle and run off (or `"shoo": what` to run from) | |
| `{"actor": a, "pickUp": selector}` | walk to the element and carry it | `speed` |
| `{"actor": a, "drop": true}` | put it down (`true` or `"here"`), or `"back"` where it came from | |
| `{"actor": a, "exit": side}` | leave the screen: `left`, `right` or `auto`; carried things are delivered | `speed` |
| `{"actor": a, "enter": from}` | come back: `left`, `right`, `top`, `auto`, or a selector to drop onto | `speed` |
| `{"wait": ms}` | pause | |
| `{"together": [steps]}` | run steps at the same time; continue when all are done | |
| `{"waitFor": event, "on": who}` | wait for an event on a cast name, a selector or `"stage"`: `tap`, `click`, `arrive`, `burst`, … (actor and stage events by their short names: `tap` listens for `pixel-tap`; on `"stage"` it hears every character, as the events bubble) | `timeout` (ms) |
| `{"emit": name}` | fire `pixel-sceneevent` on the stage for page code | `detail` |

`speed` on a movement step puts the character in a hurry for that step (`actor.hurry(speed)`): it runs,
animating and moving that much faster with its feet still planted, using its `rush` gait if it has one (the geese flap
and stretch their necks out). The check accepts 0.25–4, but only values above 1 change anything: there is no slow
motion.

Any step can add `"async": true` (start it and move straight on) and `"note"` (a comment). Top level: `cast` maps names
to selectors (default: the stage's actors by `id`), `loop` (`true` or a number of times), `directed` (default `true`),
`trigger` (see below). A scene that loops forever needs at least one step that takes time (`wait`, `waitFor`, or an
actor doing something; `checkScene` rejects a loop of only `emit`s), and each pass takes at least 100 ms, so a pass
whose steps all fail at once (every actor missing) cannot lock up the page.

- **The cast is directed** while a scene plays: characters wait for their next step instead of wandering off, and stay
  seated or hidden until the scene moves them. Their own setting comes back when it ends.
- **Steps that cannot happen are skipped**: no route, an unknown animation, a tap that startles the character mid-walk.
  The scene carries on, so a reader poking at the characters never jams it. A new order to a character interrupts its
  previous one (a looping `perform` that is still going, say).
- **Characters wait for each other only where you say so**: `together` waits for all of its steps; `async` waits for none.
- `playScene` checks the whole scene first and throws with JSON paths (`$.steps[3].actor: "fox" is not in the cast`).
  `checkScene(scene)` returns the same list without playing.
- While the stage is paused (or the reader prefers reduced motion) characters do not move, so a scene waits with them.

The [stage demo](../../../demo/stage.html) plays one ("Play a scene"). From code, the same orders are awaitable on each
actor: `await goose.run('goTo', el)`, `await goose.say('hi')`.

### Triggers

A scene with a `trigger` plays when something happens on the page: a form submitted, a button clicked, a section
scrolled into view, a character tapped. Mark its script `data-pixel-scene` and the stage arms it when the page loads.
Here a newsletter form hands the goose a letter, and the goose takes it off the screen to post it:

```html
<form id="signup">
  <input type="email" required> <button>Subscribe</button>
  <span class="letter" hidden></span>   <!-- the page shows it on submit -->
</form>

<script type="application/json" data-pixel-scene>
{
  "name": "the mail",
  "cast": {"goose": "#goose"},
  "trigger": {"event": "submit", "on": "#signup", "preventDefault": true},
  "steps": [
    {"actor": "goose", "perform": "flap", "ms": 1000},
    {"actor": "goose", "pickUp": "$trigger .letter", "speed": 1.7},
    {"actor": "goose", "exit": "right", "speed": 1.9},
    {"wait": 1800},
    {"emit": "delivered"},
    {"actor": "goose", "enter": "right"},
    {"actor": "goose", "say": "delivered. HONK"}
  ]
}
</script>
```

| trigger key | meaning |
|---|---|
| `event` | the event: `submit`, `click`, `input`, … any DOM event; `tap`, `burst`, `arrive` on a character (short names for its `pixel-` events); `visible` (half of a matching element scrolled into view) |
| `on` | a selector (matched with `closest`, so elements added later count too), a cast name, or `"stage"` (`fastscroll`, `sceneevent`, …: short names for the `pixel-` events) |
| `once` | only the first time (default: every time) |
| `preventDefault` | cancel the event's default action, e.g. a form's page load |

- In steps, `"$trigger"` is the element that set the scene off (the form), and `"$trigger .letter"` an element inside it.
- The scene starts just after the page's own handlers for that event, so they can show the letter first.
- A triggered scene stops any other scene that is playing; while it is already playing, its trigger is ignored.
- Without `preventDefault`, a form that really submits loads a new page and the scene never plays. Send it with
  `fetch` in your own `submit` handler (and `preventDefault` there), and use `pixel-sceneevent` (`emit`) to update the page.
- From code: `const t = stage.arm(scene)`, later `t.disarm()`. Or play it yourself from any handler:
  `form.addEventListener('submit', () => stage.playScene('#the-mail', { trigger: form }))`.

## What the characters do

When nothing is asked of them, characters choose by weight among: idle (2), wander to a spot on a platform near the
screen (4), sit on an edge, preferring perches (2), hide behind a hiding spot (2), climb a wall (2). Each choice is turned
into a route and run step by step:

| step | what happens | animation |
|---|---|---|
| walk | Moves along the platform at the animation's own no-slide speed (`pxPerSecond`); runs when the way is long. Walking past the end of a platform starts a fall. | walk / run |
| drop | Walk off an end; fall under gravity; land on the first platform crossed from above. | fall |
| jump | Plays the jump; between its `launch` and `land` events the character flies a ballistic arc whose gravity is solved so the flight lasts exactly that long, landing on the target. | jump |
| climb | Feet put on the wall using the animation's `wall` line, then moves up at `pxPerSecondY` (no slipping); at the top it hops on. | climb, jump |
| sit | At an edge, facing out, legs over it. | sit |
| hide | Stands behind the spot, which is cut out of the character; ducks, and every few seconds peeks. | duck, peek |
| shoo | A short reaction, then a run (jumping and dropping) to the far side. | react, run |

Routes come from a cost-based search over platforms (px walked plus a cost per drop, jump and climb), so a character
takes the sensible way round, not the fewest hops.

## What a character needs from its bundle

Everything the stage uses is baked into the bundle by the engine (see [runtime.md](runtime.md#bundle-format-pixel-sprite1)):

- `ground`: where the feet are, so the character stands exactly on a card's top edge.
- `speed` on walks and runs, `speedY` and `wall` on climbs: movement matches the feet.
- `launch` and `land` events on the jump: the flight is timed to the animation.
- `beak` / `head` points: where speech bubbles go.

The figure library has presets for all of it (`jump`, `fall`, `sit`, `duck`, `peek`, `climb`; see [figures.md](figures.md)).
List them in the spec's animations, for example `"jump": {"motion": "jump"}`.

## How it works

- **The world is read rarely.** Element boxes are read in one batch only when something changed: a `ResizeObserver` on
  the page and on every opted-in element, a `MutationObserver` for added or removed elements and `data-pixel-*` changes,
  and `resize`, `load`, font loading, `transitionend` and `animationend`. Scrolling reads nothing.
  Measured in the demo: one stage tick takes about 0.1 ms; changing a card's size causes one read.
- **Read, think, write.** Each frame: read boxes if dirty, then plan and move (plain JavaScript), then write each
  character's `transform`, `z-index` and `clip-path`, only when they changed.
- **Occlusion** is a `clip-path: path(evenodd, …)` on the character: its box minus every occluder that overlaps it,
  split into disjoint cells so overlapping occluders don't cancel out, and rounded to device pixels. The page is not touched.
- **Clicks go through.** The stage and its characters have `pointer-events: none`. A capture-phase listener tests taps
  against the character's opaque pixels (`hitTest`); only a tap on the character itself shoos it, and that one click does
  not reach the page.
- **One clock.** Movement uses the same frame clock and `dt` as the sprites' frame stepping (see [runtime.md](runtime.md)).

## Rage taps and fast scrolls

- **Rage taps.** Three or more quick taps or clicks on a character (each within 450 ms of the last) are a burst: the
  character panics. It plays and moves faster with every tap (1.35×, then +0.35 per tap, up to 3×), keeps running away
  from the latest tap, and the actor fires `pixel-burst` `{count, rate}`. When the taps stop, it fires `pixel-calm` and slows down.
  Movement always scales with the playback rate, so the feet stay planted at any speed.
- **Fast scrolls.** The stage tracks scroll speed (`stage.scrollSpeed`) and fires `pixel-fastscroll` and `pixel-scrollsettle`.
  Characters with `keep-in-view` wait for the scroll to settle, then catch up (see above).

```js
stage.addEventListener('pixel-fastscroll', () => goose.say('wait for me!'));
goose.addEventListener('pixel-burst', (e) => { if (e.detail.count >= 8) goose.say('OK OK OK'); });
```

## Phones, accessibility and performance

- Touch works like a mouse click: a tap on a character shoos it. Characters never call `preventDefault` on touch and never
  set `touch-action`, so scrolling and zooming are unaffected.
- With a mouse or pen, press on a character and drag to pick it up (it dangles, using its `fall` animation); let go to
  throw it with the pointer's speed. It flies, falls and lands on the first surface below. A press without a drag is a
  click, which shoos it. Dragging is off while paused or under reduced motion. Touch never drags, so a finger on a
  character still scrolls the page.
- The pause button is a real `<button>` in the tab order, above the characters, clear of the iPhone home indicator. The
  choice is stored in `localStorage` (`pixel-stage:paused`). This is what WCAG 2.2.2 (Pause, Stop, Hide) asks for.
- With `prefers-reduced-motion: reduce` the characters are placed and stand still; the setting is watched live.
- The characters' layer is `aria-hidden`; the button is not.
- Checked in desktop Chromium and in iOS 18.1 Safari (iPhone 16 simulator).

## Limits

- Occluders are rectangles. A character "behind" a heading's text is cut by the whole box.
- Elements moved by CSS `transform` or animations are not noticed until something marks the world dirty
  (`transitionend` / `animationend` do; otherwise call `stage.world.invalidate()`), unless they are marked
  `data-pixel-surface="animated"`, which is read every frame (a layout read per such element per frame, so use it for a few).
- Sticky and fixed elements are treated as if they stayed put: mark them `data-pixel-occluder`, not surface.
- Nested scroll containers and iframes are not supported; the stage works in the document's own scroll.
- A climbable side needs a platform at its foot; a hiding spot needs a platform passing behind it.
- Top-layer elements (modal dialogs, popovers) always paint above characters.
