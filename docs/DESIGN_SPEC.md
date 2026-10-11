# DESIGN SPEC — Cook for Friends Platform

Status: **PLACEHOLDER BRAND** (decision D4 pending). Every visual value lives in one file: `apps/web/src/styles/tokens.css`. Swapping the brand = editing that file (plus font imports in `src/app/(frontend)/[locale]/layout.tsx`). No component may hard-code a color, font, radius, shadow or duration.

---

## 1. Token architecture

Two layers:
1. **Brand primitives** (`--brand-*`): raw values. The only layer the brand swap touches.
2. **Semantic tokens** (`--color-*`, `--font-*`, `--radius-*` …): what components use. They map to primitives.

Tailwind v4 reads semantic tokens through `@theme inline` in `globals.css`, so utilities like `bg-surface`, `text-fg-muted` and `rounded-card` resolve to CSS variables. shadcn/ui variables (`--background`, `--primary`, …) are aliased to the same semantic tokens.

```css
/* apps/web/src/styles/tokens.css — PLACEHOLDER VALUES */
:root {
  /* ── Brand primitives (swap here) ───────────────────────── */
  --brand-ink: oklch(22% 0.01 60);        /* near-black, warm */
  --brand-paper: oklch(98.5% 0.005 80);   /* off-white, warm */
  --brand-stone-100: oklch(95% 0.006 70);
  --brand-stone-200: oklch(90% 0.008 70);
  --brand-stone-400: oklch(72% 0.01 70);
  --brand-stone-600: oklch(50% 0.012 70);
  --brand-accent: oklch(55% 0.12 45);     /* placeholder terracotta — swap with brand */
  --brand-accent-ink: oklch(98% 0 0);
  --brand-font-display: "Fraunces", Georgia, "Times New Roman", serif;
  --brand-font-body: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* ── Semantic: color ────────────────────────────────────── */
  --color-bg: var(--brand-paper);
  --color-surface: oklch(100% 0 0);
  --color-surface-muted: var(--brand-stone-100);
  --color-border: var(--brand-stone-200);
  --color-fg: var(--brand-ink);
  --color-fg-muted: var(--brand-stone-600);
  --color-fg-subtle: var(--brand-stone-400);
  --color-primary: var(--brand-accent);
  --color-primary-fg: var(--brand-accent-ink);
  --color-focus: var(--brand-accent);
  --color-success: oklch(55% 0.12 150);
  --color-warning: oklch(70% 0.14 80);
  --color-danger: oklch(55% 0.18 27);
  --color-info: oklch(55% 0.1 240);

  /* ── Semantic: domain states ───────────────────────────── */
  --color-seats-ok: var(--color-success);
  --color-seats-low: var(--color-warning);     /* ≤ 3 seats left */
  --color-seats-full: var(--color-fg-subtle);  /* sold out → waitlist */

  /* ── Typography ────────────────────────────────────────── */
  --font-display: var(--brand-font-display);
  --font-body: var(--brand-font-body);
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: clamp(1rem, 0.96rem + 0.2vw, 1.0625rem);
  --text-lg: 1.25rem;
  --text-xl: clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem);
  --text-2xl: clamp(2rem, 1.6rem + 1.6vw, 2.75rem);
  --text-hero: clamp(2.5rem, 1.6rem + 4vw, 4.75rem);
  --leading-tight: 1.1;
  --leading-body: 1.6;

  /* ── Space & layout ────────────────────────────────────── */
  --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem;
  --space-6: 1.5rem; --space-8: 2rem; --space-12: 3rem; --space-16: 4rem;
  --space-section: clamp(3rem, 2rem + 5vw, 7rem);
  --container-max: 72rem;
  --container-prose: 42rem;

  /* ── Shape & depth ─────────────────────────────────────── */
  --radius-sm: 4px;
  --radius-control: 8px;
  --radius-card: 14px;
  --radius-full: 9999px;
  --shadow-card: 0 1px 2px oklch(0% 0 0 / 0.04), 0 8px 24px oklch(0% 0 0 / 0.06);
  --shadow-raised: 0 2px 4px oklch(0% 0 0 / 0.06), 0 16px 40px oklch(0% 0 0 / 0.1);

  /* ── Motion ────────────────────────────────────────────── */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 0ms; --duration-normal: 0ms; }
}
```

Fonts: loaded with `next/font/google` (self-hosted at build, `display: swap`), two families max, and only these weights: display 500/600, body 400/500/600. The placeholders Fraunces and Inter can be swapped. Brand candidate noted in DISCOVERY R3: the Hub uses Cormorant Garamond + DM Sans with rose `#D4537E` and cream `#FDF8F5`. **Do not adopt it without D4.**

