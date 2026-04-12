# Phase 1: Foundation — UI Design Contract

**Created:** 2026-04-12
**Phase:** 01-foundation
**Status:** Deferred — user will provide design reference later
**Selected Template:** None — build system/backend first, apply design when provided

---

## 3 Design Templates

Choose ONE template before coding begins. Each uses the Print Ninjaz logo colors (green/blue/black) as the base but applies them differently.

---

## Template A: Bold Ninja (Energetic & Playful)

### Theme & Mood
Energetic, playful, bold. Feels like a gaming store meets maker space. High contrast, punchy CTAs, animated hover effects. Appeals to younger Malaysian audience who want fun, unique products.

### Color Palette (from logo)

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#1B6B2F` | `green-800` custom | Headers, nav, primary buttons |
| Primary Light | `#22C55E` | `green-500` | Hover states, accents, badges |
| Secondary | `#1E40AF` | `blue-800` | Links, secondary actions |
| Secondary Light | `#3B82F6` | `blue-500` | Info badges, highlights |
| CTA / Action | `#F97316` | `orange-500` | Add to Cart, Buy Now, CTAs |
| Background | `#FFFFFF` | `white` | Page background |
| Surface | `#F0FDF4` | `green-50` | Card backgrounds, sections |
| Text Primary | `#0F172A` | `slate-900` | Body text |
| Text Muted | `#475569` | `slate-600` | Descriptions, meta |
| Border | `#E2E8F0` | `slate-200` | Cards, dividers |
| Danger | `#EF4444` | `red-500` | Errors, delete actions |
| Success | `#22C55E` | `green-500` | Success states |

### Typography

| Element | Font | Weight | Size | Line Height |
|---------|------|--------|------|-------------|
| H1 (Hero) | Russo One | 400 | 48px / 3rem | 1.1 |
| H2 (Section) | Russo One | 400 | 32px / 2rem | 1.2 |
| H3 (Card Title) | Russo One | 400 | 24px / 1.5rem | 1.3 |
| Body | Chakra Petch | 400 | 16px / 1rem | 1.6 |
| Body Small | Chakra Petch | 400 | 14px / 0.875rem | 1.5 |
| Button | Chakra Petch | 600 | 14px / 0.875rem | 1 |
| Price | Russo One | 400 | 24px / 1.5rem | 1 |
| Badge | Chakra Petch | 500 | 12px / 0.75rem | 1 |

**Google Fonts:**
```css
@import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@300;400;500;600;700&family=Russo+One&display=swap');
```

### Homepage Layout
```
┌─────────────────────────────────────────────┐
│ [Logo] NAV: Shop | About | Contact  [Cart]  │
├─────────────────────────────────────────────┤
│                                             │
│   HERO: Large ninja illustration bg         │
│   "3D PRINTED. NINJA CRAFTED."              │
│   [SHOP NOW] orange CTA button              │
│                                             │
├─────────────────────────────────────────────┤
│  FEATURED PRODUCTS (3-4 cards, large)       │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐          │
│  │ img │ │ img │ │ img │ │ img │          │
│  │name │ │name │ │name │ │name │          │
│  │MYR  │ │MYR  │ │MYR  │ │MYR  │          │
│  └─────┘ └─────┘ └─────┘ └─────┘          │
├─────────────────────────────────────────────┤
│  CATEGORIES (icon + label cards)            │
│  [Figurines] [Phone Cases] [Decor] [More]   │
├─────────────────────────────────────────────┤
│  "HOW IT'S MADE" section with process imgs  │
├─────────────────────────────────────────────┤
│  FOOTER: Links | WhatsApp | Social          │
└─────────────────────────────────────────────┘
```

### Admin Dashboard Layout
```
┌──────┬──────────────────────────────────────┐
│ SIDE │  Dashboard Header                    │
│ BAR  ├──────────────────────────────────────┤
│      │  Stats Cards (Orders, Products, Rev) │
│ Dash │  ┌────┐ ┌────┐ ┌────┐               │
│ Prod │  │ 12 │ │ 45 │ │MYR │               │
│ Ords │  └────┘ └────┘ └────┘               │
│ Cats │  ──────────────────────────────────  │
│      │  Recent Orders Table                 │
│      │  | Order | Customer | Status |       │
│      │  | #001  | Ahmad    | Shipped|       │
└──────┴──────────────────────────────────────┘
```

