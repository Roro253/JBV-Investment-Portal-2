import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth-helpers";
import {
  PARTNER_INVESTMENTS_TABLE,
  base,
  loadLpInvestmentsForEmail,
  withLimiter,
} from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseIndex(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const recordId = searchParams.get("recordId");
    const field = searchParams.get("field");
    const index = parseIndex(searchParams.get("index"));

    if (!recordId || !field) {
      return new Response("Missing parameters", { status: 400 });
    }

    const session = await getSession();
    const user = session?.user;
    const email = user?.email;
    if (!session || !user || !email) {
      return new Response("Unauthorized", { status: 401 });
    }

    const role = (user.role as Role | undefined) ?? "lp";
    const { records } = await loadLpInvestmentsForEmail(email, role);
    const record = records.find((item) => item.id === recordId);
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const visibleFields = record.fields || {};
    if (!Object.prototype.hasOwnProperty.call(visibleFields, field)) {
      return new Response("Not found", { status: 404 });
    }

    const airtableRecord = await withLimiter(() => base(PARTNER_INVESTMENTS_TABLE).find(recordId));
    const rawField = (airtableRecord.fields || {})[field as keyof typeof airtableRecord.fields];

    if (!Array.isArray(rawField) || rawField.length === 0) {
      return new Response("File not found", { status: 404 });
    }

    const attachment = rawField[index];
    if (!attachment || typeof attachment.url !== "string") {
      return new Response("File not found", { status: 404 });
    }

    return Response.redirect(attachment.url, 302);
  } catch (error) {
    console.error("[lp-documents] Failed to proxy download", error);
    return new Response("Unable to download document", { status: 500 });
  }
}
