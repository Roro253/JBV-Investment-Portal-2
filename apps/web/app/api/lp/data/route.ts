import { getSession } from "@/lib/auth";
import { type Role } from "@/lib/auth-helpers";
import { computeMetrics, loadPartnerInvestmentRecords } from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    const email = user?.email;
    if (!session || !user || !email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (user.role as Role | undefined) ?? "lp";
    const { records } = await loadPartnerInvestmentRecords(email, role);
    const metrics = computeMetrics(records);

    return Response.json({ records, metrics });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Failed to load data" }, { status: 500 });
  }
}
