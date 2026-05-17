import { NextRequest, NextResponse } from "next/server";
import { uploadPaymentProofByToken } from "@/actions/payment-links";

/**
 * Phase 20 (20-08) — API route shim for bank-transfer slip upload.
 *
 * Purpose: XHR upload from BankTransferCard requires a Route Handler (not a
 * Server Action) so that xhr.upload.onprogress events fire during byte
 * transfer. Server Actions don't expose upload progress via XHR.
 *
 * This is a thin wrapper: it delegates ALL token validation, file caps,
 * DB writes, and status transitions to uploadPaymentProofByToken.
 *
 * D-25: Public — token is the only credential (no admin session required).
 * D-10: File caps (10 MB + MIME allowlist) enforced in uploadPaymentProofByToken.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form data." },
      { status: 400 },
    );
  }

  const result = await uploadPaymentProofByToken(token, formData);

  if (!result.ok) {
    // Map common error strings to appropriate HTTP status codes.
    const status = result.error.includes("expired") || result.error.includes("Invalid")
      ? 404
      : result.error.includes("not accepting")
        ? 409
        : result.error.includes("No file")
          ? 400
          : result.error.includes("10 MB") || result.error.includes("size")
            ? 413
            : result.error.includes("type") || result.error.includes("format")
              ? 415
              : 500;

    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true, proofId: result.proofId });
}
