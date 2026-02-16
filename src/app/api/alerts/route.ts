export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRecentAlerts } from "@/lib/db";

export async function GET() {
  const alerts = await getRecentAlerts();
  return NextResponse.json(alerts);
}
