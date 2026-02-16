export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { addCase, getCases, removeCase } from "@/lib/db";

export async function GET() {
  try {
    const cases = await getCases();
    return NextResponse.json(cases);
  } catch (e) {
    console.error("[GET /api/cases]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { case_url } = await req.json();

  if (!case_url?.trim()) {
    return NextResponse.json({ error: "Case URL is required" }, { status: 400 });
  }

  let result;
  try {
    const { lookupCase } = await import("@/lib/scraper");
    result = await lookupCase(case_url.trim());
  } catch (e) {
    console.error("[POST /api/cases] lookupCase threw:", e);
    return NextResponse.json(
      { error: `Scraper error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  if (!result) {
    return NextResponse.json(
      { error: "Could not find a valid case. Please paste the full URL from pch.tncourts.gov (e.g. https://pch.tncourts.gov/CaseDetails.aspx?id=30247)." },
      { status: 404 }
    );
  }

  try {
    const id = await addCase(result.case_number, result.case_name, result.url, result.internal_id);
    return NextResponse.json({
      id: Number(id),
      case_number: result.case_number,
      case_name: result.case_name,
      case_url: result.url,
    });
  } catch {
    return NextResponse.json({ error: "Case is already being tracked" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await removeCase(id);
  return NextResponse.json({ ok: true });
}
