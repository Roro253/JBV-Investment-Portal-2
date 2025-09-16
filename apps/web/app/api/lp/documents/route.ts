import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  expandPartnerInvestmentRecords,
  selectPartnerInvestmentsByEmail,
} from "@/lib/airtablePartnerInvestments";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ATTACHMENT_FIELD_HINTS = new Set([
  "Latest PCAP File",
  "PCAP Distribution Report",
  "Subscription Doc",
  "Subscription Document",
  "Capital Call Notice",
]);

function extractAttachments(record: { id: string; fields: Record<string, any> }) {
  const fields = record.fields || {};
  const investmentName =
    fields["Partner Investment"] ||
    fields["Investment"] ||
    fields["Name"] ||
    "Investment";
  const periodEnding = fields["Period Ending"] || null;

  const documents: Array<{
    name: string;
    url: string;
    size?: number;
    type?: string;
    investmentId: string;
    investmentName: string;
    periodEnding: string | null;
  }> = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const looksLikeAttachment =
      ATTACHMENT_FIELD_HINTS.has(fieldName) ||
      value.some((item) => item && typeof item === "object" && "url" in item && typeof item.url === "string");
    if (!looksLikeAttachment) continue;

    for (const item of value) {
      if (!item || typeof item !== "object" || typeof item.url !== "string") continue;
      const name = (item as any).filename || (item as any).name || (item as any).title || fieldName;
      documents.push({
        name,
        url: item.url,
        size: (item as any).size,
        type: (item as any).type,
        investmentId: record.id,
        investmentName,
        periodEnding,
      });
    }
  }

  return documents;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = await selectPartnerInvestmentsByEmail(session.user.email);
  const expanded = await expandPartnerInvestmentRecords(rows);

  const documents = expanded.flatMap((record) => extractAttachments(record));

  return NextResponse.json({ documents });
}
