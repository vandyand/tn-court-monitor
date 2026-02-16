export const dynamic = "force-dynamic";
export const runtime = "edge";

import { NextResponse } from "next/server";

export async function GET() {
  const url = "https://pch.tncourts.gov/CaseDetails.aspx?id=30247&Number=True";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const body = await res.text();

    return NextResponse.json({
      statusCode: res.status,
      bodyLength: body.length,
      first500: body.substring(0, 500),
      containsSecurityNotice: body.includes("Security Notice"),
      containsUnusualActivity: body.includes("Unusual Activity"),
      runtime: "edge",
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      runtime: "edge",
    });
  }
}
