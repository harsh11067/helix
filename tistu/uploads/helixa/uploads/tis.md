# HELIX — Frontend Design

> Immersive design language for a conviction-native financial platform. Editorial discipline meets bioluminescent life.

---

## 1. Design Philosophy

Most DeFi interfaces look the same: a dark dashboard, a wallet button, some charts, a table. They are tools. They are forgettable.

HELIX is not a tool. It is an environment where convictions live and breed. The interface must feel **alive**. It must convey that strategies are organisms, not records. It must respect the user's intelligence with editorial restraint while inviting awe with cinematic moments.

The visual language has two simultaneous influences:

**Editorial Discipline** — Inspired by the Sui Overflow website (overflow.sui.io). Deep void backgrounds, cream typography, generous whitespace, custom flat illustrations, scroll-triggered orchestration, tilt/parallax on interactive elements, the "initializing" system-boot preloader. Editorial design treats the page as a magazine spread, not a UI form.

**Bioluminescent Life** — The HELIX overlay. Strategies pulse with heartbeats. The lineage tree glows like a deep-ocean reef. Birth and death moments are cinematic. Cyan-aqua accents evoke living tissue under microscope. The DNA double-helix appears throughout as the visual signature.

The fusion: serious enough that institutional money trusts it, alive enough that retail users feel wonder.

---

## 2. Aesthetic Direction

**Tone:** Editorial-cinematic. Think the Financial Times editorial design crossed with a deep-sea documentary.

**Mood Words:** Vast, calm, alive, precise, deliberate.

**What it is NOT:** Crypto-bro. Cyberpunk. Neon-everything. Generic dark dashboard. Glassmorphism. Bento grids.

**The one thing someone remembers:** The Conviction Canvas. They've never seen a financial interface that lets them express what they *believe* with sliders and watch a probability cone respond in real-time.

---

## 3. Color System

### 3.1 Base Tokens

```css
:root {
  /* Backgrounds */
  --void: #060606;              /* primary background, deeper than overflow */
  --surface: #0F0F0F;           /* card backgrounds */
  --surface-elevated: #161616;  /* hover states, modals */
  --surface-overlay: rgba(15, 15, 15, 0.85);  /* dropdowns, tooltips */
  
  /* Foregrounds */
  --cream: #F0E6D2;             /* primary text, warm not pure white */
  --cream-muted: #B8A988;       /* secondary text */
  --cream-faded: #6B6253;       /* tertiary text, captions */
  --cream-ghost: #2A2620;       /* disabled, hint */
  
  /* Living accents (the bioluminescent layer) */
  --aqua: #4DDBE0;              /* primary accent, alive */
  --aqua-bright: #7AEEF3;       /* hover, active */
  --aqua-dim: #1A4D52;          /* backgrounds, fills */
  --aqua-glow: rgba(77, 219, 224, 0.15);  /* glow effects */
  
  /* Value accents (the wealth layer) */
  --amber: #E8A53A;             /* gains, success, value */
  --amber-bright: #FFC75F;
  --amber-dim: #5C3F14;
  
  /* Warning + Death */
  --coral: #E85D5D;             /* losses, dying strategies */
  --coral-dim: #5C2424;
  
  /* Neutrals */
  --line: rgba(240, 230, 210, 0.08);     /* subtle dividers */
  --line-strong: rgba(240, 230, 210, 0.15);
  
  /* State colors for strategy life */
  --status-alive: var(--aqua);       /* thriving, pulsing */
  --status-neutral: var(--cream-muted);  /* stable, no pulse */
  --status-dying: var(--coral);      /* drawdown, danger */
  --status-dead: var(--cream-ghost); /* deceased, faded */
}
```


---

## 4. Typography

### 4.1 Type Stack

