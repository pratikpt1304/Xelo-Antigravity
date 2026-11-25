# Reference UI (XeIO Sample UI canvas)

These six boards are the visual and flow source of truth. They are interactive mock-ups with sample data.

| File | Board | Size |
|---|---|---|
| `Main.dc.html` | Sign in (all roles) | 1280 × 820 |
| `Faculty.dc.html` | Faculty workspace (Assist): all nine steps, live session, inspector, reports | 1440 × 1800 |
| `Student.dc.html` | Student app: home, classroom, full-screen IDE, lab file, end-sem secure check and proctored IDE | 1440 × 1600 |
| `Hod.dc.html` | HOD console | 1440 × 1300 |
| `Oversight.dc.html` | Dean, CoE and VC console | 1440 × 1200 |
| `SuperAdmin.dc.html` | Super admin console | 1440 × 1200 |

## How to view them

- **Best:** open the published canvas in the browser agent: https://claude.ai/artifact/FMqD1ex7JKtCu1ZTbVSEpz. Click through each board's tabs and steps, and take screenshots to compare against.
- **Offline:** the `.dc.html` files need the canvas runtime (`support.js`), which is not included, so they will not render by opening them directly. Read them as source instead:
  - The HTML inside `<x-dc>` is the layout, with inline styles giving exact spacing, sizes and colours.
  - `{{…}}` placeholders and `<template>` blocks are dynamic content.
  - The `<script type="text/x-dc">` block holds the sample data and the interactions: which button changes which state, what each step shows, and the order of stages.

## How to use them

- Treat labels, column names, button text, chip wording and section order as specified.
- Treat sample names, numbers and dates as fake data. Never hard-code them.
- Where the canvas and the PRD disagree on behaviour, the PRD wins; on look and wording, the canvas wins. Record the case in `docs/decisions.md`.
