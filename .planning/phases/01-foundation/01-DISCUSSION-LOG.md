# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 1-Foundation
**Areas discussed:** Admin Panel Design, Auth Flow & Roles, Product Data Model

---

## Admin Panel Design

### Templates
| Option | Description | Selected |
|--------|-------------|----------|
| 3 store theme designs | Three different visual designs for the whole store | |
| 3 admin dashboard layouts | Three different admin panel designs to choose from | |
| 3 homepage layouts | Three different homepage designs for customers | |

**User's choice:** "All above" — wants 3 templates for store theme, admin layout, AND homepage
**Notes:** User explicitly requested design templates before any coding begins. Will use /ui-ux-pro-max skill.

### Admin Layout
| Option | Description | Selected |
|--------|-------------|----------|
| Simple table + form | Product list as table, click to edit — like Shopify admin | |
| Card grid + modal | Products as cards with images, click to edit modal | |
| You decide | Claude picks best approach | ✓ |

**User's choice:** You decide — Claude's discretion

### Image Upload
| Option | Description | Selected |
|--------|-------------|----------|
| Drag & drop zone | Drag images into drop zone, reorder by dragging | |
| Simple file picker | Click Upload button, select from computer | |
| Both | Drag & drop with fallback file picker button | ✓ |

**User's choice:** Both

### Image Limit
| Option | Description | Selected |
|--------|-------------|----------|
| 5 images max | Enough for multiple angles | ✓ |
| 10 images max | More flexibility | |
| No limit | Upload as many as needed | |

**User's choice:** 5 images max

---

## Auth Flow & Roles

### Admin Setup
| Option | Description | Selected |
|--------|-------------|----------|
| Seed command | CLI command to create first admin during setup | ✓ |
| First user is admin | First account auto-becomes admin | |
| Env variable email | ADMIN_EMAIL in .env auto-gets admin role | |

**User's choice:** Seed command

### Auth Pages
| Option | Description | Selected |
|--------|-------------|----------|
| Clean centered card | Simple centered form card with logo — Shopify style | ✓ |
| Split screen | Left branding, right form | |
| You decide | Claude picks | |

**User's choice:** Clean centered card

### Login Split
| Option | Description | Selected |
|--------|-------------|----------|
| Same page | One login, redirect based on role | ✓ |
| Separate pages | /login for customers, /admin/login for admin | |
| You decide | Claude picks | |

**User's choice:** Same page

---

## Product Data Model

### Categories
| Option | Description | Selected |
|--------|-------------|----------|
| Yes, simple categories | One category per product | ✓ |
| Yes, with tags | Categories plus free-form tags | |
| No categories for v1 | Flat list, add later | |

**User's choice:** Simple categories

### Fields
| Option | Description | Selected |
|--------|-------------|----------|
| Minimal | Name, description, images, S/M/L prices, active toggle | |
| Add material & lead time | Above + material, production days | |
| Add dimensions too | Above + physical dimensions per size | ✓ |

**User's choice:** Add dimensions too

### Featured Flag
| Option | Description | Selected |
|--------|-------------|----------|
| Yes | Admin can mark featured, shown on homepage | ✓ |
| No | All products treated equally | |

**User's choice:** Yes

---

## Claude's Discretion

- Admin panel layout style (table+form vs card grid)
- Form field ordering in product creation
- Category management UI approach

## Deferred Ideas

None
