import { getSession } from "@/lib/auth";
import { computeMetrics, fetchPartnerInvestmentsForEmail } from "@/lib/lp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  const email = session?.user?.email;

  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { records } = await fetchPartnerInvestmentsForEmail(email);
    const metrics = computeMetrics(records);

    return Response.json({ records, metrics });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to load data";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
