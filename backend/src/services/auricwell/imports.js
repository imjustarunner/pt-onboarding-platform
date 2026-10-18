import crypto from "node:crypto";
import XLSX from "xlsx";
import {
  fail,
  hash,
  text,
  requirePermission,
  requirePhi,
  requireCapability,
} from "./policy.js";
import {
  pool,
  create,
  get,
  list,
  update,
  transaction,
  lockPractice,
  sourceRecords,
  findSource,
  decode,
  audit,
} from "./repository.js";
import { createAccount } from "./auth.js";
import { provisionStaffIdentity } from "./staffProvisioning.js";
import { validDate } from "../supervisedBillingPolicy.service.js";

export const IMPORT_FIELDS = {
  providers: [
    "sourceId",
    "name",
    "username",
    "email",
    "credential",
    "npi",
    "status",
  ],
  payers: ["sourceId", "name", "electronicPayerId", "address"],
  patients: ["sourceId", "name", "dob", "phone", "email", "address"],
  billing: [
    "sourceId",
    "patientSourceId",
    "name",
    "dob",
    "providerSourceId",
    "payerSourceId",
    "date",
    "serviceCode",
    "charge",
    "paid",
    "balance",
  ],
  appointments: [
    "sourceId",
    "patientSourceId",
    "providerSourceId",
    "start",
    "end",
    "serviceCode",
    "location",
  ],
  clinical_pdf: [],
};
export function normalizeImportRow(type, row, mapping) {
  const out = {};
  for (const field of IMPORT_FIELDS[type] || [])
    out[field] = String(row[mapping[field] || field] ?? "").trim();
  return out;
}
export function importIssues(type, row) {
  const issues = [];
  if (
    ["providers", "payers", "patients", "billing"].includes(type) &&
    !row.name
  )
    issues.push("Name is missing.");
  if (["patients", "billing"].includes(type) && !validDate(row.dob))
    issues.push("Birth date must be YYYY-MM-DD.");
  if (type === "billing" && !validDate(row.date))
    issues.push("Service date must be YYYY-MM-DD.");
  if (
    type === "providers" &&
    !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(row.username || "")
  )
    issues.push("Choose a valid unique username.");
  return issues;
}
function guard(ctx, type) {
  requirePermission(ctx, "migration");
  requireCapability(ctx, "imports");
  // Source exports can contain extra columns; file uploads always need PHI readiness.
  requirePhi(ctx);
}
export async function beginUpload(ctx, input) {
  if (!(input.type in IMPORT_FIELDS))
    throw fail(400, "Unsupported import type.");
  guard(ctx, input.type);
  if (
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    input.size > 100 * 1024 * 1024
  )
    throw fail(400, "Choose a file of at most 100 MB.");
  if (!/^[a-f0-9]{64}$/.test(input.sha256 || ""))
    throw fail(400, "File SHA-256 is required.");
  const filename = text(input.filename, "Filename", 255);
  if (
    input.type === "clinical_pdf"
      ? !/\.pdf$/i.test(filename)
      : !/\.(csv|xlsx)$/i.test(filename)
  )
    throw fail(
      400,
      "Use a PDF for clinical documents or CSV/XLSX for spreadsheets.",
    );
  const uploads = await list(ctx, "import", { limit: 10000 });
  const existing = uploads.find(
    (u) => u.data.sha256 === input.sha256 && u.data.type === input.type,
  );
  if (existing) return existing;
  return create(
    ctx,
    "import",
    {
      type: input.type,
      filename,
      size: input.size,
      sha256: input.sha256,
      status: "uploading",
      chunkSize: 1024 * 1024,
      chunkCount: Math.ceil(input.size / (1024 * 1024)),
      uploadedBy: ctx.accountId,
      mapping: {},
      issues: [],
      applied: [],
      review: {},
    },
    { sourceKey: `${input.type}:${input.sha256}` },
  );
}
export async function putChunk(ctx, id, index, base64) {
  const batch = await get(ctx, "import", id);
  guard(ctx, batch.data.type);
  if (batch.data.status !== "uploading")
    throw fail(409, "Upload is already complete.");
  if (!Number.isInteger(index) || index < 0 || index >= batch.data.chunkCount)
    throw fail(400, "Invalid chunk number.");
  if (
    typeof base64 !== "string" ||
    base64.length > 1400000 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)
  )
    throw fail(400, "Invalid upload chunk.");
  const bytes = Buffer.from(base64, "base64");
  const expected = Math.min(
    batch.data.chunkSize,
    batch.data.size - index * batch.data.chunkSize,
  );
  if (bytes.length !== expected)
    throw fail(400, "Chunk size does not match the upload.");
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const chunks = await sourceRecords(ctx, "import_chunk", id, db);
    const existing = chunks.find(
      (c) => c.data.batchId === id && c.data.index === index,
    );
    const digest = hash(bytes.toString("base64"));
    if (existing) {
      if (existing.data.hash !== digest)
        throw fail(409, "This chunk already contains different bytes.");
      return { index, received: true };
    }
    await create(
      ctx,
      "import_chunk",
      { batchId: id, index, base64, hash: digest },
      { sourceKey: `${id}:${index}` },
      db,
    );
    return { index, received: true };
  });
}
export async function sourceBuffer(ctx, batch, db = pool) {
  const chunks = (await sourceRecords(ctx, "import_chunk", batch.id, db)).sort(
    (a, b) => a.data.index - b.data.index,
  );
  if (chunks.length !== batch.data.chunkCount)
    throw fail(409, "Upload is incomplete.");
  const bytes = Buffer.concat(
    chunks.map((c) => Buffer.from(c.data.base64, "base64")),
  );
  if (
    bytes.length !== batch.data.size ||
    crypto.createHash("sha256").update(bytes).digest("hex") !==
      batch.data.sha256
  )
    throw fail(409, "File integrity check failed.");
  return bytes;
}
export async function finishUpload(ctx, id) {
  const batch = await get(ctx, "import", id);
  guard(ctx, batch.data.type);
  if (batch.data.status !== "uploading") return batch;
  await sourceBuffer(ctx, batch);
  return update(ctx, batch, { ...batch.data, status: "queued" });
}
export async function parseBatch(ctx, id) {
  const requested = await get(ctx, "import", id);
  guard(ctx, requested.data.type);
  const claimed = await transaction(async (db) => {
    const batch = await get(ctx, "import", id, db, true);
    const stale =
      batch.data.status === "processing" &&
      Date.now() - Date.parse(batch.data.processingAt) > 30 * 60000;
    if (!["queued", "failed"].includes(batch.data.status) && !stale)
      return null;
    return update(
      ctx,
      batch,
      {
        ...batch.data,
        status: "processing",
        processingAt: new Date().toISOString(),
        processingLease: crypto.randomUUID(),
        error: null,
      },
      db,
    );
  });
  if (!claimed) return;
  try {
    const bytes = await sourceBuffer(ctx, claimed);
    let parsed;
    if (claimed.data.type === "clinical_pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(bytes) });
      try {
        const result = await parser.getText();
        // One reviewed segment per page by default: boundaries are never guessed as authoritative.
        parsed = {
          pages: result.pages.map((p, i) => ({
            page: p.num || i + 1,
            text: p.text || "",
            needsOcr: !(p.text || "").trim(),
          })),
          issues: [
            "Review patient attribution and note page ranges before applying.",
          ],
        };
        let vision;
        if (ctx.settings.integrations?.ocr?.verifiedAt) {
          const { ImageAnnotatorClient } = await import("@google-cloud/vision");
          vision = new ImageAnnotatorClient();
        }
        try {
          for (const page of parsed.pages) {
            const saved = await findSource(
              ctx,
              "import_preview",
              `${id}:${page.page}`,
            );
            if (saved) {
              if (saved.data.extraction === "ocr") {
                page.text = saved.data.text;
                page.needsOcr = !page.text.trim();
                page.extraction = "ocr";
              }
              continue;
            }
            const images = await parser.getScreenshot({
              partial: [page.page],
              desiredWidth: 1600,
              imageDataUrl: false,
              imageBuffer: true,
            });
            if (page.needsOcr && vision) {
              try {
                const [result] = await vision.documentTextDetection({
                  image: { content: images.pages[0].data },
                });
                page.text = result.fullTextAnnotation?.text || "";
                page.needsOcr = !page.text.trim();
                page.extraction = "ocr";
              } catch {
                page.ocrFailed = true;
                parsed.issues.push(
                  `OCR failed on page ${page.page}; review the retained source.`,
                );
              }
            }
            await transaction(async (db) => {
              const current = await get(ctx, "import", id, db, true);
              if (current.data.processingLease !== claimed.data.processingLease)
                throw fail(409, "Processing lease changed.");
              await create(
                ctx,
                "import_preview",
                {
                  batchId: id,
                  page: page.page,
                  base64: Buffer.from(images.pages[0].data).toString("base64"),
                  text: page.text,
                  extraction: page.extraction || "embedded",
                  ocrFailed: page.ocrFailed || false,
                },
                { sourceKey: `${id}:${page.page}` },
                db,
              );
              await update(
                ctx,
                current,
                {
                  ...current.data,
                  processingAt: new Date().toISOString(),
                  pagesProcessed: page.page,
                },
                db,
              );
            });
          }
        } finally {
          if (vision) await vision.close();
        }
        if (parsed.pages.some((p) => p.needsOcr))
          parsed.issues.push(
            "Scanned pages require OCR or manual transcription; original PDF is retained.",
          );
      } finally {
        await parser.destroy();
      }
    } else {
      const book = XLSX.read(bytes, {
        type: "buffer",
        raw: true,
        cellDates: false,
        sheetRows: 50001,
      });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      if (rows.length > 50000)
        throw fail(400, "Split spreadsheets larger than 50,000 rows.");
      if (!rows.length) throw fail(400, "The spreadsheet has no data rows.");
      parsed = { headers: Object.keys(rows[0]), rows, issues: [] };
    }
    await transaction(async (db) => {
      const current = await get(ctx, "import", id, db, true);
      if (current.data.processingLease !== claimed.data.processingLease) return;
      const items = parsed.rows || parsed.pages || [];
      for (let index = 0; index < items.length; index += 100) {
        await create(
          ctx,
          "import_parsed",
          {
            batchId: id,
            index,
            headers: parsed.headers,
            issues: parsed.issues,
            ...(parsed.rows
              ? { rows: items.slice(index, index + 100) }
              : { pages: items.slice(index, index + 100) }),
          },
          { sourceKey: `${id}:${index}` },
          db,
        );
      }
      await update(
        ctx,
        current,
        {
          ...current.data,
          status: "review",
          pageCount: parsed.pages?.length || 0,
          issues: parsed.issues,
        },
        db,
      );
    });
  } catch (e) {
    const current = await get(ctx, "import", id);
    if (current.data.processingLease !== claimed.data.processingLease) return;
    await update(ctx, current, {
      ...current.data,
      status: "failed",
      error: e.status
        ? e.message
        : "Parsing failed. The original file is preserved; verify its format and retry.",
    });
  }
}
export async function previewImport(ctx, id) {
  const batch = await get(ctx, "import", id);
  guard(ctx, batch.data.type);
  const parts = (await sourceRecords(ctx, "import_parsed", id)).sort(
    (a, b) => a.data.index - b.data.index,
  );
  const data = parts.length
    ? {
        headers: parts[0].data.headers,
        issues: parts[0].data.issues,
        ...(parts[0].data.rows
          ? { rows: parts.flatMap((p) => p.data.rows) }
          : { pages: parts.flatMap((p) => p.data.pages) }),
      }
    : null;
  const chunks = (await sourceRecords(ctx, "import_chunk", id)).map(
    (c) => c.data.index,
  );
  return {
    batch,
    fields: IMPORT_FIELDS[batch.data.type],
    receivedChunks: chunks,
    parsed: data,
  };
}
async function patientFromRow(ctx, row, db) {
  const patients = await list(ctx, "patient", { limit: 10000 }, db);
  const sourceId = row.patientSourceId || row.sourceId;
  if (sourceId) {
    const exact = patients.filter((p) => p.data.sourceId === sourceId);
    if (exact.length === 1) return exact[0];
  }
  const candidates = patients.filter(
    (p) =>
      p.data.name.toLowerCase().trim() === row.name.toLowerCase().trim() &&
      p.data.dob === row.dob,
  );
  if (candidates.length)
    throw fail(
      409,
      "Possible existing patient: select an explicit match in the review.",
    );
  return create(
    ctx,
    "patient",
    {
      name: row.name,
      dob: row.dob,
      phone: row.phone || "",
      email: row.email || "",
      address: row.address || "",
      status: "active",
      careTeam: [],
      sourceId: sourceId || null,
      source: "therapynotes",
    },
    {
      sourceKey: sourceId
        ? `therapynotes:${sourceId}`
        : `demographics:${hash(`${row.name.toLowerCase()}|${row.dob}`)}`,
    },
    db,
  );
}
export async function applyImport(ctx, id, input) {
  const initial = await get(ctx, "import", id);
  guard(ctx, initial.data.type);
  if (input.reviewed !== true)
    throw fail(400, "Review the import before applying.");
  const preview = await previewImport(ctx, id);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const batch = await get(ctx, "import", id, db, true);
    if (!["review", "partially_applied"].includes(batch.data.status))
      throw fail(409, "The import is not ready to apply.");
    const applied = [...batch.data.applied];
    const issues = [];
    const decisions = input.decisions || [];
    if (
      !Array.isArray(decisions) ||
      !decisions.length ||
      decisions.length > 200
    )
      throw fail(400, "Review 1–200 entries per batch.");
    for (const decision of decisions) {
      const key = String(decision.key);
      if (applied.some((a) => a.key === key)) continue;
      await db.query("SAVEPOINT aw_import_row");
      try {
        const references = [];
        if (batch.data.type === "clinical_pdf") {
          requirePhi(ctx);
          const patient = await get(ctx, "patient", decision.patientId, db);
          const start = Number(decision.pageStart),
            end = Number(decision.pageEnd);
          const pages = preview.parsed?.pages || [];
          if (
            !Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < 1 ||
            end < start ||
            end > pages.length
          )
            throw fail(400, "Choose valid PDF page ranges.");
          if (applied.some((a) => a.pageStart <= end && a.pageEnd >= start))
            throw fail(
              409,
              "These pages are already attached to another entry; review boundaries.",
            );
          const content = decision.attachmentOnly
            ? "Historical attachment — extraction unresolved. Review the linked source pages."
            : text(decision.content, "Reviewed note text", 200000);
          if (!decision.attachmentOnly && !validDate(decision.serviceDate))
            throw fail(400, "Review the service date.");
          const note = await create(
            ctx,
            "note",
            {
              source: "therapynotes",
              status: decision.attachmentOnly
                ? "historical_attachment"
                : "historical",
              title: text(decision.title, "Note title", 200),
              content,
              serviceDate: decision.serviceDate || null,
              unresolvedExtraction: decision.attachmentOnly === true,
              historicalAuthor: decision.attachmentOnly
                ? String(decision.author || "Not identified").slice(0, 200)
                : text(decision.author, "Historical author", 200),
              signatureEvidence: String(decision.signatureEvidence || "").slice(
                0,
                5000,
              ),
              sourceFileId: id,
              pageStart: start,
              pageEnd: end,
              billable: false,
              sharedWithPatient: false,
              reviewedBy: ctx.accountId,
            },
            {
              patientId: patient.id,
              sourceKey: `pdf:${batch.data.sha256}:${start}:${end}`,
            },
            db,
          );
          references.push({
            kind: "note",
            id: note.id,
            revision: note.revision,
          });
          applied.push({ key, references, pageStart: start, pageEnd: end });
        } else {
          const index = Number(key);
          const raw = preview.parsed?.rows?.[index];
          if (!raw) throw fail(400, "Unknown spreadsheet row.");
          const row = normalizeImportRow(
            batch.data.type,
            raw,
            input.mapping || {},
          );
          Object.assign(row, decision.corrections || {});
          const errors = importIssues(batch.data.type, row);
          if (errors.length) throw fail(400, errors.join(" "));
          const sourceKey = `therapynotes:${row.sourceId || hash(JSON.stringify(row))}`;
          let record,
            existingPatient = false;
          if (batch.data.type === "providers") {
            const account = await createAccount(
              { username: row.username, name: row.name, email: row.email },
              db,
            );
            await db.execute(
              "INSERT INTO auricwell_memberships (practice_id,account_id,permissions,patient_ids,actor_type,status) VALUES (?,?,?,?,?,?)",
              [
                ctx.practiceId,
                account.id,
                JSON.stringify(["clinical"]),
                "[]",
                "staff",
                "pending",
              ],
            );
            await provisionStaffIdentity(ctx, account.id, db);
            record = await create(
              ctx,
              "provider",
              {
                ...row,
                accountId: account.id,
                status: "inactive",
                credentialsReviewed: false,
                jurisdiction: "CO",
                services: [],
                locations: [],
                source: "therapynotes",
              },
              { sourceKey },
              db,
            );
            references.push({ kind: "account", id: account.id });
          } else if (batch.data.type === "payers") {
            record = await create(
              ctx,
              "payer",
              {
                ...row,
                electronicMatchReviewed: false,
                enrollmentVerified: false,
              },
              { sourceKey },
              db,
            );
          } else if (["patients", "billing"].includes(batch.data.type)) {
            const before = new Set(
              (await list(ctx, "patient", { limit: 10000 }, db)).map(
                (p) => p.id,
              ),
            );
            const patient = decision.patientId
              ? await get(ctx, "patient", decision.patientId, db)
              : await patientFromRow(ctx, row, db);
            if (batch.data.type === "billing" && !before.has(patient.id))
              references.push({
                kind: "patient",
                id: patient.id,
                revision: patient.revision,
              });
            record = patient;
            existingPatient = before.has(patient.id);
            if (batch.data.type === "billing") {
              record = await create(
                ctx,
                "historical_billing",
                {
                  ...row,
                  source: "therapynotes",
                  affectsLedger: false,
                  submissionEligible: false,
                  importId: id,
                  sourceRow: index,
                },
                { patientId: patient.id, sourceKey },
                db,
              );
            }
          } else if (batch.data.type === "appointments") {
            const patients = await list(ctx, "patient", { limit: 10000 }, db),
              providers = await list(ctx, "provider", {}, db);
            const patient = patients.find(
                (p) => p.data.sourceId === row.patientSourceId,
              ),
              provider = providers.find(
                (p) => p.data.sourceId === row.providerSourceId,
              );
            if (!patient || !provider)
              throw fail(
                409,
                "Resolve the imported patient and provider first.",
              );
            if (
              !Number.isFinite(Date.parse(row.start)) ||
              !Number.isFinite(Date.parse(row.end)) ||
              new Date(row.end) <= new Date(row.start)
            )
              throw fail(
                400,
                "Review appointment timestamps including timezone.",
              );
            record = await create(
              ctx,
              "appointment",
              {
                ...row,
                patientId: patient.id,
                providerId: provider.id,
                providerAccountId: provider.data.accountId,
                status: "scheduled",
                source: "therapynotes",
                needsReview: true,
              },
              { patientId: patient.id, sourceKey },
              db,
            );
          }
          references.push({
            kind: record.kind,
            id: record.id,
            revision: record.revision,
            existing: batch.data.type === "patients" && existingPatient,
          });
          applied.push({ key, references });
        }
        await db.query("RELEASE SAVEPOINT aw_import_row");
      } catch (e) {
        await db.query("ROLLBACK TO SAVEPOINT aw_import_row");
        issues.push({
          key,
          message:
            e.code === "ER_DUP_ENTRY"
              ? "Already imported or username already exists. Resolve the matching record."
              : e.status
                ? e.message
                : "This row could not be applied.",
        });
      }
    }
    return update(
      ctx,
      batch,
      {
        ...batch.data,
        status: "partially_applied",
        mapping: input.mapping || batch.data.mapping,
        applied,
        issues,
        reviewedBy: ctx.accountId,
        reviewedAt: new Date().toISOString(),
      },
      db,
    );
  });
}
export async function patientPdf(ctx, note) {
  const batch = await get(ctx, "import", note.data.sourceFileId);
  const source = await sourceBuffer(ctx, batch);
  const { PDFDocument } = await import("pdf-lib");
  const original = await PDFDocument.load(source),
    subset = await PDFDocument.create();
  const indices = Array.from(
    { length: note.data.pageEnd - note.data.pageStart + 1 },
    (_, i) => note.data.pageStart - 1 + i,
  );
  for (const page of await subset.copyPages(original, indices))
    subset.addPage(page);
  return Buffer.from(await subset.save());
}

