export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { addCase, getCases, removeCase } from "@/lib/db";
import { searchCase } from "@/lib/scraper";

export async function GET() {
  const cases = await getCases();
  return NextResponse.json(cases);
}

export async function POST(req: NextRequest) {
  const { case_number } = await req.json();

  if (!case_number?.trim()) {
    return NextResponse.json({ error: "Case number is required" }, { status: 400 });
  }

  // Search the court site to validate the case
  const result = await searchCase(case_number.trim());

  if (!result) {
    return NextResponse.json(
      { error: "Case not found on the TN Courts website. Please check the case number." },
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
