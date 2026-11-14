# Design rules

Every page in `frontend/` follows these rules. Tokens and component classes live in `frontend/app/globals.css`; shared pieces live in `frontend/app/ui/`. The product is **Sapien** (set once in `frontend/lib/brand.ts`).

The look follows tines.com's layout and component style: cream page, violet as the single brand colour, big geometric sans headlines, serif supporting lines, mono uppercase pill buttons, outlined cards in a family of soft colours, and colourful illustration. The logo, mascot, illustrations, copy and fonts are our own; never copy Tines' logo, mascot, flower art, wording or customer logos.

## Fonts

| Use | Font | Class |
| --- | --- | --- |
| Headlines | Instrument Sans 500, violet | `display-1` (one per page), `display-2`, `display-3` |
| Serif headlines and supporting lines | Newsreader | `display-serif`, `title-serif`, `lede` |
| Body and controls | Instrument Sans | default |
| Buttons, labels, eyebrows | Geist Mono 700, uppercase | `btn`, `eyebrow`, `label-mono`, `chip` |

## Colour

| Token | Use |
| --- | --- |
| `cream`, `cream-raised`, `cream-sunk` | Page, cards, inset areas |
| `violet`, `violet-deep`, `violet-ink` | Brand: headings, links, buttons, marketing body text |
| `violet-soft`, `violet-tint`, `violet-line` | Panels, hovers, borders |
| `orange`, `green`, `pink`, `blue`, `gold`, `teal`, each with `-soft` | Outlined cards and illustration. On status: green = passed, gold = waiting, orange = stop or loss |
| `ink`, `ink-soft`, `ink-faint`, `line` | Text and borders inside app pages |

## Components

- **Nav**: `SiteNav`, a floating frosted bar with fully rounded ends, about 62px high, inset from the edges.
- **Buttons**: `btn` + `btn-primary` (filled violet), `btn-secondary` (1px violet outline) or `btn-gradient` (multi-colour outline). One size everywhere, taken from the reference: 13px bold mono, min height 2.75em, padding 0 1.4em, min width 6.5em.
- **Cards**: `card` (white) or `card-outline` with a colour class such as `text-green border-green`, for outlined cards whose text takes the same colour.
- **Chips**: `chip`, plus `chip-forest`, `chip-amber`, `chip-clay` or `chip-solid`.
- **Art**: `MarketGarden` (candlesticks and coins), `VaultBot` (the mascot), `VaultRow`, `PillarArt` and `Icon`, all in `app/ui/art.tsx`.
- **Brand logos**: `BrandMark` in `app/ui/brand-icons.tsx`. Only for projects we actually build on, taken from their own sites or Simple Icons, tinted violet.

## Layout

- `container-page` (max 90rem) for wide sections, `container-narrow` (max 75rem) for text-led ones, `section` for vertical rhythm.
- Hero: centred, announcement pill, mascot beside a two-line headline, serif line, logo strip, two buttons, then a product panel.

## Words

- Use `GLOSSARY.md` terms, capitalised as there (Vault, Mandate, Bond, Overshoot).
- Say "stop-loss protected". Never say "guaranteed".
- Mark mock data on marketing pages as an illustration.
