import PDFDocument from "pdfkit";
import { quoteTotals } from "@starpos-crm/shared";
import type { BusinessProfile } from "./sales-rules";

export interface PdfQuotation {
  number: string;
  createdAt: Date;
  validUntil: Date | null;
  notes: string | null;
  discountPaise: number;
  items: { name: string; description: string | null; quantity: number; unitPricePaise: number; taxPercent: number }[];
  lead: { name: string; company: string | null; phone: string | null; email: string | null; address: string | null };
  tenant: { name: string };
  profile: BusinessProfile;
}

const BRAND = "#059669";
const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";

// The built-in PDF fonts have no ₹ glyph, so amounts print as "Rs." —
// the long-standing Indian convention on printed invoices.
function rs(paise: number): string {
  const value = (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `Rs. ${value}`;
}

function date(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Renders a quotation to an A4 PDF. Totals are recomputed from the lines, the same way the app computed them. */
export function renderQuotationPdf(q: PdfQuotation): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Quotation ${q.number}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const totals = quoteTotals(q.items, q.discountPaise);

    // Header band.
    doc.rect(0, 0, doc.page.width, 8).fill(BRAND);
    const seller = q.profile.legalName ?? q.tenant.name;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(18).text(seller, left, 40, { width: width * 0.6 });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    const sellerLines = [q.profile.address, q.profile.gstin && `GSTIN: ${q.profile.gstin}`, q.profile.phone, q.profile.email]
      .filter(Boolean)
      .join("\n");
    if (sellerLines) doc.text(sellerLines, left, doc.y + 4, { width: width * 0.6 });

    doc.font("Helvetica-Bold").fontSize(22).fillColor(BRAND).text("QUOTATION", left, 40, { width, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor(INK);
    doc.text(q.number, left, 68, { width, align: "right" });
    doc.fillColor(MUTED).text(`Date: ${date(q.createdAt)}`, left, 84, { width, align: "right" });
    if (q.validUntil) doc.text(`Valid until: ${date(q.validUntil)}`, left, 98, { width, align: "right" });

    // Bill to.
    let y = Math.max(doc.y, 130) + 16;
    doc.roundedRect(left, y, width, 72, 8).fill("#F4F7F6");
    doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("PREPARED FOR", left + 14, y + 12);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12).text(q.lead.company ?? q.lead.name, left + 14, y + 25);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    const buyer = [q.lead.company ? q.lead.name : null, q.lead.phone, q.lead.email, q.lead.address].filter(Boolean).join("  ·  ");
    doc.text(buyer, left + 14, y + 42, { width: width - 28, height: 24, ellipsis: true });
    y += 92;

    // Items table.
    const cols = [
      { key: "#", w: 24, align: "left" as const },
      { key: "Item", w: width - 24 - 44 - 80 - 50 - 90, align: "left" as const },
      { key: "Qty", w: 44, align: "right" as const },
      { key: "Rate", w: 80, align: "right" as const },
      { key: "GST", w: 50, align: "right" as const },
      { key: "Amount", w: 90, align: "right" as const },
    ];
    const drawRow = (values: string[], opts: { bold?: boolean; color?: string; sub?: string | null }) => {
      let x = left;
      const rowTop = y;
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(opts.color ?? INK);
      values.forEach((v, i) => {
        doc.text(v, x + 4, rowTop, { width: cols[i].w - 8, align: cols[i].align });
        x += cols[i].w;
      });
      let bottom = doc.y;
      if (opts.sub) {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(opts.sub, left + cols[0].w + 4, bottom + 1, {
          width: cols[1].w - 8,
        });
        bottom = doc.y;
      }
      y = bottom + 8;
    };

    doc.rect(left, y - 6, width, 22).fill(BRAND);
    drawRow(cols.map((c) => c.key), { bold: true, color: "#FFFFFF" });
    q.items.forEach((item, i) => {
      if (y > doc.page.height - 200) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      drawRow(
        [
          String(i + 1),
          item.name,
          String(item.quantity),
          rs(item.unitPricePaise),
          `${item.taxPercent}%`,
          rs(totals.lineAmountsPaise[i]),
        ],
        { sub: item.description },
      );
      doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor(LINE).lineWidth(0.5).stroke();
    });

    // Totals.
    y += 6;
    const labelX = left + width - 250;
    const line = (label: string, value: string, opts: { bold?: boolean; big?: boolean } = {}) => {
      doc.font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(opts.big ? 12 : 10).fillColor(opts.bold ? INK : MUTED);
      doc.text(label, labelX, y, { width: 150 });
      doc.fillColor(INK).text(value, labelX + 150, y, { width: 100, align: "right" });
      y += opts.big ? 22 : 17;
    };
    line("Subtotal", rs(totals.subtotalPaise));
    if (totals.discountPaise) line("Discount", `- ${rs(totals.discountPaise)}`);
    for (const t of totals.taxByRate) line(`GST (${t.taxPercent}%)`, rs(t.taxPaise));
    doc.moveTo(labelX, y).lineTo(right, y).strokeColor(LINE).stroke();
    y += 8;
    doc.roundedRect(labelX - 8, y - 6, 258, 30, 6).fill("#ECFDF5");
    line("Grand total", rs(totals.totalPaise), { bold: true, big: true });

    // Notes and terms.
    y += 18;
    const block = (title: string, body: string) => {
      if (y > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(title, left, y);
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(body, left, doc.y + 3, { width });
      y = doc.y + 14;
    };
    if (q.notes) block("Notes", q.notes);
    if (q.profile.terms) block("Terms and conditions", q.profile.terms);

    // The footer sits inside the bottom margin; without lifting it, pdfkit
    // would push the line onto a new, otherwise blank page.
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${seller} · ${q.number}`, left, doc.page.height - 36, { width, align: "center", lineBreak: false });
    doc.end();
  });
}
