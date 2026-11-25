---
name: xeio-parity-check
description: Compare built XeIO screens against the reference canvas and docs/screens.md, list every missing element, flow or wording difference, and fix them. Use after building or changing any screen, or when asked whether a page matches the design.
---

# /xeio-parity-check [screen IDs or "all"]

## Steps

1. For each screen ID, open:
   - its lines in `docs/screens.md`
   - its canvas board (live link or `docs/ui/<Board>.dc.html` source)
   - the canvas screenshot in `docs/ui/shots/`
2. Render the built screen with realistic sample data through `scripts/screens` (mocked Supabase) at 1440 px and at 390 px. Run it again with empty data to check the empty states.
3. Make a table per screen with these columns: element or flow, canvas, built, status (✓ / missing / different / extra).
   - Elements to check: every heading, kicker, table column, button label, chip wording, KPI, empty state, modal, step lock, and the order of sections.
   - Behaviour to check: what each button does, what unlocks what, which role sees it, and what notifies whom.
   - The look per rule 03: tokens only, radius 6, 1 px borders, mono numerals, one primary action per card.
4. Fix every "missing" and "different" row now. An "extra" row is allowed only if the PRD requires it; otherwise remove it.
5. Re-render, then run the e2e and screen checks.
6. Write the final table into the phase walkthrough. Any difference you keep on purpose goes in `docs/decisions.md` with the reason.

## Common misses to check every time

- Locked steps or stages that are still clickable.
- Missing bulk actions ("Approve N ready", "Generate N missing", "Assist pick 2 for N sessions").
- Counts in rail steps and tab badges.
- Notifications not sent for a hand-off.
- Empty states that say nothing useful.
- Numbers not in mono or not right-aligned.
- Student header buttons invisible on the dark header.
- Print views that include navigation.
