export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const CHROMIUM_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

export async function GET() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const chromium = require("@sparticuz/chromium-min");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require("puppeteer-core");

    const executablePath = await chromium.executablePath(CHROMIUM_URL);

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto("https://pch.tncourts.gov/CaseDetails.aspx?id=30247&Number=True", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const html = await page.content();
    await browser.close();

    return NextResponse.json({
      bodyLength: html.length,
      first500: html.substring(0, 500),
      containsSecurityNotice: html.includes("Security Notice"),
      containsUnusualActivity: html.includes("Unusual Activity"),
      containsCaseHistory: html.includes("Case History"),
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 5) : undefined,
    });
  }
}
