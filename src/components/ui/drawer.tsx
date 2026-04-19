"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * shadcn-style Drawer wrapping vaul. Vaul in `direction="right"` renders
 * as a right-side drawer on desktop; the `max-md:*` CSS overrides reshape
 * it into a bottom sheet on mobile (≤ 768px) per D2-19 + D2-23.
 *
 * Consumers should use:
 *   <Drawer open={x} onOpenChange={setX}>
 *     <DrawerContent aria-label="...">
 *       <DrawerHeader>...</DrawerHeader>
 *       ...scrollable body...
 *       <DrawerFooter>...</DrawerFooter>
 *     </DrawerContent>
 *   </Drawer>
 */
const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    direction="right"
    {...props}
  />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/40", className)}
    {...props}
  />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed right-0 top-0 bottom-0 z-50 flex h-full w-full max-w-md flex-col overflow-hidden shadow-2xl",
        "max-md:top-auto max-md:right-0 max-md:left-0 max-md:h-[85vh] max-md:max-w-none max-md:rounded-t-[24px]",
        className
      )}
      style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}
      {...props}
    >
      {/* vaul bottom-sheet drag handle — visible on mobile only. */}
      <div className="md:hidden mx-auto mt-3 h-1.5 w-16 rounded-full bg-black/20" />
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-5 border-b border-black/10", className)}
    {...props}
  />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-auto p-5 border-t border-black/10 bg-white/70 backdrop-blur",
      className
    )}
    {...props}
  />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("font-[var(--font-heading)] text-2xl", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-slate-600", className)}
    {...props}
  />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