**Display (Headlines, Hero Type)**
- Primary: `Instrument Serif` (Google Fonts, free) — editorial serif with personality
- Alt: `Fraunces` (Google Fonts, variable, free)
- Why: Most fintech uses sans-serif. A serif headline says "we take this seriously, we are an institution, we have opinions."

**Body (Reading, UI Labels)**
- Primary: `Geist Sans` (Vercel, free) — clean grotesk with slight character
- Alt: `Bricolage Grotesque` (Google Fonts, variable, free)
- Why: NOT Inter, NOT Roboto. Geist has subtle character without being precious.

**Mono (Data, Numbers, Code-like UI)**
- Primary: `Geist Mono` — pairs naturally with Geist Sans
- Alt: `JetBrains Mono`
- Why: All numerical UI uses mono. Prices, percentages, Greeks, capital amounts. Mono signals "this is data, not decoration."

### 4.2 Type Scale

```css
:root {
  /* Display scale — serif, for hero moments */
  --type-hero: clamp(3.5rem, 8vw, 7rem);        /* landing hero */
  --type-display: clamp(2.5rem, 5vw, 4.5rem);   /* section headers */
  --type-title: clamp(1.75rem, 3vw, 2.5rem);    /* page titles */
  --type-subtitle: 1.5rem;                       /* subsection titles */
  
  /* Body scale — sans, for reading */
  --type-body-lg: 1.125rem;     /* lead paragraphs, body emphasis */
  --type-body: 1rem;            /* default reading */
  --type-body-sm: 0.875rem;     /* secondary text */
  --type-caption: 0.75rem;      /* labels, captions */
  --type-micro: 0.6875rem;      /* tiny labels (uppercase tracking) */
  
  /* Data scale — mono, for numbers */
  --type-data-xl: 2rem;         /* hero stats */
  --type-data-lg: 1.5rem;       /* prominent numbers */
  --type-data: 1rem;            /* default data */
  --type-data-sm: 0.875rem;     /* table data */
}
```

### 4.3 Typographic Style Rules

- Display type uses **slight letter-spacing reduction** (-0.02em) for a tighter editorial feel
- All caps labels use **+0.08em letter-spacing** for breathing room
- Numbers ALWAYS use tabular-nums and mono font
- Body text line-height is generous: `1.65` for paragraphs, `1.4` for UI labels
- Headlines use weight `400` from serif (avoid heavy weights — let the serif do the work)
- Avoid italics except for technical terms and citations

---

## 5. Spacing and Layout

### 5.1 Spacing Scale

Based on a 4px unit. All spacing values are multiples of 4.

```css
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-32: 128px;
}
```

### 5.2 Layout Principles

**Generous Whitespace.** Like overflow.sui.io, content should breathe. Never cram. If something feels too dense, it is.

**Asymmetric Composition.** Avoid rigid grids on landing/marketing pages. Use intentional asymmetry that draws the eye through the page (left, right, left, center).

**Editorial Anchor Points.** Each section has one focal element. The eye knows where to land.

**Container Widths:**
- Reading width: `680px` max (for prose-heavy sections)
- Standard content: `1200px` max
- Full bleed: `100vw` (hero sections, ecosystem map)

---

## 6. Motion Principles

### 6.1 The Four Motion Rules

**Rule 1: Motion has meaning.** No animation exists for decoration alone. Every motion either (a) clarifies a transition, (b) reveals new information, (c) signals living state, or (d) creates a cinematic moment.

**Rule 2: Easing is curated.** Use these curves only:

```css
:root {
  --ease-in-quart: cubic-bezier(0.5, 0, 0.75, 0);
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-in-out-quart: cubic-bezier(0.76, 0, 0.24, 1);
  --ease-living: cubic-bezier(0.4, 0, 0.2, 1);  /* default for life-like motion */
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1); /* sparingly, for delight */
}
```

**Rule 3: Speed is calibrated.**

```css
:root {
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-base: 300ms;
  --duration-slow: 500ms;
  --duration-cinematic: 800ms;
  --duration-page-load: 1500ms;
}
```

