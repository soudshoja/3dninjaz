"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-[var(--color-brand-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-brand-text-primary)] hover:bg-gray-50"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
