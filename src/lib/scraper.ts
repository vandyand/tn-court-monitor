import * as cheerio from "cheerio";
import type { SearchResult, ScrapedDocketEntry } from "./types";

const BASE_URL = "https://pch.tncourts.gov";

function parseCookies(setCookieHeader: string): string {
  // Extract cookie name=value pairs from Set-Cookie headers
  return setCookieHeader
    .split(",")
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

export async function searchCase(caseNumber: string): Promise<SearchResult | null> {
  // Step 1: GET the index page to establish a session cookie
  const indexRes = await fetch(`${BASE_URL}/Index.aspx`);
  const cookies = parseCookies(indexRes.headers.get("set-cookie") || "");

  // Step 2: Use the search results URL with the session cookie
  const searchUrl = `${BASE_URL}/SearchResults.aspx?k=${encodeURIComponent(caseNumber)}&Number=True`;
  const searchRes = await fetch(searchUrl, {
    headers: { Cookie: cookies },
  });

  const searchHtml = await searchRes.text();
  const $ = cheerio.load(searchHtml);

  // Find the first result row in the table
  const firstRow = $("table tr").eq(1); // skip header row
  if (!firstRow.length) return null;

  const cells = firstRow.find("td");
  if (cells.length < 2) return null;

  const foundNumber = cells.eq(0).text().trim();
  const caseName = cells.eq(1).text().trim();

  if (!foundNumber) return null;

  // Extract internal ID from onclick="javascript:redirectToCase('30247', 'Number', 'False');"
  let internalId = "";

  const onclick = firstRow.attr("onclick") || "";
  const redirectMatch = onclick.match(/redirectToCase\('(\d+)'/);
  if (redirectMatch) {
    internalId = redirectMatch[1];
  }

  // Fallback: look for CaseDetails links anywhere on the page
  if (!internalId) {
    const pageHtml = $.html();
    const caseDetailsMatch = pageHtml.match(/CaseDetails\.aspx\?id=(\d+)/);
    if (caseDetailsMatch) {
      internalId = caseDetailsMatch[1];
    }
  }

  if (!internalId) return null;

  return {
    case_number: foundNumber,
    case_name: caseName,
    internal_id: internalId,
    url: `${BASE_URL}/CaseDetails.aspx?id=${internalId}`,
  };
}

export async function scrapeDocketEntries(
  internalId: string
): Promise<{ entries: ScrapedDocketEntry[]; caseName: string }> {
  const url = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const caseName = $("h1").first().text().trim();
  const entries: ScrapedDocketEntry[] = [];

  // Find the Case History table — it has columns: Date, Event, Filer, PDF
  // Look for the heading "Case History" and then the next table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let historyTable: cheerio.Cheerio<any> | null = null;

  $("h3").each((_, el) => {
    if ($(el).text().trim() === "Case History") {
      historyTable = $(el).next("table");
    }
  });

  if (!historyTable) {
    // Try finding by table with Date/Event/Filer/PDF headers
    $("table").each((_, table) => {
      const headers = $(table).find("th");
      const headerTexts = headers.map((__, h) => $(h).text().trim()).get();
      if (headerTexts.includes("Date") && headerTexts.includes("Event")) {
        historyTable = $(table);
      }
    });
  }

  if (!historyTable) return { entries, caseName };

  // Parse rows (skip header)
  $(historyTable!)
    .find("tbody tr")
    .each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;

      const date = cells.eq(0).text().trim();
      const event = cells.eq(1).text().trim();
      const filer = cells.eq(2).text().trim();

      // Check for PDF link in the last cell
      let hasPdf = false;
      let pdfPostbackTarget: string | null = null;

      const pdfCell = cells.eq(3);
      const pdfLink = pdfCell.find("a");
      if (pdfLink.length) {
        hasPdf = true;
        // Extract the __doPostBack target from the href
        const href = pdfLink.attr("href") || "";
        const postbackMatch = href.match(/__doPostBack\('([^']+)'/);
        if (postbackMatch) {
          pdfPostbackTarget = postbackMatch[1];
        }
      }

      entries.push({ date, event, filer, has_pdf: hasPdf, pdf_postback_target: pdfPostbackTarget });
    });

  return { entries, caseName };
}

export async function downloadPdf(
  internalId: string,
  postbackTarget: string
): Promise<Buffer | null> {
  try {
    // Step 1: GET the case details page to extract ViewState tokens
    const pageUrl = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
    const pageRes = await fetch(pageUrl);
    const pageHtml = await pageRes.text();
    const $ = cheerio.load(pageHtml);

    const viewState = $("#__VIEWSTATE").val() as string;
    const viewStateGenerator = $("#__VIEWSTATEGENERATOR").val() as string;
    const eventValidation = $("#__EVENTVALIDATION").val() as string;

    if (!viewState || !eventValidation) return null;

    // Extract cookies from the response
    const cookies = pageRes.headers.get("set-cookie") || "";

    // Step 2: POST back with the event target to download the PDF
    const formData = new URLSearchParams();
    formData.append("__VIEWSTATE", viewState);
    formData.append("__VIEWSTATEGENERATOR", viewStateGenerator || "");
    formData.append("__EVENTVALIDATION", eventValidation);
    formData.append("__EVENTTARGET", postbackTarget);
    formData.append("__EVENTARGUMENT", "");

    const pdfRes = await fetch(pageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      body: formData.toString(),
      redirect: "follow",
    });

    if (!pdfRes.ok) return null;

    const contentType = pdfRes.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      return null;
    }

    const arrayBuffer = await pdfRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error("PDF download failed:", error);
    return null;
  }
}
