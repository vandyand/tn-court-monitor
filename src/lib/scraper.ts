import * as cheerio from "cheerio";
import { gotScraping } from "got-scraping";
import type { SearchResult, ScrapedDocketEntry } from "./types";

const BASE_URL = "https://pch.tncourts.gov";

const gotOptions = {
  headerGeneratorOptions: {
    browsers: [{ name: "chrome" as const }],
    operatingSystems: [{ name: "windows" as const }],
  },
};

async function fetchPage(url: string): Promise<string> {
  const res = await gotScraping({ url, ...gotOptions });
  return res.body;
}

export async function lookupCase(input: string): Promise<SearchResult | null> {
  // Extract internal ID from URL if a URL was provided
  const idMatch = input.match(/id=(\d+)/);
  let internalId: string;

  if (idMatch) {
    internalId = idMatch[1];
  } else {
    // Input is not a URL — reject and tell user to paste URL
    return null;
  }

  // Fetch the case details page to get the case number and name
  const url = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
  const html = await fetchPage(url);

  if (html.includes("Security Notice") || html.includes("Unusual Activity")) return null;

  const $ = cheerio.load(html);

  // The page has multiple h1/h2: first pair is site header, second is case info
  const h1s = $("h1");
  const h2s = $("h2");
  const caseName = h1s.length > 1 ? h1s.eq(1).text().trim() : h1s.first().text().trim();
  const caseNumber = h2s.length > 1 ? h2s.eq(1).text().trim() : h2s.first().text().trim();

  if (!caseNumber) return null;

  return {
    case_number: caseNumber,
    case_name: caseName,
    internal_id: internalId,
    url,
  };
}

export async function scrapeDocketEntries(
  internalId: string
): Promise<{ entries: ScrapedDocketEntry[]; caseName: string }> {
  const url = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const h1s = $("h1");
  const caseName = h1s.length > 1 ? h1s.eq(1).text().trim() : h1s.first().text().trim();
  const entries: ScrapedDocketEntry[] = [];

  // Find the Case History table
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let historyTable: cheerio.Cheerio<any> | null = null;

  $("h3").each((_, el) => {
    if ($(el).text().trim() === "Case History") {
      historyTable = $(el).next("table");
    }
  });

  if (!historyTable) {
    $("table").each((_, table) => {
      const hs = $(table).find("th");
      const texts = hs.map((__, h) => $(h).text().trim()).get();
      if (texts.includes("Date") && texts.includes("Event")) {
        historyTable = $(table);
      }
    });
  }

  if (!historyTable) return { entries, caseName };

  $(historyTable!)
    .find("tbody tr")
    .each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;

      const date = cells.eq(0).text().trim();
      const event = cells.eq(1).text().trim();
      const filer = cells.eq(2).text().trim();

      let hasPdf = false;
      let pdfPostbackTarget: string | null = null;

      const pdfCell = cells.eq(3);
      const pdfLink = pdfCell.find("a");
      if (pdfLink.length) {
        hasPdf = true;
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
    const pageUrl = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
    const pageRes = await gotScraping({ url: pageUrl, ...gotOptions });
    const pageHtml = pageRes.body;
    const $ = cheerio.load(pageHtml);

    const viewState = $("#__VIEWSTATE").val() as string;
    const viewStateGenerator = $("#__VIEWSTATEGENERATOR").val() as string;
    const eventValidation = $("#__EVENTVALIDATION").val() as string;

    if (!viewState || !eventValidation) return null;

    // Extract cookies from the GET response
    const rawCookies = pageRes.headers["set-cookie"] as string | string[] | undefined;
    const cookies = Array.isArray(rawCookies)
      ? rawCookies.map((c) => c.split(";")[0]).join("; ")
      : (rawCookies?.split(";")[0] ?? "");

    const formData = new URLSearchParams();
    formData.append("__VIEWSTATE", viewState);
    formData.append("__VIEWSTATEGENERATOR", viewStateGenerator || "");
    formData.append("__EVENTVALIDATION", eventValidation);
    formData.append("__EVENTTARGET", postbackTarget);
    formData.append("__EVENTARGUMENT", "");

    const pdfRes = await gotScraping({
      url: pageUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      body: formData.toString(),
      followRedirect: true,
      responseType: "buffer",
      ...gotOptions,
    });

    const contentType = pdfRes.headers["content-type"] || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      return null;
    }

    return Buffer.from(pdfRes.rawBody);
  } catch (error) {
    console.error("PDF download failed:", error);
    return null;
  }
}
