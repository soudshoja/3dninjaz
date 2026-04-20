import { redirect } from "next/navigation";

/**
 * `/signup` is a permanent alias for `/register`. Users (and external links,
 * marketing emails) often reach for `/signup` by muscle memory — keep the
 * URL live rather than 404ing. Carries over any `next` query param.
 */
export const dynamic = "force-dynamic";

export default async function SignupAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/register${suffix ? `?${suffix}` : ""}`);
}
