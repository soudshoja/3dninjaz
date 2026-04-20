import "server-only";
import { getAccessToken, paypalApiBase } from "@/lib/paypal";

/**
 * Phase 7 (07-02) — disputes API helpers.
 *
 * The PayPal SDK v2.3.x does NOT expose a DisputesController. We use direct
 * fetch + cached OAuth bearer for every endpoint. provide-evidence requires
 * multipart/form-data per PayPal API contract.
 *
 * All exports are server-only — never bundle to client (T-07-02-bundle-leak).
 */

export type DisputeListItem = {
  disputeId: string;
  caseNumber: string | null;
  status: string;
  reason: string;
  amountValue: string;
  currency: string;
  createTime: string;
  updateTime: string;
};

export type DisputeListResult = {
  items: DisputeListItem[];
  nextPageToken: string | null;
};

type RawDispute = {
  dispute_id?: string;
  case_number?: string;
  status?: string;
  reason?: string;
  dispute_amount?: { value?: string; currency_code?: string };
  create_time?: string;
  update_time?: string;
};

type RawListResponse = {
  items?: RawDispute[];
  links?: Array<{ rel: string; href: string }>;
};

export async function listDisputesPage(
  input: { pageSize?: number; nextPageToken?: string } = {},
): Promise<DisputeListResult> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    page_size: String(input.pageSize ?? 20),
    ...(input.nextPageToken ? { next_page_token: input.nextPageToken } : {}),
  });
  const r = await fetch(
    `${paypalApiBase()}/v1/customer/disputes?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!r.ok) throw new Error(`[disputes] list failed: ${r.status}`);
  const j = (await r.json()) as RawListResponse;
  const items: DisputeListItem[] = (j.items ?? []).map((d) => ({
    disputeId: d.dispute_id ?? "",
    caseNumber: d.case_number ?? null,
    status: d.status ?? "OTHER",
    reason: d.reason ?? "",
    amountValue: d.dispute_amount?.value ?? "0.00",
    currency: d.dispute_amount?.currency_code ?? "MYR",
    createTime: d.create_time ?? new Date().toISOString(),
    updateTime: d.update_time ?? new Date().toISOString(),
  }));
  let nextPageToken: string | null = null;
  const nextLink = (j.links ?? []).find((l) => l.rel === "next");
  if (nextLink) {
    try {
      const u = new URL(nextLink.href);
      nextPageToken = u.searchParams.get("next_page_token");
    } catch {
      nextPageToken = null;
    }
  }
  return { items, nextPageToken };
}

export async function getDispute(disputeId: string): Promise<unknown | null> {
  const token = await getAccessToken();
  const r = await fetch(
    `${paypalApiBase()}/v1/customer/disputes/${encodeURIComponent(disputeId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`[disputes] get failed: ${r.status}`);
  return await r.json();
}

export type AcceptClaimInput = {
  note: string;
  refundAmount?: { value: string; currencyCode: string };
};

export async function acceptClaim(
  disputeId: string,
  input: AcceptClaimInput,
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const token = await getAccessToken();
  const r = await fetch(
    `${paypalApiBase()}/v1/customer/disputes/${encodeURIComponent(disputeId)}/accept-claim`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        note: input.note,
        ...(input.refundAmount
          ? { refund_amount: input.refundAmount }
          : {}),
      }),
    },
  );
  if (!r.ok) {
    const body = await r.text();
    return { ok: false, status: r.status, body };
  }
  return { ok: true };
}

export type EvidenceInput = {
  evidences: Array<{
    evidence_type: string;
    notes?: string;
    documents?: Array<{ name: string; mediaType: string; data: Buffer }>;
  }>;
};

export async function provideEvidence(
  disputeId: string,
  input: EvidenceInput,
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const token = await getAccessToken();
  const form = new FormData();
  const inputJson = {
    evidences: input.evidences.map((e) => ({
      evidence_type: e.evidence_type,
      notes: e.notes ?? "",
    })),
  };
  form.append(
    "input",
    new Blob([JSON.stringify(inputJson)], { type: "application/json" }),
    "input.json",
  );
  let fileIdx = 1;
  for (const e of input.evidences) {
    for (const d of e.documents ?? []) {
      form.append(
        `file${fileIdx}`,
        new Blob([new Uint8Array(d.data)], { type: d.mediaType }),
        d.name,
      );
      fileIdx++;
    }
  }
  const r = await fetch(
    `${paypalApiBase()}/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
  if (!r.ok) {
    const body = await r.text();
    return { ok: false, status: r.status, body };
  }
  return { ok: true };
}

export async function escalateToArbiter(
  disputeId: string,
  input: { note: string },
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const token = await getAccessToken();
  const r = await fetch(
    `${paypalApiBase()}/v1/customer/disputes/${encodeURIComponent(disputeId)}/escalate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ note: input.note }),
    },
  );
  if (!r.ok) {
    const body = await r.text();
    return { ok: false, status: r.status, body };
  }
  return { ok: true };
}