### Key Characteristics
- Rounded corners (8px) on cards and buttons
- Bold orange CTA buttons with slight shadow
- Hover: cards lift with shadow (`shadow-lg` on hover)
- Ninja-themed empty states and 404 page
- Product cards: image top, name + price below, size badges
- Energetic micro-animations (150-250ms)

---

## Template B: Clean Ninja (Minimal & Modern)

### Theme & Mood
Clean, modern, trustworthy. Swiss design meets e-commerce. Lots of white space, crisp typography, subtle ninja accents. Professional feel that builds trust for a new brand. Shopify-level simplicity.

### Color Palette (from logo)

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#0F172A` | `slate-900` | Headers, nav, primary actions |
| Primary Accent | `#1B6B2F` | custom green | Logo green, active states, selected |
| Secondary | `#1E3A5F` | custom blue | Links, secondary info |
| CTA / Action | `#1B6B2F` | custom green | Add to Cart, Buy Now (green = go) |
| CTA Hover | `#15803D` | `green-700` | Button hover state |
| Background | `#FFFFFF` | `white` | Page background |
| Surface | `#F8FAFC` | `slate-50` | Alternate sections, card bg |
| Text Primary | `#0F172A` | `slate-900` | Body text |
| Text Muted | `#64748B` | `slate-500` | Meta, descriptions |
| Border | `#E2E8F0` | `slate-200` | Cards, inputs, dividers |
| Danger | `#DC2626` | `red-600` | Errors |
| Success | `#16A34A` | `green-600` | Success states |

### Typography

| Element | Font | Weight | Size | Line Height |
|---------|------|--------|------|-------------|
| H1 (Hero) | Space Grotesk | 700 | 40px / 2.5rem | 1.1 |
| H2 (Section) | Space Grotesk | 600 | 28px / 1.75rem | 1.2 |
| H3 (Card Title) | Space Grotesk | 500 | 20px / 1.25rem | 1.3 |
| Body | DM Sans | 400 | 16px / 1rem | 1.6 |
| Body Small | DM Sans | 400 | 14px / 0.875rem | 1.5 |
| Button | DM Sans | 500 | 14px / 0.875rem | 1 |
| Price | Space Grotesk | 700 | 22px / 1.375rem | 1 |
| Badge | DM Sans | 500 | 12px / 0.75rem | 1 |

