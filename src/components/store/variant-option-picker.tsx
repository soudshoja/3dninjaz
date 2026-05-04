"use client";

/**
 * VariantOptionPicker — rich custom listbox for SelectField options.
 *
 * Replaces the bare <select> inside ConfiguratorForm's SelectField with a
 * polished, mobile-first, brand-aligned component.
 *
 * Design: Exaggerated Minimalism (ui-ux-pro-max) × Claymorphism (project
 * treatment) — bold ink typography, chunky rounded-2xl radii, generous
 * padding, layered shadows, brand-blue selection ring + green price pill.
 *
 * Behaviour:
 *   • Desktop: anchored popover below trigger (positioned with JS).
 *   • Mobile (≤ 767px): vaul bottom sheet (direction="bottom"), swipe-down to close.
 *   • Trigger: full-width button showing thumbnail + label + price pill + chevron.
 *   • Option rows: 56px min-height, thumbnail (56px square), bold label, faded
 *     SKU sub-line, right-aligned price/override pill.
 *   • Selected state: 2px brand-blue ring + check icon top-right of thumbnail.
 *   • A11y: role="listbox"/role="option", aria-selected, keyboard arrow nav,
 *     Escape closes, focus-trap when open.
 *   • Animation: 150ms ease open/close, 100ms scale-bounce on row tap.
 *
 * Props match the minimal interface needed by SelectField in configurator-form.tsx.
 * Data shape comes from SelectFieldConfig (src/lib/config-fields.ts) — unchanged.
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";
import { BRAND } from "@/lib/brand";
import { formatMYR } from "@/lib/format";

// ============================================================================
// Types
// ============================================================================

export interface PickerOption {
  label: string;
  value: string;
  priceAdd?: number;
  /** Per-option price override — replaces base price when selected. */
  price?: number;
  /** SKU shown as faded sub-line in the row. */
  sku?: string;
  /** Base URL from writeUpload pipeline — component resolves to /400w.jpg. */
  imageUrl?: string;
}

interface VariantOptionPickerProps {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown in the bottom-sheet header on mobile. */
  label?: string;
  /** Base product price — used to decide whether to show the override pill. */
  basePrice?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/** Resolve a displayable src from the writeUpload base URL. */
function resolveImageSrc(imageUrl: string | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.endsWith("/")) return imageUrl + "400w.jpg";
  return imageUrl + "/400w.jpg";
}

