import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import {
  applyVisibility,
  findContactsByEmail,
  getInvestmentsForContactIds,
} from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_ID = process.env.AIRTABLE_VIEW_ID;

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
    const contacts = await findContactsByEmail(email);
    const contactIds = contacts.map((c) => c.id);
    if (!contactIds.length) {
      return new Response("Not found", { status: 404 });
    }

    const investments = await getInvestmentsForContactIds(contactIds, VIEW_ID);
    const record = investments.find((item) => item.id === recordId);
    if (!record) {
      return new Response("Not found", { status: 404 });
    }

    const visibleFields = await applyVisibility(record.fields, role);
    if (!Object.prototype.hasOwnProperty.call(visibleFields, field)) {
      return new Response("Not found", { status: 404 });
    }

    const value = visibleFields[field as keyof typeof visibleFields];
    if (!Array.isArray(value) || value.length <= index) {
      return new Response("File not found", { status: 404 });
    }

    const attachment = value[index];
    if (!attachment || typeof attachment.url !== "string") {
      return new Response("File not found", { status: 404 });
    }

    return Response.redirect(attachment.url, 302);
  } catch (error) {
    console.error("[documents-download] Failed to proxy download", error);
    return new Response("Unable to download document", { status: 500 });
  }
}
