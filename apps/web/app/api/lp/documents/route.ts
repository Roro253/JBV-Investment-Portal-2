import { getSession } from "@/lib/auth";
import { buildDocumentList, fetchPartnerInvestmentsForEmail } from "@/lib/lp-server";

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
    const documents = buildDocumentList(records).map((doc) => ({
      name: doc.name,
      type: doc.type,
      size: doc.size,
      investmentId: doc.recordId,
      investmentName: doc.investmentName,
      periodEnding: doc.periodEnding,
      field: doc.field,
      index: doc.index,
      downloadUrl: `/api/lp/documents/download?recordId=${encodeURIComponent(doc.recordId)}&field=${encodeURIComponent(doc.field)}&index=${doc.index}`,
    }));

    return Response.json({ documents });
  } catch (error: any) {
    const message = typeof error?.message === "string" ? error.message : "Failed to load documents";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
