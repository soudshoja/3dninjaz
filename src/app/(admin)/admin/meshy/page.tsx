import type { Metadata } from "next";
import Link from "next/link";
import { ImageOff as NoThumbnailIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth-helpers";
import { listGenerations } from "@/actions/admin-meshy";
import { AdminMeshyStatusBadge } from "@/components/admin/admin-meshy-status-badge";
import { BRAND } from "@/lib/brand";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Meshy 3D",
  robots: { index: false, follow: false },
};

/**
 * /admin/meshy — list every Meshy generation (Phase 21 21-06).
 *
 * requireAdmin() is called here at the top even though (admin)/layout.tsx
 * also redirects unauthenticated users — belt-and-braces, CVE-2025-29927.
 *
 * Data comes straight from the `listGenerations` Server Action (21-03),
 * which already performs the manual multi-query hydration (no LATERAL —
 * MariaDB 10.11 doesn't support it). No relational query builder call is
 * used on this page.
 *
 * Thumbnails are streamed ONLY through the authed download route (Phase 21
 * 21-04, thumb variant) — never a Meshy-hosted URL directly (those expire
 * after 3 days).
 */
export default async function AdminMeshyPage() {
  await requireAdmin();

  const rows = await listGenerations();

  return (
    <main className="min-h-screen" style={{ backgroundColor: BRAND.cream, color: BRAND.ink }}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl md:text-4xl">
              Meshy Generations
            </h1>
            <p className="mt-1 text-slate-600">Photo → 3D model → print-ready file</p>
          </div>
          <Link
            href="/admin/meshy/new"
            className="inline-flex shrink-0 items-center rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors"
            style={{ backgroundColor: BRAND.green }}
          >
            + New Generation
          </Link>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#ffffff" }}>
            <p className="text-lg font-bold mb-2">No generations yet.</p>
            <p className="mb-4 text-sm text-slate-600">
              Upload a reference photo to start your first 3D generation.
            </p>
            <Link
              href="/admin/meshy/new"
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors"
              style={{ backgroundColor: BRAND.green }}
            >
              + New Generation
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thumbnail</TableHead>
                  <TableHead>Prompt/Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-black/[0.02]">
                    <TableCell>
                      <Link href={`/admin/meshy/${row.id}`} className="block">
                        {row.localThumbnailPath ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/admin/meshy/${row.id}/download?file=thumb`}
                            alt=""
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                            <NoThumbnailIcon className="h-5 w-5" aria-hidden />
                          </span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/meshy/${row.id}`} className="block max-w-[280px] truncate">
                        {row.texturePrompt ? (
                          row.texturePrompt
                        ) : (
                          <span className="italic text-slate-400">No prompt</span>
                        )}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/meshy/${row.id}`} className="block">
                        <AdminMeshyStatusBadge status={row.status} />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Link href={`/admin/meshy/${row.id}`} className="block">
                        {row.creditsUsed}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/meshy/${row.id}`} className="block">
                        {new Date(row.createdAt).toLocaleDateString("en-MY", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
}
