# HELIX — Design Contract (obey across every app page)

Extracted from the design source of truth: `index.html` + `css/helix.css` (do **not** edit those).
Every new page in `tistu/` must read as the **same product** as the landing page — same palette,
same motion personality, same cursor, same vocabulary. You may invent new animations, but they must
synchronize with — never clash with — what's below.

## 0. Library stack (match it; do not introduce a new one)
- **Vanilla JS + CSS custom properties.** No Tailwind, no GSAP, no Framer Motion.
- Animation = **CSS `@keyframes` + `requestAnimationFrame` + Web Animations API + IntersectionObserver**; visuals = **inline SVG + Canvas2D**.
- React 18 UMD + Babel-standalone appear in `index.html` **only** for the dev "tweaks" panel — not core; do not adopt React for product pages.
- The app shell (`app.html` → `js/app.js`) is a hand-rolled vanilla SPA with **hash routing** and a left rail. Keep that pattern.
- On-chain code may import the Sui SDK as **ES modules from a CDN** (`esm.sh`) — that's the only new dependency, loaded the same "vanilla, from CDN" way the landing loads React.

## 1. Color palette (exact hex / tokens — always reference the CSS var, never hardcode)
Light "warm paper" (default):
- `--bg #F3F1EA` · `--bg-2 #ECE8DD` · `--surface #FCFBF7` · `--surface-2 #F7F4EC`
- ink: `--ink #16140F` · `--ink-2 #5B5648` · `--ink-3 #8E8773` · `--ink-ghost #C5BEAC`
- lines: `--line rgba(22,20,15,.10)` · `--line-2 rgba(22,20,15,.18)`
- deep-ink cards: `--ink-card #1A1822` · `--ink-card-fg #EDE7D7` · `--ink-card-mut #9A9384`

Dark (via `[data-theme="dark"]`): `--bg #070707` · `--surface #101010` · `--ink #F0E6D2` · `--ink-card #121019`.

Accents (semantic — use them for their meaning):
- `--accent #C58A2A` gold = **value / the coin / primary action** (`--accent-bright #E0A53C`, `--accent-deep #9A6A18`, `--accent-soft`)
- `--alive #1F8F86` aqua = **living state only**, used sparingly (dark `#4DDBE0`)
- `--conv #1B7F62` conviction-green = **type emphasis on "believe/conviction"** + positive P&L (dark `#44C79B`, bright `--conv-bright`)
- `--coral #C8553F` = loss / breach / danger
- selection is gold; scrollbar thumb tints gold on hover.

## 2. Type
- Display / headings / emotional words: **Instrument Serif** (`--serif`), weight 400, *italic* for emphasis (e.g. *convictions*), colored `--conv`.
- Body / UI / buttons: **Hanken Grotesk** (`--sans`) 300–700.
- All numbers, labels, eyebrows, code: **JetBrains Mono** (`--mono`), `font-variant-numeric: tabular-nums`.
- Scale is fluid via `clamp()`. Headlines `clamp(2.3rem,4.8vw,4rem)` line-height ~1.0, letter-spacing `-0.03em`. Eyebrow = mono 11px, `letter-spacing .16em`, uppercase, `--ink-3`.

## 3. Spacing & shape rhythm
- Content width `--maxw 1320px`; `.wrap` padding `0 32px` (mobile `20px`).
- Section vertical padding `clamp(80px,11vw,150px)`.
- Radii: pills `100px`; cards/panels `20px`; large shells/hero `26px`; tiles `12–16px`.
- Grid gaps `16–18px`; panel padding `26px`.
- App shell: 84px sticky left rail + content; topbar sticky, blurred (`backdrop-filter: blur(14px)`).

## 4. Motion personality (restrained, editorial, "warm intelligence")
- Easing tokens: **`--e-out cubic-bezier(.25,1,.5,1)`** (default), `--e-inout (.76,0,.24,1)`, `--e-bounce (.34,1.56,.64,1)`.
- Durations: `--d-fast 200ms` · `--d-base 320ms` · `--d-slow 560ms`.
- Hovers lift `translateY(-1px..-3px)` + soft shadow; arrow-circles slide `translateX(3px)`.
- "Living" pulse = `@keyframes ping` (expanding ring) on a small `--alive`/`--conv` dot; glows "breathe". Never flashy, never bouncy except micro-interactions.

## 5. Cursor (must match)
- Custom `.cursor-dot`: 8px gold dot, **lerp-follows at 0.18**, grows to a **38px ring** with `1.5px var(--accent)` border over anything matching `a,button,.hx-range,[data-cursor]` (+ app extras: `.scard,tr,.ln-node`).
- Hidden on `(hover:none)` and `prefers-reduced-motion`.

## 6. Boot / preloader
- Orbital loader: dashed gold ring + 3 spinning arcs + one **conviction-green orbiting dot** + breathing gold core; wordmark **Heli<b>x</b>** (gold `x`); mono stage label + `%` + 2px gold progress bar.
- Fades via `.done` (opacity, `720ms var(--e-out)`). `app.html` reuses a compact orbit variant. Reuse this identity for any new loading state.

## 7. Scroll reveal
- `.reveal { opacity:0; translateY(22px) }` → `.in`. IntersectionObserver `threshold ~0.14`, `rootMargin 0 0 -8% 0`, unobserve after. Stagger with `.d1/.d2/.d3/.d4` (80ms steps).
- Page transitions: `.view-enter` keyframe `viewIn` (fade + 14px rise, 420ms `--e-out`).

## 8. Copy / vocabulary rules (product voice)
- Speak **Predict-native, plain English**, never classical options jargon. Say **directional bet**, **range bet**, **bracketed range** — NOT iron condor / straddle / strangle / vertical spread in user-facing copy.
- Risk is shown on **honest axes**, not Greeks: **Net Exposure · Directional Bias · Time-to-Resolution · Concentration · Liquidity Headroom**.
- Emotional words ("believe", "conviction", "alive") get serif italics in `--conv`. Numbers are mono. Money is `dUSDC`.
- Tone: warm, editorial, confident, jargon-free ("Express convictions, not constructs").

## 9. Reusable primitives already defined (prefer these)
- Buttons: `.btn .btn-primary` (ink), `.btn-ghost`, `.btn-pill` (+ `.circ` arrow). App: `.btn-solid`, `.btn-soft`.
- `.panel` / `.panel.ink`, `.stat`, `.scard`, `.badge`/`.badge.tee`, `.chip` (+ `.live`), `.sdot.{active,pending,closed,dead}`, `.toast`, `.empty`, `.hx-range` sliders, `.section-title`, `.dna-grid/.dna-cell`, `.gene` chips.
- SVG charts are hand-built (payoff/equity/radar/lineage) in `app.js` — keep that approach for new charts.

## 10. Hard constraints
- Never edit `index.html` or `css/helix.css`. Add page styles only in `css/app.css` (inherits all tokens).
- Reduced-motion: kill animations/transitions, force `.reveal` visible (already handled in CSS — keep new motion guarded by the `reduce` check).
- Theme is shared via `localStorage('helix-theme')`, set pre-paint to avoid flash.
