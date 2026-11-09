# Requirements: system-design
## Introduction
Single source of truth for the project's visual design: color palette, fonts and shape. Anyone must be able to change the colors by editing a table, without touching CSS. Everything else in the project (login, shell, chat, policy generator, PWA icons) consumes these values.
## Requirements
### Requirement 1: Editable design table
**User story:** As a person using the template, I want to change colors and fonts in one place, to adapt the brand without hunting for values in the code.
1. THE palette and font table SHALL live at the top of `.kiro/specs/01-system-design/design.md`, in the "Palette (edit here)" section.
2. EACH token SHALL have a value for dark mode and another for light mode, and a usage description in plain language.
3. THE spec SHALL include ready-to-copy example palettes (Ocean Blue, Forest Green).
### Requirement 2: Automatic application
**User story:** As a person using the template, I want a change in the table to be reflected across the whole app with a single instruction.
1. WHEN the user says "apply design" (or saves this spec's `design.md`), THE SYSTEM SHALL regenerate `src/styles/tokens.css` from the table.
2. THE SYSTEM SHALL run the `apply-palette` script (inline block of this spec) to sync `public/manifest.webmanifest` and the PWA's PNG icons with the palette.
3. THE script SHALL run with inline `python3`, without creating `.sh` files or leaving scripts in the repository.
### Requirement 3: No fixed colors or fonts outside `tokens.css`
1. THE project's CSS, HTML and JS files SHALL use `var(--token)` for colors and fonts.
2. ONLY neutral values are allowed: translucent black shadows and the white/black background of the QR code (needed so the QR can be scanned).
3. COLOR transparencies SHALL be expressed with `color-mix(in srgb, var(--token) N%, transparent)` so that changing one hex updates all derived shades.
### Requirement 4: Accessibility
1. THE script SHALL warn when the contrast of `--text` over `--bg` / `--card`, of `--on-accent` over `--accent` or of `--text-muted` over `--card` is below 4.5:1 in either of the two modes.
2. THE warning SHALL NOT block applying the palette.
### Requirement 5: PWA consistent with the design
1. `manifest.webmanifest` SHALL use `--bg` as `background_color` and `theme_color`.
2. THE icons (`apple-touch-icon.png` 180 px, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`) SHALL use `--accent` as the background and `--on-accent` for the mark.
3. AT runtime, `<meta name="theme-color">` SHALL be synchronized with `--bg` (done by `src/shared/theme.js`).