Dark mode: **not in MVP.** The tokens are structured so a `[data-theme="dark"]` block can be added later without component changes.

## 2. Layout rules
- Mobile-first. Breakpoints: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`). Test at 320, 375, 768, 1024, 1440.
- Container: `max-width: var(--container-max)`, side gutter ≥ 16px at every width.
- Section rhythm: `padding-block: var(--space-section)`. Alternate `--color-bg` and `--color-surface-muted` bands. Spacing is deliberately not uniform: the hero and editorial sections get more air than lists do.
- Course imagery is the hero of the product: food photography at full bleed or in large aspect-ratio frames (`4/5` cards, `16/9` hero). Always use `next/image` with explicit `sizes`. Only the hero image gets `priority`.

## 3. Components (shadcn/ui base, restyled through tokens)

| Component | Where | Variants / rules |
|-----------|-------|------------------|
| `Button` | everywhere | `primary` (accent fill), `secondary` (outline), `ghost`, `link`. Sizes `sm`, `md`, `lg`. Visible focus ring `2px var(--color-focus)` with offset 2px. Loading state keeps the button's width |
| `CourseCard` | catalog, home | Image 4/5, format badge (`En personne` / `En ligne`), title (display font), level, duration, price (`45,00 $` in FR, `$45.00` in EN, via `Intl.NumberFormat(locale, { currency: 'CAD' })`), next session date for in-person |
| `SeatBadge` | session picker | `ok` / `low` ("Plus que 2 places") / `full` → switches the CTA to "Liste d'attente" |
| `SessionPicker` | course detail | List grouped by month. Each row: date (localized long format, America/Toronto), time range, location name, seats badge, select radio. Keyboard navigable (radio group semantics) |
| `CartDrawer` / cart page | storefront | Line items, hold countdown (mm:ss) once checkout starts, promo codes entered on Stripe Checkout (not in our UI) |
| `LocaleSwitcher` | header | `FR · EN` text toggle. Keeps the current path via next-intl `usePathname` + `Link locale` |
| `LessonList` | player | Ordered, completed check, current-lesson highlight, progress bar for the course |
| `VideoPlayer` | player | Wraps the provider player. Fetches a playback URL on mount and refreshes before `expiresAt`. Shows a poster plus a localized error state on 403 |
| `CertificateCard` | history | Course, date, "Télécharger le certificat" button, verification code shown in mono |
| `EmptyState` | portal | Illustration slot + localized message + primary action (for example "Découvrir les cours") |
| `Toast` | global | shadcn `sonner`. Messages always come from i18n keys |
| `FormField` | forms | Label above the input, help text, error text in `--color-danger` with `aria-describedby` |

Page builder blocks (`hero`, `gallery`, `testimonials`, `cta`, `richText`) render in `src/components/storefront/blocks/*`. One component per block. Props = the Payload block type.

## 4. States and interaction
- Every interactive element has designed hover, focus-visible and active states. Hover lifts cards with `translateY(-2px)` + `--shadow-raised`. Motion uses only `transform` and `opacity`.
- Loading: skeletons matching the final layout on lists. Spinners only inside buttons.
- Errors: inline for forms. Full-page localized `error.tsx` for each segment. Messages come from `errors.<code>` keys (CONTRACT §2).
- Sold out: never hide a session. Show it as full with a waitlist CTA.

## 5. Accessibility
- WCAG 2.2 AA. Text contrast ≥ 4.5:1 against `--color-bg` and `--color-surface`. **Any brand swap must re-verify contrast.**
- Semantic landmarks (`header`, `nav`, `main`, `footer`). One `h1` per page. `lang` attribute on `<html>` = current locale.
- Focus is managed on route change in the portal player (move focus to the lesson title).
- Video captions: the player shows captions when the provider has them. Recommend that the client upload FR captions.

## 6. Email and PDF
- React Email templates use a reduced token set inlined at build time (bg, fg, accent, font fallbacks: Georgia / Arial). Max width 600px. FR and EN, chosen by recipient locale.
- Certificate PDF (`@react-pdf/renderer`): A4 landscape, display font for the name, course title, date (localized), verification code + verify URL, logo placeholder.

## 7. Do NOT
- Hard-code hex, rgb or oklch values outside `tokens.css`.
- Use default shadcn styling unmodified as a finished design.
- Use uniform spacing everywhere or gradient-blob heroes.
- Put any customer-facing string in components without i18n.
- Animate layout properties (width, height, top, left, margin, padding).
- Add a third font family.
