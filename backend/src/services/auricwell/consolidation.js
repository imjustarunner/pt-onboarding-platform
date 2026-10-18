import Agency from "../../models/Agency.model.js";
import {
  createClientChart,
  readClientChart,
  validateClientChartInput,
} from "../clientChart.service.js";
import {
  open,
  seal,
  decode,
  transaction,
  lockPractice,
  create,
  audit,
  findSource,
} from "./repository.js";
import { patientMetadata } from "./sharedPatients.js";
import { fail, hash, text, requirePermission, requirePhi } from "./policy.js";

function authorize(ctx) {
  if (!ctx.profile?.operator)
    throw fail(403, "Shared-record consolidation requires an operator.");
  requirePermission(ctx, "migration");
  requirePhi(ctx);
}
async function preview(ctx, input, db) {
  const [[practice]] = await db.execute(
    "SELECT * FROM auricwell_practices WHERE id=?",
    [ctx.practiceId],
  );
  if (!practice) throw fail(404, "Practice unavailable.");
  const settings = open(practice.settings, `auricwell:practice:${practice.id}`);
  requirePhi({ ...ctx, settings });
  const agencyId =
    practice.agency_id || (input.agencyId ? Number(input.agencyId) : null);
  if (
    practice.agency_id &&
    input.agencyId &&
    Number(input.agencyId) !== Number(practice.agency_id)
  )
    throw fail(409, "The practice already has a shared organization.");
  let agency = null;
  if (agencyId) {
    [[agency]] = await db.execute(
      "SELECT id,name,slug,organization_type FROM agencies WHERE id=?",
      [agencyId],
    );
    if (!agency || agency.organization_type !== "clinical")
      throw fail(400, "Choose an explicitly reviewed clinical organization.");
    const [[used]] = await db.execute(
      "SELECT id FROM auricwell_practices WHERE agency_id=? AND id<>?",
      [agencyId, practice.id],
    );
    if (used)
      throw fail(
        409,
        "This organization is already connected to another AuricWell practice.",
      );
  }
  const slug = practice.slug;
  if (!agencyId) {
    const [[collision]] = await db.execute(
      "SELECT id FROM agencies WHERE slug=?",
      [slug],
    );
    if (collision)
      throw fail(
        409,
        "An organization already uses this address. Review its ID explicitly; it will not be matched automatically.",
      );
  }
  const [rows] = await db.execute(
    "SELECT * FROM auricwell_records WHERE practice_id=? AND kind='patient' AND canonical_client_id IS NULL ORDER BY id",
    [ctx.practiceId],
  );
  const pending = rows.map(decode).filter((r) => !r.data.rolledBackAt);
  if (
    input.mappings !== undefined &&
    (!Array.isArray(input.mappings) || input.mappings.length > 200)
  )
    throw fail(400, "Review at most 200 charts at a time.");
  const mappings =
    input.mappings || pending.slice(0, 200).map((p) => ({ patientId: p.id }));
  if (new Set(mappings.map((m) => m.patientId)).size !== mappings.length)
    throw fail(400, "Each chart must appear only once.");
  const charts = [],
    issues = [];
  const linkedIds = new Set();
  for (const mapping of mappings) {
    const source = pending.find((r) => r.id === mapping.patientId);
    if (!source)
      throw fail(
        409,
        "A selected chart changed or was already connected. Refresh the review.",
      );
    const item = {
      patientId: source.id,
      revision: source.revision,
      sourceHash: hash(JSON.stringify(source.data)),
      source: source.data,
      clientId: mapping.clientId ? Number(mapping.clientId) : null,
      distinctPerson: mapping.distinctPerson === true,
    };
    if (item.clientId) {
      if (!agencyId)
        throw fail(
          400,
          "Choose the owning organization before linking an existing client.",
        );
      const target = await readClientChart(agencyId, item.clientId, db, {
        lock: true,
      });
      const [[bound]] = await db.execute(
        "SELECT id FROM auricwell_records WHERE practice_id=? AND canonical_client_id=?",
        [ctx.practiceId, item.clientId],
      );
      if (bound || linkedIds.has(item.clientId))
        issues.push({
          patientId: source.id,
          message:
            "This shared client already has a chart link. Review duplicate charts separately.",
        });
      linkedIds.add(item.clientId);
      Object.assign(item, {
        target: target.data,
        targetFingerprint: target.fingerprint,
      });
    } else {
      try {
        validateClientChartInput(source.data);
      } catch (e) {
        if (e.status !== 400) throw e;
        issues.push({ patientId: source.id, message: e.message });
      }
      if (agencyId) {
        const [matches] = await db.execute(
          "SELECT id,full_name FROM clients WHERE agency_id=? AND LOWER(TRIM(full_name))=LOWER(TRIM(?)) ORDER BY id",
          [agencyId, source.data.name],
        );
        item.candidates = matches;
        if (matches.length && !item.distinctPerson)
          issues.push({
            patientId: source.id,
            message:
              "Review matching-name clients. Select an explicit link or confirm this is a distinct person.",
          });
      }
    }
    charts.push(item);
  }
  const result = {
    agency: agency || { id: null, name: practice.name, slug },
    createOrganization: !agencyId,
    pendingCount: pending.length,
    charts,
    issues,
  };
  return {
    ...result,
    previewHash: hash(
      JSON.stringify({ result, practiceRevision: practice.revision, settings }),
    ),
  };
}
export async function previewConsolidation(ctx, input = {}) {
  authorize(ctx);
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    return preview(ctx, input, db);
  });
}
export async function applyConsolidation(ctx, input) {
  authorize(ctx);
  if (input.reviewed !== true || !input.previewHash)
    throw fail(
      400,
      "Review the exact organization and chart connections before applying.",
    );
  const key = text(input.idempotencyKey, "Request identifier", 100);
  const commandHash = hash(
    JSON.stringify({
      agencyId: input.agencyId || null,
      mappings: input.mappings || null,
      previewHash: input.previewHash,
    }),
  );
  return transaction(async (db) => {
    await lockPractice(ctx, db);
    const previous = await findSource(ctx, "consolidation_command", key, db);
    if (previous) {
      if (previous.data.commandHash !== commandHash)
        throw fail(409, "This request identifier has already been used.");
      return previous.data.result;
    }
    const review = await preview(ctx, input, db);
    if (review.issues.length)
      throw fail(409, "Resolve the chart connection issues before applying.");
    if (review.previewHash !== input.previewHash)
      throw fail(
        409,
        "The organization or charts changed. Review a fresh preview.",
      );
    const agency = review.createOrganization
      ? await Agency.createClinicalPractice(review.agency, { executor: db })
      : review.agency;
    await db.execute(
      "UPDATE auricwell_practices SET agency_id=?,revision=revision+1 WHERE id=?",
      [agency.id, ctx.practiceId],
    );
    const connected = [];
    for (const item of review.charts) {
      const clientId =
        item.clientId ||
        (await createClientChart(agency.id, item.source, db)).row.id;
      // Retain the exact prototype snapshot as historical migration evidence;
      // the active product record contains access/provenance metadata only.
      await create(
        ctx,
        "consolidation_archive",
        {
          patientId: item.patientId,
          previousRevision: item.revision,
          sourceHash: item.sourceHash,
          original: item.source,
          canonicalClientId: clientId,
        },
        { patientId: item.patientId, sourceKey: item.patientId },
        db,
      );
      const [changed] = await db.execute(
        "UPDATE auricwell_records SET canonical_client_id=?,payload=?,revision=revision+1,updated_at=UTC_TIMESTAMP(3) WHERE practice_id=? AND kind='patient' AND id=? AND revision=? AND canonical_client_id IS NULL",
        [
          clientId,
          seal(
            patientMetadata(item.source),
            `auricwell:${ctx.practiceId}:patient:${item.patientId}`,
          ),
          ctx.practiceId,
          item.patientId,
          item.revision,
        ],
      );
      if (!changed.affectedRows)
        throw fail(409, "A chart changed. Review the connections again.");
      await audit(
        ctx,
        "patient.shared_connection_reviewed",
        item.patientId,
        {
          agencyId: agency.id,
          clientId,
          retainedExistingDemographics: !!item.clientId,
        },
        db,
      );
      connected.push({ patientId: item.patientId, clientId });
    }
    const result = {
      agencyId: agency.id,
      connected,
      remaining: review.pendingCount - review.charts.length,
    };
    await create(
      ctx,
      "consolidation_command",
      { commandHash, result },
      { sourceKey: key },
      db,
    );
    return result;
  });
}
