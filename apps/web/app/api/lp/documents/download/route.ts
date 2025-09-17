import { getSession } from "@/lib/auth";
import { fetchPartnerInvestmentRecordById } from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  const email = session?.user?.email;

  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const recordId = url.searchParams.get("recordId")?.trim();
  const field = url.searchParams.get("field")?.trim();
  const indexParam = url.searchParams.get("index");
  const index = indexParam ? Number.parseInt(indexParam, 10) : 0;

  if (!recordId || !field || Number.isNaN(index) || index < 0) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const record = await fetchPartnerInvestmentRecordById(recordId, email, "lp");
  if (!record) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const value = record.fields?.[field];
  if (!Array.isArray(value) || value.length <= index) {
    return Response.json({ error: "Document unavailable" }, { status: 404 });
  }

  const attachment = value[index];
  const attachmentUrl = attachment?.url;
  if (!attachmentUrl || typeof attachmentUrl !== "string") {
    return Response.json({ error: "Document unavailable" }, { status: 404 });
  }

  return Response.redirect(attachmentUrl, 302);
}