UI feedback (hover, click): instant or fast. State transitions: base. Page transitions: slow. Hero moments (preloader, strategy deployment): cinematic.

**Rule 4: Life pulses.** Living strategies have a heartbeat. Every active strategy element in the UI has a subtle pulse animation:

```css
@keyframes heartbeat {
  0%, 100% { 
    opacity: 1;
    transform: scale(1);
  }
  50% { 
    opacity: 0.85;
    transform: scale(1.02);
  }
}

.is-alive {
  animation: heartbeat 2.4s var(--ease-living) infinite;
}
```

### 6.2 Signature Animations

**The Preloader** (inspired by overflow.sui.io)

When the app first loads, a center-aligned sequence:

```
        initializing...
        
        ████████░░░░░░░░  47%
        
        synthesizing genome
```

The percentage counts up, the loading bar fills, and the bottom text cycles through stages: `synthesizing genome → calibrating oracles → seeding population → ready.` At 100%, the bar dissolves into a DNA double-helix that twists into existence as the logo. Total duration: 1.5–2 seconds.

**Strategy Birth**

When a strategy is deployed, a 2-second cinematic moment:
1. Conviction Canvas dissolves to black (300ms)
2. DNA double-helix forms from particles in center (600ms)
3. Helix expands, fades to reveal the new Strategy Card (800ms)
4. Card "breathes" — first pulse animation (300ms)

**Strategy Death**

When a strategy hits its kill switch:
1. Pulse animation accelerates briefly (warning)
2. Color shifts from aqua to coral (300ms)
3. Slow desaturation to grayscale (1000ms)
4. Card settles into "fossilized" state — readable but muted

**Breeding Animation**

When two strategies breed:
1. Two parent cards highlight with aqua glow
2. DNA strands extract from each (visualized as floating helices)
3. The two helices weave together in a central reveal
4. The new child card materializes
5. Royalty notification appears for both parent owners

**Lineage Reveal**

When a user clicks "View Lineage" on a strategy:
1. The card recedes
2. The background dims further
3. The force-directed graph fades in, edges drawing from selected strategy outward
4. Camera "zooms out" to reveal full ancestry tree

---

## 7. Component Library

### 7.1 Buttons

Three variants, each with clear personality.

**Primary (CTA)**
```css
.btn-primary {
  background: var(--cream);
  color: var(--void);
  padding: 14px 28px;
  border-radius: 100px;  /* fully rounded pill */
  font-family: var(--font-sans);
  font-weight: 500;
  letter-spacing: -0.01em;
  transition: all var(--duration-fast) var(--ease-out-quart);
}
.btn-primary:hover {
  background: var(--aqua);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px var(--aqua-glow);
}
```

**Secondary**
```css
.btn-secondary {
  background: transparent;
  color: var(--cream);
  border: 1px solid var(--line-strong);
  padding: 13px 27px;
  border-radius: 100px;
}
.btn-secondary:hover {
  border-color: var(--cream);
  background: var(--cream);
  color: var(--void);
}
```

**Ghost**
```css
.btn-ghost {
  background: transparent;
  color: var(--cream-muted);
  padding: 12px 16px;
  border-radius: 8px;
}
.btn-ghost:hover {
  color: var(--cream);
  background: var(--surface-elevated);
}
```

### 7.2 Cards

The Strategy Card is the central recurring unit. It should feel like a living thing.

```
┌───────────────────────────────────────────────┐
│  ◉  STRATEGY-#0042            ALIVE  +12.4%  │  ← header row: status indicator, ID, fitness
│                                                │
│  Moderately Bullish · ~1hr · Choppy Vol       │  ← human-readable DNA summary
│                                                │
│       [   sparkline equity curve   ]          │  ← live performance preview
│                                                │
│  ░░░░░░░░░░░ DNA TRAITS ░░░░░░░░░░░░          │
│  Δ Delta +0.32   Γ Gamma +0.08                │  ← key Greeks
│  ν Vega -2.1    Θ Theta -0.05                │
│                                                │
│  GEN 3 · 2 PARENTS · 4 OFFSPRING               │  ← lineage stats
│                                                │
│  [view detail]    [breed]    [copy]            │
└───────────────────────────────────────────────┘
```

