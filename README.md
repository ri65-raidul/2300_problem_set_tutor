# Digital Logic & Computer Organization — Interactive Problem Sets

## Structure

- `index.html` — page structure and solver views
- `css/styles.css` — all styling
- `js/data.js` — chapter and problem definitions
- `js/kmap.js` — Karnaugh-map math and feedback rules
- `js/app.js` — navigation, chapter/problem lists, and K-map UI
- `js/cmos.js` — CMOS builder and simulation
- `js/timing.js` — timing-diagram problems
- `js/switch.js` — switch-level analysis problems
- `js/main.js` — application boot

## Current visibility

- Chapter 1 now contains only the first five problems. The previous Problems 6 and 7 (`p1-4` and `p1-5`) were removed.
- Chapters 2 and 5 are marked `hidden: true` in `js/data.js`. They are omitted from the chapter screen and blocked from direct chapter/problem routes.
