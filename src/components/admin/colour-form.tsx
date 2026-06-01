"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BRAND } from "@/lib/brand";
import {
  createColour,
  updateColour,
  renameColour,
} from "@/actions/admin-colours";
import { slugifyColourBase } from "@/lib/colour-slug";
import type { ColourAdmin } from "@/lib/colours";

type Props =
  | { mode: "new"; initial?: undefined }
  | { mode: "edit"; initial: ColourAdmin };

/**
 * /admin/colours/new + /admin/colours/[id]/edit form.
 * Fields: name, hex (with native colour picker), previousHex (optional),
 * brand, familyType, familySubtype, code, isActive.
 * All tap targets ≥ 48px (D-04). Hex regex ^#[0-9A-Fa-f]{6}$.
 *
 * Mirrors coupon-form.tsx pattern: useTransition + native form onSubmit
 * (no react-hook-form per PATTERNS.md).
 */
export function ColourForm({ mode, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [hex, setHex] = useState(initial?.hex ?? "#000000");
  const [previousHex, setPreviousHex] = useState(initial?.previousHex ?? "");

  const slugBase = slugifyColourBase(name);
  const previousHexValid = /^#[0-9A-Fa-f]{6}$/.test(previousHex ?? "");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      if (mode === "new") {
        const res = await createColour(fd);
        if (res.ok) {
          router.push("/admin/colours");
          router.refresh();
        } else if ("error" in res) {
          setError(res.error);
        }
        return;
      }

      // mode === "edit": route name + hex changes through cascade-aware
      // renameColour FIRST (single transaction; diff-aware per D-11), THEN
      // run updateColour for the remaining metadata (brand / family / code /
      // previous_hex / is_active).
      const submittedName = String(fd.get("name") ?? "").trim();
      const submittedHex = String(fd.get("hex") ?? "")
        .trim()
        .toUpperCase();
      const nameChanged = submittedName !== initial.name;
      const hexChanged = submittedHex !== initial.hex.toUpperCase();

      if (nameChanged || hexChanged) {
        const cascadeRes = await renameColour(initial.id, {
          name: nameChanged ? submittedName : undefined,
          hex: hexChanged ? submittedHex : undefined,
        });
        if (!cascadeRes.ok && "error" in cascadeRes) {
          setError(cascadeRes.error);
          return;
        }
      }

      const res = await updateColour(initial.id, fd);
      if (res.ok) {
        router.push("/admin/colours");
        router.refresh();
      } else if ("error" in res) {
        setError(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 max-w-xl"
      style={{ color: BRAND.ink }}
    >
      {/* Name */}
      <div>
        <label htmlFor="cf-name" className="block text-sm font-semibold mb-1">
          Name
        </label>
        <input
          id="cf-name"
          name="name"
          type="text"
          required
          minLength={1}
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="Galaxy Black"
        />
        {slugBase ? (
          <p className="mt-1 text-xs text-slate-500">
            URL slug: <code className="font-mono">{slugBase}</code>
          </p>
        ) : null}
      </div>

      {/* Hex (text + native colour picker) */}
      <div>
        <label htmlFor="cf-hex" className="block text-sm font-semibold mb-1">
          Hex
        </label>
        <div className="flex gap-2">
          <input
            id="cf-hex"
            name="hex"
            type="text"
            required
            pattern="^#[0-9A-Fa-f]{6}$"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm font-mono uppercase min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="#0B1020"
          />
          <input
            type="color"
            aria-label="Colour picker"
            value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : "#000000"}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="w-12 h-12 rounded-xl border-2 cursor-pointer min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">Format: #RRGGBB</p>
      </div>

      {/* Previous hex (optional — Polymaker oldHex reference) */}
      <div>
        <label
          htmlFor="cf-prevhex"
          className="block text-sm font-semibold mb-1"
        >
          Previous hex (optional)
        </label>
        <div className="flex gap-2">
          <input
            id="cf-prevhex"
            name="previousHex"
            type="text"
            pattern="^#[0-9A-Fa-f]{6}$"
            value={previousHex ?? ""}
            onChange={(e) => setPreviousHex(e.target.value)}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm font-mono uppercase min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
            placeholder="#AFA198 (Polymaker old packaging)"
          />
          {previousHexValid ? (
            <input
              type="color"
              aria-label="Previous colour preview"
              value={previousHex ?? "#000000"}
              readOnly
              disabled
              className="w-12 h-12 rounded-xl border-2 cursor-default min-h-[48px]"
              style={{ borderColor: `${BRAND.ink}33` }}
            />
          ) : null}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Reference colour for sourcing (e.g. Polymaker old packaging hex).
        </p>
      </div>

      {/* Brand + Family type (grid) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="cf-brand"
            className="block text-sm font-semibold mb-1"
          >
            Brand
          </label>
          <select
            id="cf-brand"
            name="brand"
            required
            defaultValue={initial?.brand ?? "Bambu"}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm bg-white min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            <option value="Bambu">Bambu</option>
            <option value="Polymaker">Polymaker</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="cf-ftype"
            className="block text-sm font-semibold mb-1"
          >
            Family type
          </label>
          <select
            id="cf-ftype"
            name="familyType"
            required
            defaultValue={initial?.familyType ?? "PLA"}
            className="w-full rounded-xl border-2 px-4 py-3 text-sm bg-white min-h-[48px]"
            style={{ borderColor: `${BRAND.ink}33` }}
          >
            <option value="PLA">PLA</option>
            <option value="PETG">PETG</option>
            <option value="TPU">TPU</option>
            <option value="CF">CF</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Family subtype */}
      <div>
        <label htmlFor="cf-fsub" className="block text-sm font-semibold mb-1">
          Family subtype
        </label>
        <input
          id="cf-fsub"
          name="familySubtype"
          type="text"
          maxLength={48}
          defaultValue={initial?.familySubtype ?? ""}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="Matte / Silk / Translucent / Basic"
        />
        <p className="mt-1 text-xs text-slate-500">
          Free text. Common values: Matte, Silk, Translucent, Basic, CF, Tough.
        </p>
      </div>

      {/* Code */}
      <div>
        <label htmlFor="cf-code" className="block text-sm font-semibold mb-1">
          Code (optional, admin-only)
        </label>
        <input
          id="cf-code"
          name="code"
          type="text"
          maxLength={32}
          defaultValue={initial?.code ?? ""}
          className="w-full rounded-xl border-2 px-4 py-3 text-sm font-mono uppercase min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33` }}
          placeholder="10101 (Bambu RFID) / CA04028 (Polymaker SKU)"
        />
        <p className="mt-1 text-xs text-slate-500">
          Never shown to customers. Brand + code together must be unique.
        </p>
      </div>

      {/* My Colour toggle */}
      <div>
        <label className="inline-flex items-center gap-2">
          <input
            name="isMyColour"
            type="checkbox"
            value="true"
            defaultChecked={initial?.isMyColour ?? false}
            className="h-5 w-5 rounded"
          />
          <span className="text-sm font-semibold">
            My Colour (auto-populate in products)
          </span>
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Check this box if this is one of your frequently used colours. It will be suggested when editing color fields in product forms.
        </p>
      </div>

      {/* Active toggle */}
      <div>
        <label className="inline-flex items-center gap-2">
          <input
            name="isActive"
            type="checkbox"
            value="true"
            defaultChecked={initial?.isActive ?? true}
            className="h-5 w-5 rounded"
          />
          <span className="text-sm font-semibold">
            Active (visible in picker)
          </span>
        </label>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl px-3 py-2 text-sm"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full px-6 py-3 font-bold text-white min-h-[48px] disabled:opacity-50"
          style={{ backgroundColor: BRAND.ink }}
        >
          {pending
            ? "Saving…"
            : mode === "new"
              ? "Create colour"
              : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/colours")}
          disabled={pending}
          className="rounded-full px-6 py-3 font-semibold border-2 min-h-[48px]"
          style={{ borderColor: `${BRAND.ink}33`, color: BRAND.ink }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
