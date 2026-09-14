# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, client-side web app of interactive practice problems for ECE 2300 (Digital Logic & Computer Organization): K-maps, CMOS transistor-network building, switch-level analysis, gate-level truth tables, and timing diagrams. No backend, no build step, no dependencies — plain HTML/CSS/JS loaded directly by the browser.

## Running / testing locally

There is no build, bundle, lint, or test command. To develop:

- Open `index.html` directly in a browser, or serve the directory with any static file server (e.g. `python -m http.server`) and open `index.html` in the browser.
- Verify changes by clicking through the app: check answers with the in-page "Check my answer" / "Check circuit" / "Check table" buttons for the relevant problem type. All checking logic runs client-side in JS — there is no server to validate against.
- There is no automated test suite; changes are verified manually in-browser.

Note: this repo also contains a stray `.venv/` and `__pycache__/` from an unrelated Python environment — they are not part of this app and can be ignored.

## Architecture

### Script load order matters

`index.html` loads scripts in a fixed order, and later files depend on globals defined earlier:

```
js/data.js -> js/kmap.js -> js/app.js -> js/cmos.js -> js/timing.js -> js/switch.js -> js/gate.js -> js/match.js -> js/nor.js -> js/glnet.js -> js/sop.js -> js/main.js
```

There is no module system — every file shares the global scope. `js/main.js` just calls `renderChapters()` and `render(parseHash())` to boot the app.

Because everything shares one global scope, a later-loaded file's `function foo(){}` silently overwrites an earlier file's `foo` of the same name — there's no error, just quietly broken behavior in whichever module loaded first. `js/cmos.js` in particular defines several generically-named helpers (`glyph`, `snapGrid`, `orthogonalPoints`, `orthogonalPath`, `nearestPointOnSegment`, `nearestPointOnWire`, `nearestWire`, `endpointPosition`, `wireExists`, `addWire`, `groundSvg`, `fmtV`, `transOn`, ...) with no `cmos`-specific prefix. When adding a new module, prefix *every* top-level function and const with that module's short name (as `js/nor.js` does with `nor*`) rather than reusing a generic name, even when copying logic patterns from another module (e.g. the pointer-gesture/wiring code in `js/nor.js` is adapted from `js/cmos.js` but fully renamed to avoid collisions).

### Content model (`js/data.js`)

- `CHAPTERS`: ordered list of topic metadata (`number`, `title`, `description`, optional `locked`/`hidden`).
- `PROBLEMS`: flat list of problem definitions, each tagged with `chapter` and a `type` (`kmap`, `cmos`, `switch`, `gate`, `timing`, `match`, `norbuild`, `glnet`, `sop`). The `type` determines which solver module renders it and what shape the rest of the problem object needs (e.g. `kmap` problems carry `variables`/`minterms`/`dontcares`; `cmos`/`switch` problems carry `transistors`/`layout`; `gate` problems carry `inputs`/`nodes`; `timing` problems are mostly self-contained and driven by constants in `js/timing.js`; `match` problems carry `gates`, a list of 2-input gate names from `MATCH_GATES` in `js/match.js`, and generate their own truth tables; `norbuild` problems carry `primitive` — `"NOR"` (default) or `"NAND"`, selecting which 2-input gate from `NOR_PRIMITIVES` in `js/nor.js` the student places — and `stages`, an ordered list of target-gate names from `NOR_TARGETS`, each built as its own drag/wire stage; `glnet` problems carry a single `network` object — see `js/glnet.js` below for its shape — so a new fixed circuit is a `js/data.js` entry, not a new module; `sop` problems carry `variables`/`minterms` exactly like `kmap`, since both describe a truth table the same way — see `js/sop.js` below).
- A chapter with `hidden: true` is omitted from the chapter list and blocked from direct routing; `locked: true` shows it as "coming soon".

### Developer mode (`DEV_MODE` in `js/app.js`)

`DEV_MODE` is `true` whenever the URL has a `dev` query param (e.g. `index.html?dev=1#/problem/p2-5`) — it's a pure client-side opt-in, never on for a normal student visit. Every staged problem type (`js/switch.js`, `js/timing.js`, `js/nor.js`, `js/glnet.js`) shows a "Dev: skip to last stage" button next to its stage indicator when `DEV_MODE` is on, calling that module's existing `*GoStage(i)` jump function directly — bypassing the usual "must complete this stage to advance" gate — so you can test a later stage without re-solving every stage before it. It's styled with the dashed-amber `.dev-skip-link` class specifically so it never looks like a real part of the UI. When adding a new staged problem type, give it a `*GoStage(i)` function (most already need one for Previous/Next) and wire the same button into its stage-indicator render function.