Cards have:
- Subtle border: `1px solid var(--line)`
- Background: `var(--surface)`
- Hover: border becomes `var(--line-strong)`, slight upward translate
- Tilt/parallax on hover (using mousemove offsets, per overflow.sui.io technique)
- Heartbeat pulse if status is alive

### 7.3 The Conviction Canvas (The Hero Component)

This is the signature interactive piece. Full attention to detail.

**Layout**

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│              what do you believe about BTC?                        │  ← Instrument Serif, large
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │           [probability cone visualization]                   │ │
│  │                                                              │ │
│  │       current price ─────────────────────●                   │ │
│  │                                          ╱╲                  │ │
│  │                                         ╱  ╲                 │ │
│  │                                        ╱    ╲                │ │
│  │                                       ╱      ╲               │ │
│  │              market belief ─────────●         ●─── your belief│ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│   DIRECTION                                                        │
│   strong bear ◀─────────────────●────────────────▶ strong bull     │
│                                                                    │
│   CONFIDENCE                                                       │
│   maybe ◀─────────────●────────────────────────▶ certain          │
│                                                                    │
│   TIME HORIZON                                                     │
│   hours  ─  days  ─  weeks  ─●─  months                            │
│                                                                    │
│   VOLATILITY VIEW                                                  │
│   calm ◀─────────────────────●─────▶ explosive                    │
│                                                                    │
│                                                                    │
│   CONSTRAINTS                                                      │
│   max loss: 200 USDC ▼     capital: 1,000 USDC ▼                  │
│                                                                    │
│                                                                    │
│                    ╔═══════════════════════════╗                   │
│                    ║   COMPILE CONVICTION  →   ║                   │
│                    ╚═══════════════════════════╝                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Interactions:**

- The probability cone visualization updates in **real-time** as the user adjusts sliders. As they drag the direction slider right, the cone shifts right. As confidence increases, the cone narrows.
- The market-implied probability is shown alongside the user's belief — the visible divergence is *where the alpha lives*.
- Sliders have a subtle magnetic-snap to common values (0, 25, 50, 75, 100).
- Slider thumbs glow aqua when actively dragged.
- The "Compile Conviction" button is the central CTA. It uses the Genesis Gradient background. Disabled state: greyscale. Hover: slight scale + glow.

**On Click:**

1. Button morphs into a loading indicator
2. The canvas dims slightly
3. A status text appears below the button: "reading oracles..." → "calibrating IV surface..." → "enumerating structures..." → "selecting optimal..."
4. The compiled strategy fades in below, with payoff curve + Greeks
5. "Deploy" button appears with Genesis Gradient

### 7.4 The Risk Compass

A radar chart with 5 axes (Delta, Gamma, Vega, Theta, Rho), each showing portfolio-wide netted exposure.

```
                    DELTA
                      ●
                    ╱   ╲
                  ╱       ╲
                ╱           ╲
   RHO ●──────●─────────────●────── GAMMA
                ╲           ╱
                  ╲       ╱
                    ╲   ╱
                      ●
                    THETA
                      
                  (center pulsing aqua = healthy)
                  (center pulsing coral = breach)
```

- Each axis shows: axis name, current value, tolerance range (shaded zone)
- The "shape" of the polygon shows portfolio risk profile
- When any axis exceeds tolerance, that axis flashes coral
- Click any axis to drill into contributing positions
- A single-line summary above: "Portfolio Health: Healthy" or "Vega exposure exceeds tolerance"

### 7.5 The Lineage Tree

