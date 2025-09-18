import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AIRTABLE_BASE = "appAswQzYFHzmwqGH";
const AIRTABLE_TABLE = "tblW2f8O3p6yhJBeE";
const AIRTABLE_VIEW = "viwVZZ9vksLZQ8GBG";

const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;

const FIELDS = [
  "Portal",
  "Post Date",
  "Company",
  "Send Update",
  "Type",
  "Data Room",
  "Subject",
  "Content",
  "Content Att",
  "Contacts",
  "Partner Names",
  "Partner Emails",
  "Partner List",
  "Logo",
  "Update PDF",
  "Notes",
  "Assignee",
];

function buildUrl(searchParams: URLSearchParams) {
  const url = new URL(AIRTABLE_URL);
  url.searchParams.set("view", AIRTABLE_VIEW);
  url.searchParams.set("filterByFormula", "Portal");
  const offset = searchParams.get("offset");
  if (offset) url.searchParams.set("offset", offset);
  FIELDS.forEach((field) => url.searchParams.append("fields[]", field));
  url.searchParams.append("sort[0][field]", "Post Date");
  url.searchParams.append("sort[0][direction]", "desc");
  return url.toString();
}

async function fetchAirtable(url: string, tries = 3): Promise<Response> {
  for (let index = 0; index < tries; index += 1) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
      },
      next: { revalidate: 60 },
    });
    if (response.status !== 429) return response;
    await new Promise((resolve) => setTimeout(resolve, 500 * (index + 1)));
  }
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    },
  });
}

export async function GET(request: Request) {
  if (!process.env.AIRTABLE_API_KEY) {
    return NextResponse.json({ error: "Missing AIRTABLE_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const url = buildUrl(searchParams);

  const response = await fetchAirtable(url);
  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json({ error: "Airtable error", detail }, { status: response.status });
  }

  const payload = await response.json();
  return NextResponse.json(payload);
}