/** Generate a brand-coloured initial chip when no image is available. */
function InitialChip({ label }: { label: string }) {
  const initial = (label[0] ?? "?").toUpperCase();
  return (
    <span
      className="flex items-center justify-center text-lg font-extrabold shrink-0 select-none"
      style={{
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: BRAND.blue,
        color: "#ffffff",
        boxShadow: `0 3px 0 ${BRAND.blueDark}`,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** Thumbnail with error fallback to InitialChip. */
function OptionThumb({
  imageUrl,
  label,
  isSelected,
}: {
  imageUrl?: string;
  label: string;
  isSelected: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const src = resolveImageSrc(imageUrl);

  return (
    <span className="relative shrink-0" style={{ width: 56, height: 56 }}>
      {src && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="object-cover"
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            display: "block",
            border: isSelected ? `2px solid ${BRAND.blue}` : "2px solid transparent",
          }}
          onError={() => setImgError(true)}
        />
      ) : (
        <InitialChip label={label} />
      )}
      {/* Selected check badge */}
      {isSelected && (
        <span
          className="absolute flex items-center justify-center"
          style={{
            top: -6,
            right: -6,
            width: 20,
            height: 20,
            borderRadius: "50%",
            backgroundColor: BRAND.blue,
            border: "2px solid #ffffff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          }}
          aria-hidden="true"
        >
          <Check size={10} strokeWidth={3} color="#ffffff" />
        </span>
      )}
    </span>
  );
}

/** Price pill — shown right-aligned in each row. */
function PricePill({
  opt,
  basePrice,
}: {
  opt: PickerOption;
  basePrice?: number;
}) {
  // Show override pill when the option has a `price` field.
  if (opt.price !== undefined && opt.price >= 0) {
    const diffFromBase =
      basePrice !== undefined ? opt.price - basePrice : null;
    const showDiff = diffFromBase !== null && Math.abs(diffFromBase) > 0.005;
    return (
      <span
        className="ml-auto shrink-0 font-bold text-xs rounded-full px-2.5 py-1 tabular-nums"
        style={{
          backgroundColor: BRAND.green,
          color: BRAND.ink,
          boxShadow: `0 2px 0 ${BRAND.greenDark}`,
        }}
      >
        {formatMYR(opt.price)}
        {showDiff && (
          <span className="font-medium opacity-70 ml-0.5">
            {diffFromBase! > 0 ? "+" : ""}
            {formatMYR(diffFromBase!)}
          </span>
        )}
      </span>
    );
  }
  // Additive display (cosmetic, no price override).
  if (opt.priceAdd && opt.priceAdd !== 0) {
    return (
      <span
        className="ml-auto shrink-0 font-semibold text-xs rounded-full px-2.5 py-1 tabular-nums"
        style={{
          backgroundColor: `${BRAND.green}22`,
          color: BRAND.greenDark,
          border: `1.5px solid ${BRAND.green}50`,
        }}
      >
        +{formatMYR(opt.priceAdd)}
      </span>
    );
  }
  return null;
}

/** A single option row — used inside both the popover and the bottom sheet. */
function OptionRow({
  opt,
  isSelected,
  isFocused,
  basePrice,
  onClick,
  onMouseEnter,
  id,
}: {
  opt: PickerOption;
  isSelected: boolean;
  isFocused: boolean;
  basePrice?: number;
  onClick: () => void;
  onMouseEnter: () => void;
  id: string;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className="flex items-center gap-3 cursor-pointer transition-all duration-100 active:scale-[0.98]"
      style={{
        minHeight: 56,
        padding: "10px 14px",
        borderRadius: 16,
        border: isSelected
          ? `2px solid ${BRAND.blue}`
          : isFocused
            ? `2px solid ${BRAND.blue}60`
            : "2px solid transparent",
        backgroundColor: isSelected
          ? `${BRAND.blue}0d`
          : isFocused
            ? `${BRAND.blue}07`
            : "transparent",
        boxShadow: isSelected
          ? `0 0 0 3px ${BRAND.blue}18`
          : "none",
        outline: "none",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <OptionThumb imageUrl={opt.imageUrl} label={opt.label} isSelected={isSelected} />

      {/* Text block */}
      <span className="flex flex-col min-w-0 flex-1">
        <span
          className="font-bold leading-tight truncate"
          style={{
            fontSize: 15,
            color: BRAND.ink,
          }}
        >
          {opt.label}
        </span>
        {opt.sku && (
          <span
            className="font-medium truncate mt-0.5"
            style={{ fontSize: 11, color: "#94a3b8" }}
          >
            {opt.sku}
          </span>
        )}
      </span>

      <PricePill opt={opt} basePrice={basePrice} />
    </li>
  );
}

/** The trigger button — mirrors the currently-selected row (or placeholder). */
function TriggerButton({
  selected,
  placeholder,
  isOpen,
  onClick,
  triggerId,
  listboxId,
}: {
  selected: PickerOption | undefined;
  placeholder: string;
  isOpen: boolean;
  onClick: () => void;
  triggerId: string;
  listboxId: string;
}) {
  return (
    <button
      id={triggerId}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={listboxId}
      onClick={onClick}
      className="w-full flex items-center gap-3 cursor-pointer transition-all duration-150"
      style={{
        minHeight: 56,
        padding: "10px 14px",
        borderRadius: 16,
        background: "#ffffff",
        border: isOpen
          ? `2.5px solid ${BRAND.blue}`
          : selected
            ? `2.5px solid ${BRAND.blue}`
            : "2.5px solid #d1d5db",
        boxShadow: isOpen
          ? `0 0 0 3px ${BRAND.blue}22, 0 4px 0 ${BRAND.blueDark}30`
          : selected
            ? `0 0 0 3px ${BRAND.blue}12, 0 4px 0 ${BRAND.blueDark}20`
            : "0 2px 0 #d1d5db40",
        transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      }}
    >
      {selected ? (
        <>
          <OptionThumb imageUrl={selected.imageUrl} label={selected.label} isSelected={false} />
          <span className="flex flex-col min-w-0 flex-1 text-left">
            <span
              className="font-bold leading-tight truncate"
              style={{ fontSize: 15, color: BRAND.ink }}
            >
              {selected.label}
            </span>
            {selected.sku && (
              <span
                className="font-medium truncate mt-0.5"
                style={{ fontSize: 11, color: "#94a3b8" }}
              >
                {selected.sku}
              </span>
            )}
          </span>
          <PricePill opt={selected} />
        </>
      ) : (
        <span className="flex-1 text-left" style={{ fontSize: 15, color: "#9ca3af" }}>
          {placeholder}
        </span>
      )}
      <ChevronDown
        size={18}
        strokeWidth={2.5}
        className="shrink-0 transition-transform duration-150"
        style={{
          color: "#6b7280",
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
        }}
        aria-hidden="true"
      />
    </button>
  );
}

// ============================================================================
// Desktop Popover
// ============================================================================

interface PopoverProps {
  options: PickerOption[];
  value: string;
  basePrice?: number;
  focusedIdx: number;
  onSelect: (v: string) => void;
  onFocusIdx: (idx: number) => void;
  listboxId: string;
  triggerId: string;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

function DesktopPopover({
  options,
  value,
  basePrice,
  focusedIdx,
  onSelect,
  onFocusIdx,
  listboxId,
  triggerId,
  onClose,
  anchorRef,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  // Position below the trigger
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setStyle({
      position: "fixed",
      top: r.bottom + 6,
      left: r.left,
      width: r.width,
      zIndex: 9999,
    });
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose, anchorRef]);

  // Scroll focused item into view
  useEffect(() => {
    if (!popoverRef.current) return;
    const focused = popoverRef.current.querySelector<HTMLLIElement>(
      `[id="${listboxId}-opt-${focusedIdx}"]`,
    );
    focused?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx, listboxId]);

  return (
    <div
      ref={popoverRef}
      style={{
        ...style,
        borderRadius: 20,
        background: "#ffffff",
        border: `2px solid ${BRAND.ink}12`,
        boxShadow: `0 8px 0 ${BRAND.ink}10, 0 20px 48px ${BRAND.ink}18`,
        overflow: "hidden",
        animation: "vop-open 0.15s ease both",
      }}
    >
      <style>{`
        @keyframes vop-open {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
      <ul
        id={listboxId}
        role="listbox"
        aria-labelledby={triggerId}
        tabIndex={-1}
        className="py-2 px-2 flex flex-col gap-1 max-h-[320px] overflow-y-auto"
      >
        {options.map((opt, idx) => (
          <OptionRow
            key={opt.value}
            id={`${listboxId}-opt-${idx}`}
            opt={opt}
            isSelected={opt.value === value}
            isFocused={idx === focusedIdx}
            basePrice={basePrice}
            onClick={() => { onSelect(opt.value); onClose(); }}
            onMouseEnter={() => onFocusIdx(idx)}
          />
        ))}
      </ul>
    </div>
  );
}

// ============================================================================
// Mobile Bottom Sheet (vaul)
// ============================================================================

interface BottomSheetProps {
  open: boolean;
  options: PickerOption[];
  value: string;
  basePrice?: number;
  label?: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}

function MobileBottomSheet({
  open,
  options,
  value,
  basePrice,
  label,
  onSelect,
  onClose,
}: BottomSheetProps) {
  return (
    <DrawerPrimitive.Root
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      direction="bottom"
      shouldScaleBackground={false}
    >
      <DrawerPrimitive.Portal>
        {/* Backdrop */}
        <DrawerPrimitive.Overlay
          className="fixed inset-0 z-[9998] bg-black/40"
          style={{ backdropFilter: "blur(2px)" }}
        />
        {/* Sheet */}
        <DrawerPrimitive.Content
          className="fixed bottom-0 left-0 right-0 z-[9999] flex flex-col"
          style={{
            backgroundColor: BRAND.cream,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: `0 -8px 40px ${BRAND.ink}20`,
            maxHeight: "80vh",
          }}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-black/20 shrink-0" />

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: `1.5px solid ${BRAND.ink}10` }}
          >
            <DrawerPrimitive.Title
              className="font-bold uppercase tracking-wide"
              style={{ fontFamily: "var(--font-heading)", fontSize: 16, color: BRAND.ink }}
            >
              {label ? `Choose ${label}` : "Select an option"}
            </DrawerPrimitive.Title>
            <DrawerPrimitive.Close asChild>
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center cursor-pointer transition-opacity hover:opacity-70"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: `${BRAND.ink}10`,
                  border: "none",
                  color: BRAND.ink,
                }}
                aria-label="Close"
              >
                <X size={16} strokeWidth={2.5} aria-hidden="true" />
              </button>
            </DrawerPrimitive.Close>
          </div>

          {/* Option list — scrollable */}
          <ul
            role="listbox"
            aria-label={label ?? "Select an option"}
            className="flex-1 overflow-y-auto py-2 px-3 flex flex-col gap-1.5"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 20px)" }}
          >
            {options.map((opt, idx) => (
              <OptionRow
                key={opt.value}
                id={`sheet-opt-${idx}`}
                opt={opt}
                isSelected={opt.value === value}
                isFocused={false}
                basePrice={basePrice}
                onClick={() => { onSelect(opt.value); onClose(); }}
                onMouseEnter={() => {/* no-op on touch */}}
              />
            ))}
          </ul>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}

// ============================================================================
// VariantOptionPicker — main export
// ============================================================================

export function VariantOptionPicker({
  options,
  value,
  onChange,
  placeholder,
  label,
  basePrice,
}: VariantOptionPickerProps) {
  const uid = useId();
  const listboxId = `vop-lb-${uid}`;
  const triggerId = `vop-tr-${uid}`;

  const [open, setOpen] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [isMobile, setIsMobile] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Detect mobile via matchMedia on mount + resize.
  useEffect(() => {
    function check() {
      setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    }
    check();
    const mq = window.matchMedia("(max-width: 767px)");
    mq.addEventListener("change", check);
    return () => mq.removeEventListener("change", check);
  }, []);

  // Sync focused index to selected when opening.
  const handleOpen = useCallback(() => {
    const idx = options.findIndex((o) => o.value === value);
    setFocusedIdx(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [options, value]);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Return focus to trigger after close on desktop.
    if (!isMobile) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [isMobile]);

  const handleSelect = useCallback(
    (v: string) => {
      onChange(v);
      handleClose();
    },
    [onChange, handleClose],
  );

  // Keyboard navigation on the trigger button.
  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      handleOpen();
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      handleClose();
    }
  }

  // Keyboard navigation when popover is open (desktop only).
  function handlePopoverKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      handleClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((prev) => (prev + 1) % options.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((prev) => (prev - 1 + options.length) % options.length);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[focusedIdx];
      if (opt) handleSelect(opt.value);
    }
    if (e.key === "Home") {
      e.preventDefault();
      setFocusedIdx(0);
    }
    if (e.key === "End") {
      e.preventDefault();
      setFocusedIdx(options.length - 1);
    }
  }

  const selectedOpt = options.find((o) => o.value === value);
  const resolvedPlaceholder = placeholder ?? `Select ${label?.toLowerCase() ?? "an option"}…`;

  return (
    <div
      ref={anchorRef}
      className="relative"
      onKeyDown={open && !isMobile ? handlePopoverKeyDown : undefined}
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={isMobile ? undefined : listboxId}
        onClick={open ? handleClose : handleOpen}
        onKeyDown={handleTriggerKeyDown}
        className="w-full flex items-center gap-3 cursor-pointer transition-all duration-150 focus-visible:outline-none"
        style={{
          minHeight: 56,
          padding: "10px 14px",
          borderRadius: 16,
          background: "#ffffff",
          border: open
            ? `2.5px solid ${BRAND.blue}`
            : selectedOpt
              ? `2.5px solid ${BRAND.blue}`
              : "2.5px solid #d1d5db",
          boxShadow: open
            ? `0 0 0 3px ${BRAND.blue}22, 0 4px 0 ${BRAND.blueDark}30`
            : selectedOpt
              ? `0 0 0 3px ${BRAND.blue}12, 0 4px 0 ${BRAND.blueDark}20`
              : "0 2px 0 #d1d5db40",
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        {selectedOpt ? (
          <>
            <OptionThumb imageUrl={selectedOpt.imageUrl} label={selectedOpt.label} isSelected={false} />
            <span className="flex flex-col min-w-0 flex-1 text-left">
              <span
                className="font-bold leading-tight truncate"
                style={{ fontSize: 15, color: BRAND.ink }}
              >
                {selectedOpt.label}
              </span>
              {selectedOpt.sku && (
                <span
                  className="font-medium truncate mt-0.5"
                  style={{ fontSize: 11, color: "#94a3b8" }}
                >
                  {selectedOpt.sku}
                </span>
              )}
            </span>
            <PricePill opt={selectedOpt} basePrice={basePrice} />
          </>
        ) : (
          <span className="flex-1 text-left" style={{ fontSize: 15, color: "#9ca3af" }}>
            {resolvedPlaceholder}
          </span>
        )}
        <ChevronDown
          size={18}
          strokeWidth={2.5}
          className="shrink-0 transition-transform duration-150"
          style={{
            color: "#6b7280",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden="true"
        />
      </button>

      {/* Desktop: anchored popover */}
      {open && !isMobile && (
        <div
          role="presentation"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 9999,
            borderRadius: 20,
            background: "#ffffff",
            border: `2px solid ${BRAND.ink}12`,
            boxShadow: `0 8px 0 ${BRAND.ink}10, 0 20px 48px ${BRAND.ink}18`,
            overflow: "hidden",
            animation: "vop-open 0.15s ease both",
          }}
        >
          <style>{`
            @keyframes vop-open {
              from { opacity: 0; transform: translateY(-6px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0)    scale(1);    }
            }
          `}</style>
          <ul
            id={listboxId}
            role="listbox"
            aria-labelledby={triggerId}
            aria-activedescendant={`${listboxId}-opt-${focusedIdx}`}
            tabIndex={-1}
            className="py-2 px-2 flex flex-col gap-1 max-h-[320px] overflow-y-auto"
          >
            {options.map((opt, idx) => (
              <OptionRow
                key={opt.value}
                id={`${listboxId}-opt-${idx}`}
                opt={opt}
                isSelected={opt.value === value}
                isFocused={idx === focusedIdx}
                basePrice={basePrice}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setFocusedIdx(idx)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Mobile: vaul bottom sheet */}
      {isMobile && (
        <MobileBottomSheet
          open={open}
          options={options}
          value={value}
          basePrice={basePrice}
          label={label}
          onSelect={handleSelect}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
