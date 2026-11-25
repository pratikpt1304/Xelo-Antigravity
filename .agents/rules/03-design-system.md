---
trigger: glob
globs: "src/**/*.tsx, src/**/*.css, index.html, app/index.html, src/landing/**"
description: XeIO design tokens, components and branding. Apply whenever writing or changing UI.
---

# Design system (final; no other colours or fonts)

Match the reference canvas (`docs/ui/`). When a screen exists on the canvas, copy its layout, labels and order. Do not redesign it.

## Tokens (CSS custom properties in `src/styles.css`)

| Token | Value | Use |
|---|---|---|
| `--rail` | `#141413` | Sidebar, student header, IDE chrome, primary buttons |
| `--paper` | `#F4F3EF` | App background |
| `--surface` | `#FFFFFF` | Cards |
| `--surface-alt` | `#FBFAF7` | Selected rows, problem panel |
| `--border` / `--border-soft` | `#E2E0D8` / `#EFEDE6` | 1 px borders, row dividers |
| `--ink` / `--muted` / `--faint` | `#141413` / `#6B6A63` / `#9C9A92` | Text |
| `--teal` / `--teal-tint` | `#0E5E52` / `#E6F0EC` | Done, approved, passed, small primary actions |
| `--assist` / `--assist-tint` | `#C2410C` / `#FFF1E8` | Assist suggestions, warnings, below target |
| `--danger` / `--danger-tint` | `#9F1D1D` / `#FBEAEA` | Absent, failed, declined |
| brand blue | `#3FA9F5` on dark, `#1F5FE0` on light | "IO" in the wordmark and focus rings only |
| `--editor-bg` / `--console-bg` | `#1B1B1A` / `#11110F` | Code editor and console |

**Type:**
- IBM Plex Sans for UI: 14 px body, 13 px secondary, 26 px page titles, headings at weight 600.
- IBM Plex Mono for numbers, roll numbers, code, timers and kickers (e.g. `STEP 6 · RUN`).
- IBM Plex Serif only for the printed lab file title page.
- Use tabular numerals in tables.

## Components (`src/components/ui.tsx`; reuse, do not restyle per page)

- **Basics:** `Card` (title, actions, body; optional no-padding for tables), `Chip` (good, warn, bad, neutral), `Banner` (ok, err, info), `Seg` (segmented control), `PageHead` (kicker, title, lead, actions), `Empty`, `Loading`, `ErrorNote`, `Stepper` (locked stages greyed and not clickable), `Modal` (focus trap, Esc closes), `Bar` (percentage with a target line), `Kpis` (row of headline numbers), `statusTone(status)`.
- **Cards and controls:** radius 6 px, 1 px borders, no shadows, no gradients. One primary action per card. Minimum target 32 px (44 px on student mobile).
- **Status colours:** teal = done, orange = needs attention, red = failed or absent, grey = pending.

## Layouts

- **Faculty workspace:** three columns.
  - Left: a dark rail with the course card and nine steps grouped Plan (1–3), Prepare (4–5), Run (6–8) and Complete (9). Each step shows a count or state. A "by elzeo" foot.
  - Centre: the step's panel.
  - Right: Next best actions (rule-based Assist suggestions, each with one button) and a Today agenda.
  - Top bar: Ask box (natural-language navigation, rule-based), live-lab chip, Preview as student, AI credit meter, notifications bell, name and sign out.
- **Student app:** a dark header with XeIO + elzeo wordmark and the tabs Home, Classroom, Today's lab, Lab file and End-sem. The last three show only when relevant. Also a notifications bell, name and roll, and sign out. Below that, content at max 1240 px and a footer crediting Elzeo.
- **Full-screen lab IDE (LeetCode-style):**
  - Top bar 44 px: Q1/Q2 tabs with status dots, language select, status chips, Run and Submit.
  - Left panel 25% (min 260 px): problem, visible tests and hidden summary.
  - Editor: 75% width, top 75%.
  - Console: bottom 25%.
- **HOD, Dean/CoE/VC and super admin consoles:** a dark rail with tabs (badges for waiting counts), and a top bar with the bell, email and sign out.

## Branding

- **Wordmark:** "Xe" in the text colour, "IO" in brand blue, IBM Plex Sans 600. The faculty rail reads "XeIO Assist".
- **elzeo logo:** the white version on dark surfaces, the navy version on paper and in print. Never recolour or stretch it. Keep clear space of at least the height of the "e".
- **Placement:** the sign-in left panel ("Designed and maintained by" + logo), the faculty rail foot, the student header and footer.
- **Every PDF or printout footer:** "XeIO · designed and maintained by Elzeo Future Technologies Pvt Ltd, India".
- Logo files: ask the user for the SVGs. Until then, use a text placeholder with the same box size.

## Accessibility (WCAG 2.1 AA)

- Visible focus ring.
- Every input has a label; every icon-only button has `aria-label`.
- Tables use `th`; modals trap focus.
- Charts have `role="img"` and an `aria-label` summarising the data.
- The IDE is usable by keyboard.
- Contrast at least 4.5:1 for text.

## Print

- `@media print` hides `.no-print`, the rails and headers.
- The course file, lab file and lab files sheets print as clean A4 pages.
