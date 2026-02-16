export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export async function GET() {
  const email = await getSetting("alert_email");
  return NextResponse.json({ alert_email: email || "" });
}

export async function POST(req: NextRequest) {
  const { alert_email } = await req.json();

  if (!alert_email?.trim() || !alert_email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  await setSetting("alert_email", alert_email.trim());
  return NextResponse.json({ ok: true });
}
