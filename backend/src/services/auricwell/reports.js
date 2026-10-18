import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import { list, audit, pool, open } from "./repository.js";
import {
  requireCapability,
  requirePatientBilling,
  ledgerBalance,
  fail,
} from "./policy.js";
import { patientAccess } from "./clinical.js";

export async function statement(ctx, patientId, receiptId) {
  requireCapability(ctx, "billing");
  requirePatientBilling(ctx, patientId);
  const patient = await patientAccess(ctx, patientId);
  const entries = (await list(ctx, "ledger", { patientId, limit: 10000 })).sort(
    (a, b) =>
      a.data.date.localeCompare(b.data.date) ||
      new Date(a.createdAt) - new Date(b.createdAt),
  );
  const receipt =
    receiptId &&
    entries.find(
      (r) => r.id === receiptId && ["payment", "refund"].includes(r.data.type),
    );
  if (receiptId && !receipt) throw fail(404, "Receipt unavailable.");
  const payerNames = new Map();
  for (const row of entries) if(row.data.payerAccountId && !payerNames.has(row.data.payerAccountId)) {
    const [[account]]=await pool.execute('SELECT profile FROM auricwell_accounts WHERE id=?',[row.data.payerAccountId]);
    payerNames.set(row.data.payerAccountId,account ? open(account.profile,`auricwell:account:${row.data.payerAccountId}`).name : 'Recorded payer');
  }
  const lines = [
    receipt ? "Payment receipt" : "Patient account statement",
    ctx.settings.practice.legalName || ctx.practiceName,
    ctx.settings.practice.address || "",
    `Patient: ${patient.data.name}`,
    `Prepared ${new Date().toISOString()}`,
    "",
    ...(receipt ? [receipt] : entries).map(
      (r) =>
        `${r.data.date} | ${r.data.type.replaceAll("_", " ")} | $${(r.data.amountCents / 100).toFixed(2)} | ${r.data.reason}${r.data.payerAccountId ? ` | Paid by: ${payerNames.get(r.data.payerAccountId)}` : ""}`,
    ),
    "",
    `Current patient balance: $${(ledgerBalance(entries) / 100).toFixed(2)}`,
    "Insurance reimbursements and AuricWell platform fees are maintained separately.",
  ];
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await fs.readFile(
      new URL("../../assets/fonts/Montserrat-Regular.ttf", import.meta.url),
    ),
    { subset: true },
  );
  let page, y;
  const next = () => {
    page = pdf.addPage([612, 792]);
    y = 735;
    page.drawText("AuricWell", {
      x: 48,
      y,
      font,
      size: 22,
      color: rgb(0.02, 0.16, 0.43),
    });
    y -= 40;
  };
  next();
  for (const paragraph of lines) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (font.widthOfTextAtSize(`${line} ${word}`, 10) > 510 && line) {
        if (y < 50) next();
        page.drawText(line, { x: 48, y, font, size: 10 });
        y -= 16;
        line = "";
      }
      line += `${line ? " " : ""}${word}`;
    }
    if (y < 50) next();
    page.drawText(line, { x: 48, y, font, size: 10 });
    y -= 18;
  }
  await audit(
    ctx,
    receipt ? "billing.receipt_downloaded" : "billing.statement_downloaded",
    patient.id,
    { receiptId: receiptId || null },
  );
  return Buffer.from(await pdf.save());
}