Force-directed graph using D3.js or react-force-graph (with WebGL renderer).

- Nodes are circles, sized by capital, colored by status
- Active strategies pulse with the heartbeat animation
- Edges are subtle aqua lines, thicker for parent-child, thinner for cousin relationships
- Lineage groups visually cluster (the force layout handles this naturally)
- Hover a node: tooltip with key stats
- Click a node: side panel slides in with detail
- Pan/zoom with mouse, pinch on mobile
- Filter controls: by generation, fitness, regime, age
- Bottom: a time-scrubber for "time machine" mode

---

## 8. Page-by-Page Design

### 8.1 Landing Page

The marketing-style entry point. Inspired heavily by overflow.sui.io's editorial scroll.

**Above the fold:**

- Hero headline in Instrument Serif: `Don't build strategies. Express convictions.`
- Subhead in Geist Sans: `The first financial platform where strategies are living organisms.`
- CTA: `Begin →` (Genesis Gradient button)
- Below: small system text `// initializing helix v0.1` (the system-boot aesthetic)

**Scroll section 1: The Three Walls**
- Editorial layout: large serif statement + supporting body text
- Asymmetric placement
- Scroll-triggered fade-up reveal

**Scroll section 2: The Conviction Canvas Preview**
- An animated preview of the Conviction Canvas in action
- Sliders moving on their own (autoplay)
- Probability cone responding
- "This is how it feels" text

**Scroll section 3: The Living Ecosystem**
- Animated lineage tree preview
- Strategies birthing, dying, breeding in real-time mock data
- "Strategies are not records. They are organisms."

**Scroll section 4: The Research**
- Six paper citations in editorial style
- Numbered like a journal: 01, 02, 03...
- Each with: author, paper title, year, one-sentence summary of how HELIX uses it

**Scroll section 5: Footer**
- Minimal: HELIX logo, link to docs, link to GitHub, link to demo

### 8.2 Conviction Canvas Page

Already detailed above. This is the primary action page.

### 8.3 My Strategies Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  MY STRATEGIES                                                  │
│                                                                 │
│  ┌────────┬────────┬────────┬────────┐                          │
│  │ ALIVE  │ ALL    │ COPIED │ BRED   │                          │
│  │   3    │   7    │   2    │   1    │                          │
│  └────────┴────────┴────────┴────────┘                          │
│                                                                 │
│  PORTFOLIO RISK COMPASS                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                         │    │
│  │              [Risk Compass radar chart]                 │    │
│  │                                                         │    │
│  │   Portfolio Health: Healthy                             │    │
│  │   Total Capital: 5,000 USDC                             │    │
│  │   Net P&L: +247 USDC (+4.9%)                            │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ACTIVE STRATEGIES                                              │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Strategy    │  │ Strategy    │  │ Strategy    │              │
│  │ Card #0042  │  │ Card #0089  │  │ Card #0107  │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                 │
│  CLOSED STRATEGIES                                              │
│  [grid of muted cards...]                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Strategy Detail Page

Multi-section detail view:
- Header: strategy ID, status indicator, current PnL prominent
- DNA breakdown: human-readable list of all genes
- Payoff curve (full-width interactive)
- Equity curve (live updating)
- Greeks table
- Lineage section: visual mini-tree showing parents/offspring
- Actions: Deploy More Capital, Close, Mark as Breedable, Mark as Copyable
- Activity log: every event in this strategy's life

### 8.5 Lineage Tree Page (Ecosystem Map)

Full-screen visualization. Filters dock to the right. Time scrubber at the bottom. Detail panel slides in from the right when a node is selected.

### 8.6 Marketplace

