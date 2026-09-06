---
title: AI 3D Model Generation (Meshy)
category: Products
tags: [meshy, 3d, ai, generation, printability, bambu, keychain]
order: 10
---

# AI 3D Model Generation (Meshy)

The 3D Generation tool turns a reference photo into a textured, print-ready 3D model using Meshy's AI. It lives at `/admin/meshy` and is an **internal workbench for admins only** — customers never see it. Use it to turn a customer's inspiration photo, a product concept, or your own reference shot into an STL (and optionally a multi-color 3MF) you can slice in Bambu Studio and print.

## What the tool does

Upload a photo → Meshy generates a textured 3D model → you review it in an interactive 3D viewer → you approve it (which runs a free printability check) → you download the STL for slicing. Along the way you can request a revision if the look or shape isn't right, run a paid repair if the printability check flags an issue, and optionally generate a multi-color 3MF for Bambu's AMS.

Nothing here is customer-facing. There is no link from any product page to a generation — if you want to turn a generated model into an actual store product, that's a separate manual step (create/edit the product as usual and attach the downloaded STL/photos yourself).

## Taking a good source photo

The quality of the source photo drives the quality of the model. For best results:

- **One subject, centered in the frame.** Multiple objects or a busy composition confuse the AI and can trigger a "too complex" error.
- **Plain, uncluttered background.** A solid wall, table, or backdrop works far better than a cluttered room.
- **Even, bright lighting.** Avoid harsh shadows or backlighting — Meshy reconstructs shape and texture from what it can see.
- **JPEG or PNG, under 10MB.** Larger photos are rejected at upload.

You can optionally add a **style prompt** (up to 600 characters) describing material or look — e.g. "matte navy blue plastic" — which nudges the initial texture.

## The workflow, step by step

1. **Upload** — go to `/admin/meshy/new`, pick your photo, optionally add a style prompt, submit. You'll land on the detail page immediately with a "Generating" placeholder — this typically takes under a minute.
2. **Review in 3D** — once generation finishes, an interactive 3D viewer shows the textured model. Rotate and zoom to check the shape and texture from every angle.
3. **Not quite right? Request a revision:**
   - **Retexture (10 credits)** — keeps the exact same geometry, generates a new texture/look. Use this when the shape is right but the color or material isn't. **Only works within 3 days of the model being generated** — see the 3-day rule below.
   - **Regenerate (~30 credits)** — a fresh full attempt from the same source photo. Use this when the shape itself is wrong. Always available, no time window. The UI shows a confirmation before spending the full generation cost again.
4. **Approve** — once you're happy with the model, click Approve. This kicks off a **free printability check** automatically — every approved model gets checked, no reason not to since it costs nothing.
5. **Repair only if flagged** — if the printability check comes back with a warning or error (non-watertight mesh, holes, non-manifold edges), a **"Repair this model? (10 credits)"** button appears. Repair never runs automatically — you decide whether it's worth the spend. After repair, the model is automatically re-checked for free.
6. **Optional: multi-color 3MF (10 credits)** — if you want a Bambu AMS-ready multi-color file, run this once the model is Ready. Choose how many colors (1–16) and a color depth (3–6). This produces a 3MF file *in addition to* the STL — it never replaces it. Note: a colored 3MF only ever comes from this step; it is not the same as just requesting a 3MF format on the original generation.
7. **Download** — STL and (if you ran multi-color) 3MF download buttons appear once the model is Ready. Load either straight into Bambu Studio.

## Credit costs

| Action | Cost | Notes |
|---|---|---|
| Generate (upload → model) | ~30 credits | The initial photo-to-3D pass |
| Regenerate | ~30 credits | Same cost as a fresh generation |
| Retexture | 10 credits | Same shape, new look — cheaper than regenerating |
| Printability analyze | Free | Runs automatically on every approval |
| Repair | 10 credits | Explicit click only, never automatic |
| Multi-color 3MF | 10 credits | Produces 3MF only, does not replace the STL |

If the shared Meshy account balance is running low, you'll see a warning banner — this is advisory only and never blocks you from starting a new generation.

## The 3-day rule

Meshy only keeps a model's underlying files for **3 days** after it finishes generating. Our system downloads every successful model's files to our own storage immediately, so you are never at risk of losing a model you've already reviewed — but **Retexture specifically depends on referencing the original model on Meshy's side**, so it only works within that same 3-day window. If you try to retexture a model older than 3 days, you'll be told to use **Regenerate** instead, which always works because it starts fresh from your original source photo (which we keep indefinitely).

## Downloads come from our own server

Every download link you see (STL, 3MF, the thumbnail, the 3D viewer itself) is served from our own server, never directly from Meshy. As soon as a model finishes generating, revising, or repairing, the files are pulled down and stored privately on our infrastructure — this is exactly why the 3-day Meshy-side expiry doesn't affect anything you've already reviewed or approved.

## Tips and gotchas

- **Cancel is available** while a generation is still running or sitting in "awaiting review" — useful if you picked the wrong photo or changed your mind.
- **A failed generation never silently retries.** If Meshy reports a failure, you'll see a "Try Again" link back to a fresh upload — automatic retries would risk burning credits on a photo that just doesn't work.
- **Repair only ever appears when needed.** If the printability check comes back healthy, there's nothing to repair and no button will show.
- **This tool has no product-linking UI in v1.** If you generate a model for a specific product, download the files and attach them to that product manually the same way you would any other asset.
