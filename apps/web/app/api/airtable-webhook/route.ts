export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = req.headers.get("x-airtable-webhook-secret");
  if (process.env.AIRTABLE_WEBHOOK_SECRET && secret !== process.env.AIRTABLE_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  console.log("Webhook:", (body as any)?.tableName, (body as any)?.recordId);
  return Response.json({ ok: true });
}

