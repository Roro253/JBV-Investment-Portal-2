import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AIRTABLE_BASE = "appAswQzYFHzmwqGH";
const AIRTABLE_TABLE = "tblW2f8O3p6yhJBeE";
const AIRTABLE_VIEW = "viwVZZ9vksLZQ8GBG";

const AIRTABLE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}`;

// Optional: re-enable once exact spellings are confirmed
// const FIELDS = [
//   "Post Date",
//   "Company",
//   "New Investment Button",
//   "Send Update",
//   "Type",
//   "Data Room",
//   "Subject",
//   "Content",
//   "Content Att",
//   "Contacts",
//   "Target Securities",
//   "Company New",
//   "Stage (from Target Securities)",
//   "Logo (from Target Securities)",
//   "Partner Names",
//   "Partner Emails",
//   "Partner List",
//   "Logo",
//   "Update PDF",
//   "Notes",
//   "Assignee",
// ];

function buildUrl(searchParams: URLSearchParams) {
  const url = new URL(AIRTABLE_URL);
  // Trust the JBV Portal View for filters/sorting
  url.searchParams.set("view", AIRTABLE_VIEW);
  const offset = searchParams.get("offset");
  if (offset) url.searchParams.set("offset", offset);
  // Defer fields[]/sort until field names are 100% confirmed
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
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      const message =
        typeof parsed?.error?.message === "string"
          ? parsed.error.message
          : typeof parsed?.error === "string"
          ? parsed.error
          : "Airtable error";
      return NextResponse.json({ error: message, detail: parsed }, { status: response.status });
    } catch {
      return NextResponse.json({ error: "Airtable error", detail: text }, { status: response.status });
    }
  }

  const payload = await response.json();
  return NextResponse.json(payload);
}