### Routing (`js/app.js`)

Hash-based router with three screens: `chapters` -> `problems` (per chapter) -> `solver` (per problem).

- `parseHash()` reads `location.hash` into a route object; `routeToHash()` is the inverse.
- `render(route)` draws a screen without touching history (used for both initial load and `hashchange`).
- `navigate(route)` is what UI code calls on click — it updates `location.hash`, which triggers `render()` via the `hashchange` listener. This split exists so browser Back/Forward (and mobile swipe-back) work correctly.
- `buildSolver(id)` in `app.js` dispatches on `problem.type` to show the right `#solver-*` section in `index.html` and calls that type's own `build*()` function (`buildCmos`, `buildSwitch`, `buildTiming`, `buildGateProblem`, `buildMatchProblem`, `buildNorProblem`, `buildGlnet`, `buildSop`, or the K-map builder `buildGrid`/`renderSolver` inline in `app.js`).

### Per-type solver modules

Each problem `type` has its own file owning that solver's state, rendering, and answer-checking — they don't share code with each other beyond DOM/CSS conventions:

- `js/kmap.js` + K-map logic in `js/app.js`: Gray-code grid math, group validity (`isValidGroup`), minimal SOP term/expression building, and `evaluate()` for feedback messages.
- `js/cmos.js`: drag-and-drop schematic editor (place transistors, wire terminals, snap-to-grid, union-find over wire endpoints to resolve electrical nodes) plus a two-stage flow — build the pull-up/pull-down network, then simulate it by filling a conduction table.
- `js/switch.js`: given a full transistor network, the user marks each transistor open/closed and sets node voltages per input row; staged one input row at a time.
- `js/gate.js`: renders a fixed gate-level network diagram and checks a user-filled truth table.
- `js/timing.js`: multi-stage problem (`TSTAGES`) — truth table stage, then timing-diagram stages under different delay models (zero/constant/input-dependent/transition-dependent); users draw waveforms by clicking/dragging in canvas rows.
- `js/match.js`: renders four 2-input gate icons (from `MATCH_GATES`) and four shuffled truth tables generated from them; the user arms a gate by clicking it, then clicks a truth table's slot to place it (click a placed gate or a filled slot to pick it back up).
- `js/nor.js`: a staged drag/wire builder (one stage per entry in the problem's `stages` list) where the student drags copies of the problem's primitive gate (NOR2 or NAND2, from `NOR_PRIMITIVES`) onto a canvas and wires them — from fixed circuit-input points, between gate terminals, to a fixed circuit-output point — so the resulting circuit's truth table matches the current stage's target gate (from `NOR_TARGETS`; each target's hint text is keyed by primitive, since the correct construction differs). The wiring/placement pointer-gesture code is adapted from `js/cmos.js`'s schematic editor, but logic-level: no rails or transistor conduction, just a union-find over wires plus a fixed-point propagation (`norEvaluate`) that evaluates the chained primitive gates using whichever primitive's truth function (`norPrim().fn`) the problem selected. A stage is graded by re-deriving the whole truth table from the built circuit, not by inspecting the wiring directly, so any valid implementation using only that primitive passes. Each stage keeps its own canvas state in `nor.stages[i]` (via the `norS()` accessor) so navigating with "Previous gate" / "Next gate" never loses a finished circuit.

- `js/glnet.js`: a data-driven gate-level-network-timing problem, generic over any fixed acyclic circuit described by a problem's `network` field: `{inputs:[...], gates:[{out,kind,in:[...]}, ...] (topological order), output, delays:{KIND:{tpd,tcd}, ...}, waveform:{name:{init,transitions:[{time,value},...]}, ...}, duration, diagramSvg}`. `diagramSvg` is the one hand-authored piece (like `cmos`/`switch`'s `layout`) — a fixed SVG string built from the same gate glyphs as everywhere else, since auto-routing a schematic isn't worth the visual-quality risk; everything else (truth table, structural paths, delay propagation) is computed from the spec by generic code, so a second circuit (e.g. `p2-6`) is just a new `PROBLEMS` entry, not a new module. Worked through in 3 stages: (1) complete the truth table for every gate output, (2) list each primary input's structural path to the output (`glTracePaths`, a backward walk from `output` to each input) and fill in propagation/contamination delay plus critical-/short-path flags, (3) complete a timing diagram where each bin is 0, 1, or "unknown" (`glComputeSignal` is a small generic worst-case/best-case delay-interval propagation engine — earliest-possible-change times propagate via `tcd`+min, latest-guaranteed-settled times via `tpd`+max — so stage 2's per-path sums and stage 3's diagram are derived from the same `delays` object, not independently hand-tuned). Going back a stage never loses work since each stage's answers live in their own state slot (`truthAns`/`pathAns`/`diagram`) rather than sharing one mutable canvas.

- `js/sop.js`: given a truth table (as `variables`/`minterms`, same shape as a `kmap` problem), a fixed gate-level network is drawn — one NOT gate per variable producing its complement line, one AND gate per row where Y=1 (so the AND-gate count is derived from `minterms.length`, not fixed), and one OR gate combining every AND output into Y. The AND-to-OR wiring is fixed/given (drawn once, not interactive); the only interactive part is dragging a wire from a variable's true or complement line to one of an AND gate's input pins — a simple bipartite rail-to-pin connection (`sop.answer[gate].pins[i]`), not a general wire graph, so it reuses nor.js's window-pointermove/pointerup drag-gesture shape without needing nor.js's union-find/junction machinery. Any AND gate may implement any required product term in any order — `sopGateMinterm()` derives the minterm each gate currently represents (or `null` if it isn't fully/validly wired — every pin must use a different variable), and grading is a set comparison against `minterms`, not a per-gate positional check.

Each of these modules keeps its own local state object (e.g. `sw`, `timing`, `gateState`, `cmos`, `matchState`, `nor`, `gl`, `sop`) and a `*Reset()` / `*Check()` pair mirroring the K-map's `resetProblem()` / `checkAnswer()`.

### Visual conventions (course-specific — not derivable from the code alone)

This course draws gate symbols and truth tables a specific way; match it whenever a problem renders either. The canonical implementations are `js/gate.js` (AND/OR), `js/match.js` (`MATCH_GATES`: AND/OR/XOR/XNOR), and `js/nor.js` (`norGlyphNOR`/`norGlyphNAND`) — copy their SVG path shapes rather than re-deriving new ones.

- **Gate glyphs** (all built from two shape families, no fill besides `var(--surface)`, stroke `var(--ink-soft)` via the shared `.gate-wire`/`.gate-symbol` classes):
  - **AND** — a "D" shape: flat left edge, semicircle-like curve on the right. No bubble.
  - **OR** — a shield: concave-curved back (the input side), pointed front (the output side). No bubble.
  - **XOR** — an OR body plus a second curved line just behind the back curve (the "double curve").
  - **NAND** — an AND body plus a small circle ("bubble") at the output tip.
  - **NOR** — an OR body plus an output bubble.
  - **XNOR** — an OR body, the extra back curve (like XOR), *and* an output bubble.
  - **NOT** (gate-level diagrams only, e.g. `js/glnet.js`) — a triangle pointing right, plus an output bubble. Single input lead.
  - A gate is always drawn with 1–3 straight input leads on the left and one straight output lead on the right; inputs/output labels sit just outside the leads.
- **Truth tables** — a compact, monospace (`IBM Plex Mono`) table: bold 2px top and bottom borders on the whole table, a 2px border under the header row, thin 1px lines between body rows, and (for a 4-row, 2-input table) an extra 2px divider after the 2nd row to visually group the table into two halves. See the `.match-truth-table` CSS class — reuse it for any new truth table rather than inventing new table styling.
- The page's dotted background (`body`'s `background-image`) already stands in for the dot-grid paper the course's hand-drawn truth tables use — no need to add per-table dot patterns.

### Adding a new problem

Add an entry to `PROBLEMS` in `js/data.js` with the right `type` and the fields that type's `build*()` function expects (read the existing entries of that type for the exact shape — e.g. `switch`/`cmos` problems need explicit `layout` coordinates for wires/transistors/nodes since the schematic is hand-laid-out, not auto-routed).
