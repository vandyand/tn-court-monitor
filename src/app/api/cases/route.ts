export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { addCase, getCases, removeCase } from "@/lib/db";
import { lookupCase } from "@/lib/scraper";

export async function GET() {
  const cases = await getCases();
  return NextResponse.json(cases);
}

export async function POST(req: NextRequest) {
  const { case_url } = await req.json();

  if (!case_url?.trim()) {
    return NextResponse.json({ error: "Case URL is required" }, { status: 400 });
  }

  const result = await lookupCase(case_url.trim());

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
