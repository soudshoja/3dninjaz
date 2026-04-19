"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function UserNav() {
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

  const role = "role" in data.user ? (data.user as { role?: string }).role : undefined;
  const initials = data.user.name
    ? data.user.name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
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
        {role === "admin" && (
          <DropdownMenuItem render={<Link href="/admin">Admin Panel</Link>} />
        )}
        <DropdownMenuItem onClick={handleSignOut}>Sign Out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
