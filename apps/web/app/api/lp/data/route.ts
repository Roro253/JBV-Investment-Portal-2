import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import { computeMetrics, contactDisplayName, loadLpInvestmentRecords } from "@/lib/lp-server";

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
    const { contacts, records, note } = await loadLpInvestmentRecords(email, role, VIEW_ID);

    const metrics = computeMetrics(records);
    const profileName = contacts.length ? contactDisplayName(contacts[0]) : email;

    return Response.json({
      profile: { name: profileName, email },
      records,
      metrics,
      note,
    });
  } catch (error: any) {
    console.error("[lp-data] Failed to load LP data", error);
    return Response.json({ error: error?.message || "Failed to load data" }, { status: 500 });
  }
}
