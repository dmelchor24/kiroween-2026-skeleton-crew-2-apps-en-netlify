# Implementation plan: system-design
> Prerequisite: none. Run from the repository root. No `.sh` files.
- [x] 1. Create `src/styles/tokens.css`
  - Write the `src/styles/tokens.css` block from `design.md` (equivalent to the default palette).
  - _Requirements: 1, 3_
- [x] 2. Create `public/manifest.webmanifest`
  - Write the `public/manifest.webmanifest` block from `design.md`.
  - _Requirements: 5.1_
- [x] 3. Apply the palette to the PWA
  - Run the `apply-palette` block from `design.md` inline with `python3 - <<'PY'` from the root (do not save the script).
  - Verify that `public/icons/apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` exist.
  - Report to the user any `WARNING contrast` line.
  - _Requirements: 2.2, 2.3, 4, 5.2_
- [x] 4. Explain to the user how to change the design
  - Say: "To change colors or fonts, edit the table in `.kiro/specs/01-system-design/design.md` and tell me "apply design"; or ask me for an example palette".
  - _Requirements: 1, 2_
- [x] 5. Checkpoint
  - Confirm that `tokens.css` contains the 18 color variables per mode, the 3 fonts and the 2 radii from the table.
  - Close: mark this spec as complete in `00-orchestrator/tasks.md` and announce the next spec (`02-web-portal`).
