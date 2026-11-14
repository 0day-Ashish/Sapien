# Design rules

Every page in `frontend/` follows these rules. The tokens and component classes live in `frontend/app/globals.css`; the shared pieces live in `frontend/app/ui/`.

The look is an editorial one: warm paper, near-black ink, large light serif headlines, small mono labels, pill buttons and softly rounded cards. tines.com was the reference for this *kind* of design. The palette, logo, copy and visuals are our own; do not copy theirs.

## Fonts

| Use | Font | Class |
| --- | --- | --- |
| Headlines | Fraunces, weight 300 to 400 | `display-1`, `display-2`, `display-3`, or `font-display` |
| Body and controls | Geist | default |
| Labels, numbers in tables, hashes | Geist Mono | `eyebrow`, `chip`, or `font-mono` |

- One `display-1` per page. Section titles use `display-2`; card titles use `display-3`.
- Lead paragraphs use `lede`. Body text is 15 to 16px in `text-ink-soft` or `text-ink`.
- Small labels above a title or a value use `eyebrow` (mono, uppercase, letter-spaced).

## Colour

| Token | Use |
| --- | --- |
| `paper`, `paper-raised`, `paper-sunk` | Page, cards, alternate bands and inset areas |
| `ink`, `ink-soft`, `ink-faint` | Text: main, secondary, hints |
| `line`, `line-strong` | Borders |
| `night`, `night-raised`, `on-night`, `on-night-soft` | Dark bands and the footer |
| `forest` | Primary accent, links, "passed", success |
| `amber` | Waiting states, such as an open Veto Window |
| `clay` | Stop, kill, loss, errors |

One theme only. Accents carry meaning, so do not use them for decoration: forest means good or go, amber means waiting, clay means stop or loss.

## Layout

- Wrap page content in `container-page`. Give each landing section `section` for vertical spacing.
- Alternate plain sections with `bg-paper-sunk/60` bands; use one `bg-night` band at most per page.
- App pages (Mandate, Vault, and later ones) use a single column up to `max-w-2xl`, or `max-w-5xl` for dashboards.

## Components

- **Buttons**: `btn` plus `btn-primary` (one per view), `btn-secondary`, or `btn-on-night`. Add `btn-lg` for hero actions. Always pill-shaped.
- **Cards**: `card`, with `shadow-card` only for the one card a section is about.
- **Chips**: `chip`, plus `chip-forest`, `chip-amber` or `chip-clay` for status.
- **Logo, nav, footer**: `Logo`, `SiteNav`, `SiteFooter` from `app/ui/`. The product name is set once in `frontend/lib/brand.ts`.

## Words

- Use the terms in `GLOSSARY.md`, capitalised as they are there (Vault, Mandate, Bond, Overshoot).
- Say "stop-loss protected". Never say "guaranteed".
- Mark any mock data on a marketing page as an example.