**Google Fonts:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
```

### Homepage Layout
```
┌─────────────────────────────────────────────┐
│ [Logo]  Shop  About  Contact      [🛒 Cart] │
├─────────────────────────────────────────────┤
│                                             │
│  Clean hero with product photo              │
│  "Unique 3D Printed Products"               │
│  "Made to order in Malaysia"                │
│  [Browse Collection] green outline btn      │
│                                             │
├─────────────────────────────────────────────┤
│  CATEGORIES (horizontal scroll on mobile)   │
│  ○ Figurines  ○ Phone Cases  ○ Decor       │
├─────────────────────────────────────────────┤
│  FEATURED (2x2 grid, minimal cards)         │
│  ┌──────────┐  ┌──────────┐                │
│  │          │  │          │                │
│  │   img    │  │   img    │                │
│  │          │  │          │                │
│  │ Name     │  │ Name     │                │
│  │ MYR 35   │  │ MYR 45   │                │
│  └──────────┘  └──────────┘                │
├─────────────────────────────────────────────┤
│  "Ships in 3-7 days" | "Made with care"     │
├─────────────────────────────────────────────┤
│  FOOTER: minimal, clean links               │
└─────────────────────────────────────────────┘
```

### Admin Dashboard Layout
```
┌─────────────────────────────────────────────┐
│ [Logo] Admin    Products | Orders | Settings│
├─────────────────────────────────────────────┤
│                                             │
│  TOP NAV admin (no sidebar)                 │
│                                             │
│  Stats: 12 Products | 45 Orders | MYR 2,340│
│  ─────────────────────────────────────────  │
│  Product Table                              │
│  [+ Add Product]                            │
│  | Image | Name | Price | Status | Actions |│
│  | thumb | Ninja| MYR35 | Active | Edit ⋮ |│
│                                             │
└─────────────────────────────────────────────┘
```

### Key Characteristics
- Sharp corners (4px border-radius) for a crisp feel
- Green CTA buttons (solid or outline)
- Hover: subtle background color shift, no dramatic shadows
- Generous white space between sections
- Product cards: minimal, image-heavy, subtle text
- Subtle transitions (150-200ms, color change only)
- Top navigation for admin (no sidebar — simpler)

---

## Template C: Dark Ninja (Premium & Sleek)

### Theme & Mood
Premium, sleek, dark mode. Feels exclusive and high-end. Deep dark backgrounds with glowing green accents from the logo. Makes 3D printed products feel like luxury items. Neon-accented, dramatic.

### Color Palette (from logo)

| Role | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#22C55E` | `green-500` | Accent, active states, glow |
| Primary Glow | `#4ADE80` | `green-400` | Hover glow effect |
| Secondary | `#3B82F6` | `blue-500` | Links, info badges |
| CTA / Action | `#22C55E` | `green-500` | Add to Cart, Buy Now |
| CTA Hover | `#4ADE80` | `green-400` | Button hover with glow |
| Background | `#0A0A0A` | custom | Page background (near black) |
| Surface | `#141414` | custom | Cards, elevated surfaces |
| Surface Raised | `#1E1E1E` | custom | Hover cards, dropdowns |
| Text Primary | `#F1F5F9` | `slate-100` | Body text |
| Text Muted | `#94A3B8` | `slate-400` | Descriptions, meta |
| Border | `#2D2D2D` | custom | Cards, dividers |
| Danger | `#EF4444` | `red-500` | Errors |
| Success | `#22C55E` | `green-500` | Success states |

### Typography

| Element | Font | Weight | Size | Line Height |
|---------|------|--------|------|-------------|
| H1 (Hero) | Bebas Neue | 400 | 56px / 3.5rem | 1.0 |
| H2 (Section) | Bebas Neue | 400 | 36px / 2.25rem | 1.1 |
| H3 (Card Title) | Space Grotesk | 600 | 20px / 1.25rem | 1.3 |
| Body | DM Sans | 400 | 16px / 1rem | 1.6 |
| Body Small | DM Sans | 400 | 14px / 0.875rem | 1.5 |
| Button | Space Grotesk | 600 | 14px / 0.875rem | 1 |
| Price | Bebas Neue | 400 | 28px / 1.75rem | 1 |
| Badge | DM Sans | 500 | 12px / 0.75rem | 1 |

**Google Fonts:**
```css
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=Space+Grotesk:wght@400;500;600;700&display=swap');
```

### Homepage Layout
```
┌─────────────────────────────────────────────┐
│ [Logo]  Shop  About  Contact   [🛒]  dark bg│
├─────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░  Full-width dark hero                   ░ │
│ ░  "NINJA CRAFTED"  (huge Bebas Neue)     ░ │
│ ░  "3D PRINTED ORIGINALS"                 ░ │
│ ░  [EXPLORE] green glowing button         ░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────────┤
│  FEATURED (3 cards on dark bg)              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ ░░img░░ │ │ ░░img░░ │ │ ░░img░░ │      │
│  │ Name    │ │ Name    │ │ Name    │      │
│  │ MYR 35  │ │ MYR 45  │ │ MYR 60  │      │
│  │ green   │ │ green   │ │ green   │      │
│  │ border  │ │ border  │ │ border  │      │
│  └─────────┘ └─────────┘ └─────────┘      │
├─────────────────────────────────────────────┤
│  CATEGORIES with subtle green glow icons    │
├─────────────────────────────────────────────┤
│  "THE PROCESS" with dark photo grid         │
├─────────────────────────────────────────────┤
│  FOOTER: dark, green accent links           │
└─────────────────────────────────────────────┘
```

