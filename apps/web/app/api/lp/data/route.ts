import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import {
  applyVisibility,
  computeMetrics,
  contactDisplayName,
  expandLinked,
  findContactsByEmail,
  getInvestmentsForContactIds,
} from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEW_ID = process.env.AIRTABLE_VIEW_ID;

export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    const email = user?.email;
    if (!session || !user || !email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (user.role as Role | undefined) ?? "lp";
    const contacts = await findContactsByEmail(email);
    const contactIds = contacts.map((c) => c.id);

    let note: string | undefined;
    if (!contactIds.length) {
      note = "contact-not-found";
    }

    let investments = [] as Awaited<ReturnType<typeof getInvestmentsForContactIds>>;
    if (contactIds.length) {
      investments = await getInvestmentsForContactIds(contactIds, VIEW_ID);
      if (!investments.length && VIEW_ID) {
        note = "view-filtered";
      }
    }

    const expanded = await Promise.all(investments.map((record) => expandLinked(record)));
    const visible = await Promise.all(
      expanded.map(async (record) => ({
        ...record,
        fields: await applyVisibility(record.fields, role),
      }))
    );

    const metrics = computeMetrics(visible);
    const profileName = contacts.length ? contactDisplayName(contacts[0]) : email;

    return Response.json({
      profile: { name: profileName, email },
      records: visible,
      metrics,
      note,
    });
  } catch (error: any) {
    console.error("[lp-data] Failed to load LP data", error);
    return Response.json({ error: error?.message || "Failed to load data" }, { status: 500 });
  }
}
