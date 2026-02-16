import * as cheerio from "cheerio";
import type { SearchResult, ScrapedDocketEntry } from "./types";

const BASE_URL = "https://pch.tncourts.gov";

// Chromium path for local dev vs serverless
const CHROMIUM_URL =
  "https://github.com/nichochar/chromium-bun/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

async function getBrowser() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chromium = require("@sparticuz/chromium-min");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const puppeteer = require("puppeteer-core");

  const executablePath = await chromium.executablePath(CHROMIUM_URL);

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });
}

async function fetchPageHtml(url: string): Promise<string> {
  const browser = await getBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

export async function lookupCase(input: string): Promise<SearchResult | null> {
  const idMatch = input.match(/id=(\d+)/);
  if (!idMatch) return null;

  const internalId = idMatch[1];
  const url = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
  const html = await fetchPageHtml(url);

  if (html.includes("Security Notice") || html.includes("Unusual Activity")) {
    console.log("[lookupCase] Blocked by security check");
    return null;
  }

  const $ = cheerio.load(html);
  const h1s = $("h1");
  const h2s = $("h2");
  const caseName = h1s.length > 1 ? h1s.eq(1).text().trim() : h1s.first().text().trim();
  const caseNumber = h2s.length > 1 ? h2s.eq(1).text().trim() : h2s.first().text().trim();

  if (!caseNumber) return null;

  return { case_number: caseNumber, case_name: caseName, internal_id: internalId, url };
}

export async function scrapeDocketEntries(
  internalId: string
): Promise<{ entries: ScrapedDocketEntry[]; caseName: string }> {
  const url = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
  const html = await fetchPageHtml(url);
  const $ = cheerio.load(html);

  const h1s = $("h1");
  const caseName = h1s.length > 1 ? h1s.eq(1).text().trim() : h1s.first().text().trim();
  const entries: ScrapedDocketEntry[] = [];

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
    const browser = await getBrowser();
    try {
      const page = await browser.newPage();
      const pageUrl = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      // Set up download interception
      const client = await page.createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: "/tmp",
      });

      // Trigger the PostBack to download the PDF
      await page.evaluate((target: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).__doPostBack(target, "");
      }, postbackTarget);

      // Wait for the response
      const response = await page.waitForNavigation({
        waitUntil: "networkidle0",
        timeout: 15000,
      });

      if (!response) return null;

      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
        return null;
      }

      const buffer = await response.buffer();
      return Buffer.from(buffer);
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("PDF download failed:", error);
    return null;
  }
}