export async function retryImport(ctx, id) {
  const batch = await get(ctx, "import", id);
  guard(ctx, batch.data.type);
  if (batch.data.status !== "failed")
    throw fail(409, "Only failed processing can be retried.");
  return update(ctx, batch, { ...batch.data, status: "queued", error: null });
}
export async function reconcileImport(ctx, id, input) {
  const preview = await previewImport(ctx, id);
  if (
    !["review", "partially_applied", "reconciled"].includes(
      preview.batch.data.status,
    )
  )
    throw fail(409, "Finish processing before reconciliation.");
  const total =
    preview.parsed?.rows?.length || preview.parsed?.pages?.length || 0;
  const applied = preview.batch.data.applied;
  const covered = preview.parsed?.pages
    ? applied.reduce((n, a) => n + a.pageEnd - a.pageStart + 1, 0)
    : applied.length;
  if (
    input.reviewed !== true ||
    !Number.isInteger(input.excludedCount) ||
    input.excludedCount < 0 ||
    covered + input.excludedCount !== total
  )
    throw fail(
      409,
      "Applied entries plus explicitly excluded rows/pages must equal the original count.",
    );
  const reconciliation = {
    sourceCount: total,
    appliedCount: covered,
    excludedCount: input.excludedCount,
    explanation: text(
      input.explanation,
      "Reconciliation and exclusion explanation",
      10000,
    ),
    reviewedBy: ctx.accountId,
    reviewedAt: new Date().toISOString(),
  };
  return update(ctx, preview.batch, {
    ...preview.batch.data,
    status: "reconciled",
    reconciliation,
  });
}
export async function rollbackImport(ctx, id, input) {
  const initial = await get(ctx, "import", id);
  guard(ctx, initial.data.type);
  if (input.reviewed !== true)
    throw fail(400, "Review rollback before proceeding.");
  const reason = text(input.reason, "Rollback reason", 2000);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const batch = await get(ctx, "import", id, db, true);
    if (batch.data.status === "rolled_back") return batch;
    if (!["partially_applied", "reconciled"].includes(batch.data.status))
      throw fail(409, "Only applied imports can be withdrawn.");
    const withdrawn = [],
      preserved = [];
    for (const applied of [...batch.data.applied].reverse())
      for (const ref of [...applied.references].reverse()) {
        if (ref.existing) {
          preserved.push({ ...ref, reason: "Previously existing record" });
          continue;
        }
        if (ref.kind === "account") {
          // Never remove credentials or activate/deactivate an account used after review.
          const [[a]] = await db.execute(
            "SELECT status FROM auricwell_accounts WHERE id=?",
            [ref.id],
          );
          if (a?.status === "pending")
            await db.execute(
              "UPDATE auricwell_memberships SET status='inactive' WHERE practice_id=? AND account_id=? AND status='pending'",
              [ctx.practiceId, ref.id],
            );
          else preserved.push({ ...ref, reason: "Account has been activated" });
          continue;
        }
        let current;
        try {
          current = await get(ctx, ref.kind, ref.id, db, true);
        } catch (e) {
          if (e.status === 404) continue;
          throw e;
        }
        if (current.revision !== ref.revision) {
          preserved.push({ ...ref, reason: "Record edited after import" });
          continue;
        }
        // Other shared workflows may reference this client. Import rollback is
        // never authority to terminate/archive the canonical chart.
        if (current.kind === "patient" && current.canonicalClientId) {
          preserved.push({
            ...ref,
            reason:
              "Shared client chart is retained; review it in client management",
          });
          continue;
        }
        const [rows] = await db.execute(
          "SELECT * FROM auricwell_records WHERE practice_id=? AND id<>? AND kind NOT IN ('import','import_chunk','import_parsed')",
          [ctx.practiceId, ref.id],
        );
        const referenced = rows
          .map(decode)
          .some(
            (r) =>
              !r.data.rolledBackAt &&
              (r.patientId === ref.id ||
                JSON.stringify(r.data).includes(ref.id)),
          );
        if (referenced) {
          preserved.push({
            ...ref,
            reason: "Subsequent records reference this record",
          });
          continue;
        }
        await update(
          ctx,
          current,
          {
            ...current.data,
            rolledBackAt: new Date().toISOString(),
            rollbackImportId: id,
          },
          db,
        );
        withdrawn.push(ref);
      }
    await audit(
      ctx,
      "import.rollback_reviewed",
      id,
      { reason, withdrawn, preserved },
      db,
    );
    return update(
      ctx,
      batch,
      {
        ...batch.data,
        status: "rolled_back",
        rollback: {
          reason,
          withdrawn,
          preserved,
          at: new Date().toISOString(),
          by: ctx.accountId,
        },
      },
      db,
    );
  });
}
