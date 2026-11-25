# XeIO — agent brief

You are building **XeIO**, an AI faculty assistant (LMS) that plans, runs and reports programming labs from course setup to the NBA/NAAC course file. It is designed and maintained by **Elzeo Future Technologies Pvt Ltd, India**. The pilot customer is Sanjivani University (email domain `@sanjivani.edu.in`).

You are building it **from an empty repository**. Do not copy code from anywhere else.

## Sources of truth, in order

1. `docs/prd.md`: the product requirements. What to build, rules, numbers and acceptance criteria.
2. `docs/ui/*.dc.html` and the public canvas: the visual and flow source of truth. Layout, copy, states and interactions. See `docs/ui/README.md`.
3. `docs/screens.md`: a screen-by-screen checklist that merges 1 and 2. Every line is an acceptance item.
4. `docs/decisions.md`: decisions already taken, including the stack, open items resolved for the build, and pitfalls to avoid.

If two sources disagree, the higher one wins, except where `docs/decisions.md` explicitly overrides the PRD (stack and hosting). If something is not covered anywhere, ask. Do not invent features, screens, roles or numbers.

## How to work

- Build in the phase order of the `/xeio-build` skill. Each phase is its own skill (`/xeio-00-bootstrap` … `/xeio-08-release`).
- Every phase follows the same order: plan → implement → test → verify against the canvas → walkthrough. Then **stop and wait for approval** before the next phase.
- Use `/xeio-parity-check` after any UI work and `/xeio-release-gate` before any phase is called done.
- Rules in `.agents/rules/` always apply.

## Repository layout to create

```
src/            React app (landing + /app SPA)
supabase/       migrations, seed, edge functions, config
tests/          unit, db (PGlite + RLS), e2e (Playwright)
scripts/        release gate, vendor copy, screen checks
public/         _headers, _redirects, robots.txt, vendored assets
docs/           (this kit) PRD, UI references, screens, decisions
```
