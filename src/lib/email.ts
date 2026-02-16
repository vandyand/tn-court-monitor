import { Resend } from "resend";
import type { ScrapedDocketEntry } from "./types";

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export async function sendAlertEmail(
  to: string,
  caseNumber: string,
  caseName: string,
  newEntries: ScrapedDocketEntry[],
  attachments: EmailAttachment[] = []
) {
  const entriesHtml = newEntries
    .map(
      (e) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${e.date}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${e.event}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${e.filer || "—"}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${e.has_pdf ? "Yes (attached)" : "No"}</td>
    </tr>`
    )
    .join("");

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2 style="color: #1a1a2e;">New Court Activity</h2>
      <p><strong>Case:</strong> ${caseNumber}</p>
      <p><strong>Style:</strong> ${caseName}</p>
      <p>${newEntries.length} new docket entr${newEntries.length === 1 ? "y" : "ies"}:</p>
      <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Date</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Event</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Filer</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">PDF</th>
          </tr>
        </thead>
        <tbody>
          ${entriesHtml}
        </tbody>
      </table>
      <p style="color: #666; font-size: 13px;">
        View case: <a href="https://pch.tncourts.gov/">pch.tncourts.gov</a>
      </p>
    </div>
  `;

  const resendAttachments = attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
  }));

  const result = await resend.emails.send({
    from: "TN Court Monitor <alerts@pragmagen.xyz>",
    to: [to],
    subject: `[TN Court Alert] New activity in ${caseNumber}`,
    html,
    attachments: resendAttachments.length > 0 ? resendAttachments : undefined,
  });

  if (result.error) {
    console.error("[sendAlertEmail] Resend error:", result.error);
    throw new Error(`Email failed: ${result.error.message}`);
  }

  console.log("[sendAlertEmail] Sent successfully, id:", result.data?.id);
}
