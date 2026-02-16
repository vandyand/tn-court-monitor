export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCases, getExistingEntries, insertEntry, recordAlert, getSetting } from "@/lib/db";
// scraper imported dynamically to avoid cold start penalty
import { sendAlertEmail } from "@/lib/email";
import type { ScrapedDocketEntry } from "@/lib/types";

export async function GET() {
  return handleCheck();
}

export async function POST() {
  return handleCheck();
}

async function handleCheck() {
  const email = await getSetting("alert_email");
  if (!email) {
    return NextResponse.json({ error: "No alert email configured" }, { status: 400 });
  }

  const cases = await getCases();
  if (cases.length === 0) {
    return NextResponse.json({ message: "No cases to check" });
  }

  const { scrapeDocketEntries, downloadPdf } = await import("@/lib/scraper");
  const results = [];

  for (const c of cases) {
    const internalId = c.internal_id as string;
    if (!internalId) continue;

    try {
      const { entries, caseName } = await scrapeDocketEntries(internalId);
      const existing = await getExistingEntries(c.id as number);

      // Build a set of existing entries for fast lookup
      const existingSet = new Set(
        existing.map((e) => `${e.entry_date}|${e.event}|${e.filer}`)
      );

      // Find new entries
      const newEntries: ScrapedDocketEntry[] = [];
      for (const entry of entries) {
        const key = `${entry.date}|${entry.event}|${entry.filer}`;
        if (!existingSet.has(key)) {
          newEntries.push(entry);
          await insertEntry(
            c.id as number,
            entry.date,
            entry.event,
            entry.filer,
            entry.has_pdf,
            entry.pdf_postback_target
          );
        }
      }

      if (newEntries.length > 0) {
        // Download PDFs — only for incremental updates (≤3 new entries)
        // Skip on initial bulk import to stay within serverless timeout
        const attachments = [];
        if (newEntries.length <= 3) {
          for (const entry of newEntries) {
            if (entry.has_pdf && entry.pdf_postback_target) {
              try {
                const pdf = await downloadPdf(internalId, entry.pdf_postback_target);
                if (pdf) {
                  const safeName = entry.event.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 50);
                  attachments.push({
                    filename: `${c.case_number}_${entry.date}_${safeName}.pdf`,
                    content: pdf,
                  });
                }
              } catch {
                console.error(`PDF download failed for ${entry.event}, skipping`);
              }
            }
          }
        }

        await sendAlertEmail(
          email,
          c.case_number as string,
          caseName || (c.case_name as string) || "Unknown",
          newEntries,
          attachments
        );

        await recordAlert(c.id as number, newEntries.length);

        results.push({
          case_number: c.case_number,
          new_entries: newEntries.length,
          pdfs_attached: attachments.length,
        });
      } else {
        results.push({ case_number: c.case_number, new_entries: 0 });
      }
    } catch (error) {
      console.error(`Error checking case ${c.case_number}:`, error);
      results.push({
        case_number: c.case_number,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ checked: cases.length, results });
}