```
┌─────────────────────────────────────────────────────────────────┐
│  MARKETPLACE                                                    │
│                                                                 │
│  ┌────────────────┬─────────────────┐                           │
│  │ COPYABLE       │ BREEDABLE       │                           │
│  └────────────────┴─────────────────┘                           │
│                                                                 │
│  FILTERS:                                                       │
│  Fitness ≥ [70]   Generation = [any]   Regime = [bull, calm]    │
│  Trait: vol-selling ◉  momentum ○  mean-rev ○                   │
│                                                                 │
│  TOP PERFORMERS                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ #1  Strategy-#0042  +18.2%  Δ Sharpe 2.4  Gen 3          │   │
│  │ #2  Strategy-#0089  +15.7%  Δ Sharpe 2.1  Gen 2          │   │
│  │ #3  Strategy-#0107  +14.3%  Δ Sharpe 1.9  Gen 4          │   │
│  │ ...                                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. The Immersive Experience Details

### 9.1 Custom Cursor

Inspired by overflow.sui.io's magnetic cursor. A small aqua dot follows the actual cursor with slight lag (using lerp). On hover over interactive elements, the dot expands into a ring. On hover over a strategy card, the dot pulses in time with the card's heartbeat.

```javascript
// Cursor follow with lerp
function updateCursor() {
  cursorX += (mouseX - cursorX) * 0.15;
  cursorY += (mouseY - cursorY) * 0.15;
  cursorEl.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
  requestAnimationFrame(updateCursor);
}
```

### 9.2 Background Atmosphere

The void background is not flat. Subtle layers create depth:
- Very faint radial gradient near the top
- Occasional subtle particle drift (slow-moving cyan dots, very sparse, very low opacity)
- Page-level slight grain texture (SVG noise filter at 5% opacity)

Like staring into deep ocean — you see the void, but you sense things moving in it.

### 9.3 Sound (Optional, Toggleable)

For the brave: a very subtle ambient soundscape on the lineage tree page. Deep ocean hums, occasional gentle pulse sounds when a new strategy is born somewhere in the ecosystem. Default: muted. User can enable with a small icon.

### 9.4 Tilt/Parallax Interactions

Every Strategy Card responds to cursor movement with subtle 3D tilt:

```javascript
function handleCardTilt(card, event) {
  const rect = card.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  
  card.style.transform = `
    perspective(1000px)
    rotateY(${x * 8}deg)
    rotateX(${-y * 8}deg)
    translateZ(10px)
  `;
}
```

### 9.5 Scroll Orchestration

Use Intersection Observer for scroll-triggered reveals. Staggered timing (each element fades up 100ms after the previous one). Direction: subtle (translateY of 20px). Easing: `--ease-out-quart`.

---

## 10. Tech Stack

### 10.1 Core
- **Framework:** Next.js 15 with App Router
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS + custom CSS variables for design tokens
- **State:** Zustand (small, no boilerplate)

### 10.2 UI Libraries
- **Animation:** Motion (formerly Framer Motion)
- **Components:** Radix UI primitives (for dropdowns, dialogs, tooltips) — unstyled, fully customizable
- **Icons:** Lucide React (clean, consistent, free) — but design custom icons for HELIX-specific concepts (DNA helix, conviction, lineage)

### 10.3 Visualizations
- **Payoff curves:** D3 + Recharts (or just D3 for full control)
- **Lineage tree:** `react-force-graph` with WebGL renderer (supports thousands of nodes at 60fps)
- **Risk Compass:** Custom SVG component (radar chart is small enough to hand-build)
- **Equity curves:** Recharts
- **Particle effects:** `tsParticles` or hand-rolled Canvas for full control
- **DNA helix:** Custom Three.js scene for the preloader and birth animation

### 10.4 Web3
- **Sui SDK:** @mysten/sui (the new unified package)
- **Wallet:** @mysten/dapp-kit (handles connection, zkLogin, transaction signing)
- **Real-time:** WebSocket subscriptions via custom hook

### 10.5 Fonts
- Self-hosted via Next.js font optimization
- Subset to only the characters used
- Variable fonts where available (Fraunces, Bricolage Grotesque)

---

## 11. Accessibility

Editorial design must not exclude. Accessibility is a baseline, not an afterthought.

- All interactive elements keyboard-accessible
- Focus rings visible (custom-styled, aqua, 2px offset)
- ARIA labels on custom components
- Animations respect `prefers-reduced-motion` — degrade to static reveals
- Color contrast: cream on void is 14:1 (AAA)
- Cream-muted on void: 7:1 (AAA)
- Touch targets minimum 44x44px on mobile
- Screen reader labels for all visualizations (lineage tree, Risk Compass, payoff curves)

---

## 12. Performance Budgets

| Metric | Budget |
|---|---|
| First Contentful Paint | < 1.2s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Cumulative Layout Shift | < 0.1 |
| Total JS (gzipped) | < 250KB initial |
| Total CSS (gzipped) | < 30KB initial |
| Lighthouse Performance | > 90 |
| Lighthouse Accessibility | > 90 |

Techniques:
- Code-split visualizations (lineage tree only loaded when needed)
- Lazy-load Three.js (only for preloader and birth animations)
- Self-host fonts with `font-display: swap`
- Image optimization via Next.js Image
- Aggressive caching of static assets

---

## 13. The Voice and Tone

How HELIX talks to users matters as much as how it looks.

**Voice principles:**
- **Confident, not boastful.** "Your strategy is alive" not "Awesome! Your strategy is now live!"
- **Editorial, not corporate.** "Three walls separate retail traders from sophisticated finance" not "Empowering financial inclusion."
- **Living, not technical.** "This strategy was born from two parents" not "This strategy was created by combining two existing strategies."
- **Honest about complexity.** "This is a complex moment. Take your time." not hiding complexity behind oversimplification.

**Microcopy examples:**

| Context | Don't | Do |
|---|---|---|
| Deploy button | "Submit" | "Bring to life" |
| Empty strategy list | "No strategies yet" | "Your ecosystem is dormant. Plant a conviction." |
| Loading compile | "Compiling..." | "Reading the market's pulse..." |
| Tolerance breach | "Warning: risk exceeded" | "Your portfolio is breathing harder than usual." |
| Strategy death | "Strategy closed" | "This strategy reached the end of its life." |
| Successful breed | "New strategy created" | "A new strategy was born." |

---

## 14. Visual Signature

Every screen should have at least one element that says "this is HELIX, not another DeFi app."

The signature elements are:
- The DNA double-helix in the corner of every page (subtle, animated, low-opacity)
- The aqua heartbeat on living things
- The Instrument Serif headlines
- The void background with subtle atmospheric particles
- The cream typography
- The Genesis Gradient on primary CTAs

If a screen lacks all of these, it has lost its identity. Audit ruthlessly.

---

## 15. Inspiration & Reference

- **overflow.sui.io** — for editorial scroll, system-boot aesthetic, magnetic cursor, dark editorial palette
- **Stripe** — for clarity in dense data display, content rhythm
- **Vercel** — for the Geist family, technical-yet-elegant
- **Linear** — for keyboard-first interactions, smooth transitions
- **The Verge editorial** — for serif headline + sans body pairing
- **National Geographic deep-ocean documentaries** — for bioluminescent palette inspiration
- **23andMe** — for genetic visualization (lineage tree should evoke familial DNA charts)

What we explicitly avoid: Uniswap (too cute), most NFT marketplaces (chaotic), generic crypto dashboards (forgettable).

---

## 16. Closing Note

The frontend is not decoration. It is the product. Users will not buy "an options compiler" — they will buy the *feeling* of expressing a conviction and watching it come alive.

Every animation, every color choice, every typography decision either serves that feeling or distracts from it. When in doubt, ask: does this make the user feel like they are tending a living thing? If yes, keep it. If no, cut it.

Editorial discipline. Bioluminescent life. The fusion is the brand.
