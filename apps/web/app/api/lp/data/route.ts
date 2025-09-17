import { getSession } from "@/lib/auth";
import type { Role } from "@/lib/auth-helpers";
import {
  computeMetrics,
  contactDisplayName,
  loadLpInvestmentsForEmail,
  type ContactRecord,
} from "@/lib/lp-server";
import type { LpDataResponse } from "@/types/lp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveProfileName(contacts: ContactRecord[], email: string) {
  for (const contact of contacts) {
    const name = contactDisplayName(contact);
    if (name && name !== "Investor") {
      return name;
    }
  }
  return email;
}

export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    const email = user?.email;
    if (!session || !user || !email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (user.role as Role | undefined) ?? "lp";
    const { contacts, records, note } = await loadLpInvestmentsForEmail(email, role);
    const metrics = computeMetrics(records);

    const profileName = resolveProfileName(contacts, email);

    const payload: LpDataResponse = {
      profile: { name: profileName, email },
      records,
      metrics,
    };

    if (note) {
      payload.note = note;
    }

    return Response.json(payload);
  } catch (error: any) {
    console.error("[lp-data] Failed to load LP data", error);
    return Response.json({ error: error?.message || "Failed to load data" }, { status: 500 });
  }
}