### Admin Dashboard Layout
```
┌──────┬──────────────────────────────────────┐
│ SIDE │  Dashboard (dark bg)                 │
│ BAR  ├──────────────────────────────────────┤
│ dark │  Stats Cards (dark surface, green #s)│
│      │  ┌────┐ ┌────┐ ┌────┐               │
│ Dash │  │ 12 │ │ 45 │ │MYR │ green text    │
│ Prod │  └────┘ └────┘ └────┘               │
│ Ords │  ──────────────────────────────────  │
│ Cats │  Table with dark rows, green accents │
│      │  | Order | Customer | Status |       │
│      │  | #001  | Ahmad    | ●Shipped|      │
└──────┴──────────────────────────────────────┘
```

### Key Characteristics
- Border-radius 8px with subtle green border on hover
- Green glowing CTA buttons (`box-shadow: 0 0 20px rgba(34,197,94,0.3)`)
- Hover: green glow intensifies, card border lights up
- Dark cards with `#141414` background
- Product images pop against dark background
- Dramatic text hierarchy (Bebas Neue for impact)
- Sidebar admin with dark theme throughout

---

## Shared Design Rules (All Templates)

### Spacing Scale (Tailwind)
| Token | Size | Usage |
|-------|------|-------|
| `space-1` | 4px | Inline spacing |
| `space-2` | 8px | Icon gaps, tight padding |
| `space-3` | 12px | Card inner padding (small) |
| `space-4` | 16px | Card padding, form gaps |
| `space-6` | 24px | Section inner padding |
| `space-8` | 32px | Section gaps |
| `space-12` | 48px | Major section separators |
| `space-16` | 64px | Hero padding, page sections |

### Breakpoints
| Name | Width | Layout Changes |
|------|-------|----------------|
| Mobile | < 640px | Single column, stacked nav, bottom cart |
| Tablet | 640-1023px | 2-column grid, side nav collapses |
| Desktop | 1024px+ | Full layout, sidebar admin |

### shadcn/ui Components Used
| Component | Usage |
|-----------|-------|
| `Button` | All CTAs, actions |
| `Card` + `CardHeader` + `CardContent` | Product cards, stat cards |
| `Input` + `Label` | Forms (login, register, product edit) |
| `Table` | Admin product list, order list |
| `Badge` | Size tags (S/M/L), order status |
| `Dialog` | Confirmations (delete product) |
| `DropdownMenu` | Product actions menu |
| `Tabs` | Admin sections |
| `Avatar` | User menu |
| `Toast` | Success/error notifications |
| `Skeleton` | Loading states |

### Accessibility (All Templates)
- Minimum 4.5:1 contrast ratio for all text
- 44x44px minimum touch targets on mobile
- Visible focus rings on all interactive elements
- `aria-label` on icon-only buttons
- Tab order matches visual order
- `prefers-reduced-motion` disables animations
- Form labels with `htmlFor` attribute

### Image Guidelines
- Product images: 1:1 aspect ratio (square)
- Hero images: 16:9 aspect ratio
- Format: WebP with JPEG fallback
- Lazy loading below the fold
- Cloudinary auto-optimization and CDN delivery
- `srcset` for responsive sizes
- Alt text on all product images

### Animation Rules
- Duration: 150-250ms for micro-interactions
- Easing: `ease-out` for enters, `ease-in` for exits
- Properties: `transform` and `opacity` only (GPU accelerated)
- No layout-shifting animations (no width/height transitions)
- Skeleton screens for async content (no spinners)

---

## Selected Template: A — Bold Ninja

**Decision locked: 2026-04-12**

Template A was chosen. Templates B and C are preserved above for reference only.

**Active design tokens:**
- Headings: Russo One
- Body: Chakra Petch
- CTA: Orange `#F97316`
- Primary: Green `#1B6B2F`
- Admin: Sidebar layout
- Cards: Rounded 8px + lift shadow on hover
- Mood: Bold, energetic, playful — gaming store meets maker space

---

*UI-SPEC created: 2026-04-12*
*Phase: 01-foundation*
