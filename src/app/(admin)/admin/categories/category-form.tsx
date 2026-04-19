"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createCategory } from "@/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set("name", name);

    startTransition(async () => {
      const result = await createCategory(fd);
      if ("error" in result) {
        const err = result.error;
        if (typeof err === "string") {
          setError(err);
        } else {
          const first = Object.values(err).find(
            (v): v is string[] => Array.isArray(v) && v.length > 0
          );
          setError(first?.[0] ?? "Unable to create category.");
        }
        return;
      }
      setName("");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[var(--color-brand-border)] bg-white p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="category-name">New Category Name</Label>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Figurines, Phone Cases, Home Decor"
            maxLength={50}
            required
            disabled={pending}
            className="h-10"
          />
        </div>
        <Button
          type="submit"
          disabled={pending || !name.trim()}
          className="h-10 gap-2 bg-[var(--color-brand-cta)] text-white hover:bg-[var(--color-brand-cta)]/90"
        >
          <Plus className="h-4 w-4" />
          {pending ? "Adding..." : "Add Category"}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
