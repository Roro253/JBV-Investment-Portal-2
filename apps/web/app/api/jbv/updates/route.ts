import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AIRTABLE_BASE = "appAswQzYFHzmwqGH";
const AIRTABLE_TABLE = "tblW2f8O3p6yhJBeE";
const AIRTABLE_VIEW_ID = "viwVZZ9vksLZQ8GBG";

const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;

function buildUrl(searchParams: URLSearchParams) {
  const url = new URL(AIRTABLE_URL);

  // Use the view ID to inherit Airtable filtering/sorting configuration.
  url.searchParams.set("view", AIRTABLE_VIEW_ID);

  const offset = searchParams.get("offset");
  if (offset) {
    url.searchParams.set("offset", offset);
  }

  return url.toString();
}

export async function GET(req: Request) {
  if (!process.env.AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "Missing AIRTABLE_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const url = buildUrl(searchParams);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    cache: "no-store",
  });

  const text = await response.text();

  if (!response.ok) {
    try {
      const json = JSON.parse(text);
      return NextResponse.json({ error: "Airtable error", detail: json }, { status: response.status });
    } catch {
      return NextResponse.json({ error: "Airtable error", detail: text }, { status: response.status });
    }
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Invalid JSON from Airtable", body: text }, { status: 502 });
  }
}
