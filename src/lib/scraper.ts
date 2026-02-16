import * as cheerio from "cheerio";
import * as https from "https";
import type { SearchResult, ScrapedDocketEntry } from "./types";

const BASE_URL = "https://pch.tncourts.gov";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Chrome-like cipher suites — required to bypass TLS fingerprint detection
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

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface FetchResult {
  body: string | Buffer;
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
}

function fetchWithTls(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    responseType?: "buffer";
  } = {}
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: { ...DEFAULT_HEADERS, ...options.headers },
        ciphers: CIPHERS,
        minVersion: "TLSv1.2",
      },
      (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : `${parsed.protocol}//${parsed.hostname}${res.headers.location}`;
          resolve(fetchWithTls(redirectUrl, options));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          resolve({
            body: options.responseType === "buffer" ? raw : raw.toString("utf-8"),
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

export async function lookupCase(input: string): Promise<SearchResult | null> {
  const idMatch = input.match(/id=(\d+)/);
  if (!idMatch) return null;

  const internalId = idMatch[1];
  const url = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
  const { body: html } = await fetchWithTls(url);

  if (typeof html !== "string" || html.includes("Security Notice") || html.includes("Unusual Activity")) {
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
  const { body: html } = await fetchWithTls(url);
  const $ = cheerio.load(html as string);

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
    const pageUrl = `${BASE_URL}/CaseDetails.aspx?id=${internalId}&Number=True`;
    const { body: pageHtml, headers: pageHeaders } = await fetchWithTls(pageUrl);
    const $ = cheerio.load(pageHtml as string);

    const viewState = $("#__VIEWSTATE").val() as string;
    const viewStateGenerator = $("#__VIEWSTATEGENERATOR").val() as string;
    const eventValidation = $("#__EVENTVALIDATION").val() as string;

    if (!viewState || !eventValidation) return null;

    const rawCookies = pageHeaders["set-cookie"];
    const cookies = Array.isArray(rawCookies)
      ? rawCookies.map((c) => c.split(";")[0]).join("; ")
      : rawCookies?.split(";")[0] ?? "";

    const formData = new URLSearchParams();
    formData.append("__VIEWSTATE", viewState);
    formData.append("__VIEWSTATEGENERATOR", viewStateGenerator || "");
    formData.append("__EVENTVALIDATION", eventValidation);
    formData.append("__EVENTTARGET", postbackTarget);
    formData.append("__EVENTARGUMENT", "");

    const { body, headers } = await fetchWithTls(pageUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      body: formData.toString(),
      responseType: "buffer",
    });

    const contentType = (headers["content-type"] as string) || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      return null;
    }

    return Buffer.isBuffer(body) ? body : Buffer.from(body);
  } catch (error) {
    console.error("PDF download failed:", error);
    return null;
  }
}
