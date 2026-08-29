import { workspaceNoteAidPath } from '../config/noteAidAccess.js';
import { resolveTreatmentPlanAidId } from '../config/noteAidWorkspace.js';

/**
 * Shared Note Aid launch contract for schedule / medical record / client chart.
 *
 * Progress notes should pass clientId + (clinicalSessionId OR officeEventId).
 * Treatment plan updater can pass clientId + launchIntent/noteAid only.
 */

function cleanStr(v) {
  const s = String(v == null ? '' : v).trim();
  return s || null;
}

function cleanId(v) {
  const n = Number(v || 0);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** YYYY-MM-DD from Date, ISO string, or already-dated string. */
export function toDateOfService(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Build a normalized Note Aid query object (string values only).
 * @param {object} ctx
 */
export function buildNoteAidQuery(ctx = {}) {
  const clientId = cleanId(ctx.clientId);
  const officeEventId = cleanId(ctx.officeEventId);
  const clinicalSessionId = cleanId(ctx.clinicalSessionId);
  const noteId = cleanId(ctx.noteId);
  const draftId = cleanId(ctx.draftId);
  const dateOfService = toDateOfService(ctx.dateOfService);
  const serviceCode = cleanStr(ctx.serviceCode)?.toUpperCase() || null;
  const noteType = cleanStr(ctx.noteType) || null;
  const templateVersion = cleanStr(ctx.templateVersion) || null;
  const launchIntent = cleanStr(ctx.launchIntent)?.toLowerCase() || null;
  const noteAid = cleanStr(ctx.noteAid) || null;

  const query = {};
  if (clientId) query.clientId = String(clientId);
  if (officeEventId) query.officeEventId = String(officeEventId);
  if (clinicalSessionId) query.clinicalSessionId = String(clinicalSessionId);
  if (noteId) query.noteId = String(noteId);
  if (draftId) query.draftId = String(draftId);
  if (dateOfService) query.dateOfService = dateOfService;
  if (serviceCode) query.serviceCode = serviceCode;
  if (noteType) query.noteType = noteType;
  if (templateVersion) query.templateVersion = templateVersion;
  if (launchIntent) query.launchIntent = launchIntent;
  if (noteAid) query.noteAid = noteAid;

  return query;
}

/**
 * Resolve Note Aid path with optional org slug.
 * @param {{ organizationSlug?: string }} opts
 */
export function noteAidPath(opts = {}) {
  return workspaceNoteAidPath(cleanStr(opts.organizationSlug) || '');
}

/**
 * Navigate to Note Aid with a normalized query.
 * Falls back to named route, then absolute path.
 */
export function navigateToNoteAid(router, ctx = {}, opts = {}) {
  const query = buildNoteAidQuery(ctx);
  const path = noteAidPath(opts);
  const push = () => {
    if (opts.organizationSlug) {
      return router.push({ path, query });
    }
    return router.push({ name: 'NoteAid', query }).catch(() =>
      router.push({ path: workspaceNoteAidPath(), query })
    );
  };
  return push();
}

/**
 * Prefill helpers for treatment-plan updater launches.
 * Pass noteAid / serviceCode / categoryId to pick the matching plan writer
 * (all share Goal/Objective/1–10 structure; directions differ by aid).
 */
export function treatmentPlanUpdaterQuery(clientId, extra = {}) {
  const {
    noteAidId,
    toolId,
    serviceCode,
    categoryId,
    noteAid: explicitNoteAid,
    ...rest
  } = extra || {};
  const noteAid =
    cleanStr(explicitNoteAid)
    || resolveTreatmentPlanAidId({
      noteAidId,
      toolId,
      serviceCode,
      categoryId
    });
  return buildNoteAidQuery({
    clientId,
    launchIntent: 'update_treatment_plan',
    ...rest,
    serviceCode,
    noteAid
  });
}

export default {
  buildNoteAidQuery,
  navigateToNoteAid,
  noteAidPath,
  toDateOfService,
  treatmentPlanUpdaterQuery
};
