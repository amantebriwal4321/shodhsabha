import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Brief } from "./types";

function pdfSafe(value: string): string {
  return value.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

export async function briefToPdf(brief: Brief): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const pageSize: [number, number] = [612, 792];
  let page = doc.addPage(pageSize);
  let y = 740;
  const margin = 56;
  const width = 500;

  const draw = (text: string, font: typeof serif, size: number, color = rgb(0.12, 0.06, 0.07)) => {
    const words = pdfSafe(text).split(/\s+/).filter(Boolean);
    let line = "";
    const flush = () => {
      if (!line) return;
      if (y < 64) {
        page = doc.addPage(pageSize);
        y = 740;
      }
      page.drawText(line, { x: margin, y, size, font, color });
      y -= size + 5;
      line = "";
    };
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width) flush();
      line = line ? `${line} ${word}` : word;
    }
    flush();
  };

  page.drawRectangle({ x: 0, y: 760, width: 612, height: 32, color: rgb(0.12, 0.05, 0.07) });
  page.drawText("ShodhSabha", {
    x: margin,
    y: 772,
    size: 12,
    font: serifBold,
    color: rgb(0.95, 0.82, 0.55),
  });
  y = 730;
  draw(brief.question, serifBold, 16);
  y -= 6;
  draw(`Confidence ${brief.confidence} / 100  ·  ${brief.mode}`, serif, 11, rgb(0.4, 0.22, 0.16));
  y -= 8;
  draw(brief.answer, serif, 12);
  y -= 8;
  draw("Open questions", serifBold, 13);
  for (const item of brief.openQuestions) draw(`- ${item}`, serif, 11);
  y -= 8;
  draw("Sources", serifBold, 13);
  brief.citations.forEach((citation, index) => {
    draw(`${index + 1}. [${citation.status}] ${citation.title}`, serif, 11);
    draw(citation.url, serif, 9, rgb(0.15, 0.25, 0.45));
  });
  y -= 10;
  draw("Quotes were checked against the fetched page text. The score is not a forecast.", serif, 9, rgb(0.35, 0.28, 0.24));

  return doc.save();
}
