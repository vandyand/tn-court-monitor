export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as https from "https";

const CIPHERS = [
  "TLS_AES_128_GCM_SHA256",
  "TLS_AES_256_GCM_SHA384",
  "TLS_CHACHA20_POLY1305_SHA256",
  "ECDHE-ECDSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-ECDSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-ECDSA-CHACHA20-POLY1305",
  "ECDHE-RSA-CHACHA20-POLY1305",
  "ECDHE-RSA-AES128-SHA",
  "ECDHE-RSA-AES256-SHA",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
].join(":");

export async function GET() {
  const url = "https://pch.tncourts.gov/CaseDetails.aspx?id=30247&Number=True";

  try {
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.request(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          ciphers: CIPHERS,
          minVersion: "TLSv1.2",
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString("utf-8"),
            });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });

    return NextResponse.json({
      statusCode: result.status,
      bodyLength: result.body.length,
      first500: result.body.substring(0, 500),
      containsSecurityNotice: result.body.includes("Security Notice"),
      containsUnusualActivity: result.body.includes("Unusual Activity"),
      containsCaseDetails: result.body.includes("CaseDetails"),
      nodeVersion: process.version,
    });
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
      nodeVersion: process.version,
    });
  }
}
