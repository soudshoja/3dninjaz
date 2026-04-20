"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * UserNav renders in two flavours:
 *
 *   - variant="desktop" (default): an avatar + base-ui DropdownMenu with the
 *     account links. Suitable for ≥ md breakpoints.
 *   - variant="mobile": an inline list (no popover, no portal) used inside
 *     SiteNav's mobile disclosure. The DropdownMenu portal-positions to the
 *     viewport which fights the disclosure's body-scroll-lock and was
 *     producing a client-side exception on tap (the avatar in the mobile
 *     menu rendered the user's initials — "3N" for "3D Ninjaz Admin" — and
 *     opening the popup inside an already-open disclosure crashed React's
 *     focus-trap chain). Rendering plain Links sidesteps that entirely.
 *
 * Either flavour treats `data.user` defensively — when the session has no
 * name we fall back to a single "U" initial, never throwing on an empty
 * name string.
 */
function getInitials(name?: string | null): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const out = `${first}${second}`.toUpperCase();
  return out || "U";
}

export function UserNav({
  variant = "desktop",
}: {
  variant?: "desktop" | "mobile";
}) {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div
        className="h-9 w-24 animate-pulse rounded-md bg-gray-200"
        aria-hidden
      />
    );
  }

  if (!data?.user) {
    if (variant === "mobile") {
      return (
        <div className="flex flex-col gap-2">
          <Link
            href="/login"
            className="block min-h-[48px] rounded-md border border-[var(--color-brand-border)] px-4 py-3 text-center text-sm font-semibold"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="block min-h-[48px] rounded-md bg-[var(--color-brand-cta)] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Register
          </Link>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="text-sm font-medium text-[var(--color-brand-text-primary)] hover:text-[var(--color-brand-primary)]"
        >
          Sign In
        </Link>
        <Link href="/register">
          <Button
            size="sm"
            className="h-9 bg-[var(--color-brand-cta)] px-3 text-white hover:bg-[var(--color-brand-cta)]/90"
          >
            Register
          </Button>
        </Link>
      </div>
    );
  }

  const role =
    "role" in data.user ? (data.user as { role?: string }).role : undefined;
  const initials = getInitials(data.user.name);
  const isAdmin = role === "admin";

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  if (variant === "mobile") {
    // Inline list — no portal, no popover, no DropdownMenu. Avoids the
    // focus-trap clash with the parent disclosure that produced the
    // "tap-on-3N crashes the page" client-side exception.
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3 px-1 py-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={data.user.image ?? undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{data.user.name}</p>
            <p className="truncate text-xs text-[var(--color-brand-text-muted)]">
              {data.user.email}
            </p>
          </div>
        </div>
        {/* Admins land in /admin, customers in /account — single tap-target
            removes the "what does the avatar do?" ambiguity that prompted
            the original bug report. */}
        <Link
          href={isAdmin ? "/admin" : "/account"}
          className="block min-h-[48px] rounded-md px-3 py-3 text-sm font-semibold hover:bg-black/5"
        >
          {isAdmin ? "Admin Panel" : "Profile"}
        </Link>
        {!isAdmin && (
          <>
            <Link
              href="/orders"
              className="block min-h-[48px] rounded-md px-3 py-3 text-sm font-semibold hover:bg-black/5"
            >
              My orders
            </Link>
            <Link
              href="/account/addresses"
              className="block min-h-[48px] rounded-md px-3 py-3 text-sm font-semibold hover:bg-black/5"
            >
              Addresses
            </Link>
            <Link
              href="/account/wishlist"
              className="block min-h-[48px] rounded-md px-3 py-3 text-sm font-semibold hover:bg-black/5"
            >
              Wishlist
            </Link>
          </>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-1 inline-flex items-center justify-center gap-2 min-h-[48px] rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-3 text-sm font-semibold hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]"
            aria-label="User menu"
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={data.user.image ?? undefined} alt="" />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">{data.user.name}</span>
            <span className="text-xs text-[var(--color-brand-text-muted)]">
              {data.user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin ? (
          <DropdownMenuItem render={<Link href="/admin">Admin Panel</Link>} />
        ) : (
          <>
            <DropdownMenuItem render={<Link href="/account">Profile</Link>} />
            <DropdownMenuItem render={<Link href="/orders">My orders</Link>} />
            <DropdownMenuItem
              render={<Link href="/account/addresses">Addresses</Link>}
            />
            <DropdownMenuItem
              render={<Link href="/account/wishlist">Wishlist</Link>}
            />
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
