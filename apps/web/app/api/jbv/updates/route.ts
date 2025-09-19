import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AIRTABLE_BASE = "appAswQzYFHzmwqGH";
const AIRTABLE_TABLE = "tblW2f8O3p6yhJBeE";
const AIRTABLE_VIEW_ID = "viwVZZ9vksLZQ8GBG";

const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;

function buildUrl(searchParams: URLSearchParams) {
  const url = new URL(AIRTABLE_URL);
  url.searchParams.set("view", AIRTABLE_VIEW_ID);
  const offset = searchParams.get("offset");
  if (offset) {
    url.searchParams.set("offset", offset);
  }
  return url.toString();
}

export async function GET(request: Request) {
  if (!process.env.AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "Missing AIRTABLE_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const airtableUrl = buildUrl(searchParams);

  const airtableResponse = await fetch(airtableUrl, {
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    },
    cache: "no-store",
  });

  const text = await airtableResponse.text();

  if (!airtableResponse.ok) {
    try {
      const json = JSON.parse(text);
      return NextResponse.json({ error: "Airtable error", detail: json }, { status: airtableResponse.status });
    } catch {
      return NextResponse.json({ error: "Airtable error", detail: text }, { status: airtableResponse.status });
    }
  }

  try {
    return NextResponse.json(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Invalid JSON from Airtable", body: text }, { status: 502 });
  }
}
