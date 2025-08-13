import PDFDocument from "pdfkit";
import { Readable } from "stream";

export async function renderPdfBuffer({ property = {}, outputs = {} }) {
  const doc = new PDFDocument({ margin: 48 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((res) => doc.on("end", res));

  doc.fontSize(18).text("Listing Package", { align: "left" });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor("#666").text(new Date().toLocaleString());
  doc.moveDown();

  if (property?.address) {
    doc.fillColor("#000").fontSize(14).text(property.address);
    doc.moveDown(0.5);
  }

  doc.fontSize(12).fillColor("#000").text("MLS Description", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11).text(outputs.description_mls || "—", { align: "left" });
  doc.moveDown();

  doc.fontSize(12).text("Highlights", { underline: true });
  doc.moveDown(0.3);
  const bullets = outputs.bullets || [];
  if (bullets.length) {
    bullets.forEach(b => doc.circle(doc.x - 6, doc.y + 6, 2).fill().fillColor("#000").text("  " + b).moveDown(0.2));
  } else {
    doc.text("—");
  }
  doc.moveDown();

  doc.fontSize(12).text("Social Caption", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11).text(outputs.social_caption || "—");

  doc.end();
  await done;
  return Buffer.concat(chunks);
}
