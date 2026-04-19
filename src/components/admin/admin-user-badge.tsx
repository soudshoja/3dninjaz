"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AdminUserBadge({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-[var(--color-brand-border)] bg-[var(--color-brand-surface)] p-3 text-sm">
      <p className="font-medium text-[var(--color-brand-text-primary)]">{name}</p>
      <p className="truncate text-xs text-[var(--color-brand-text-muted)]">
        {email}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 h-8 w-full justify-center gap-2"
        onClick={handleSignOut}
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign Out
      </Button>
    </div>
  );
}
