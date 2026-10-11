import {
  ensureDocument,
  getPublishedHandbook,
  getDraftOrCreate,
  upsertDraftSection,
  deleteDraftSection,
  publishDraft,
  recordHandbookView,
  askHandbookQuestion,
  listHandbookQuestions,
  setFullHandbookUrl,
  listDigests,
  getDigest,
  getPublishedDigestForAgency,
  createDigest,
  updateDigest,
  upsertDigestEntry,
  deleteDigestEntry,
  publishDigest
} from '../services/workplaceHandbook.service.js';
import { assertAgencyAdmin, getRecipientByToken, getPush } from '../services/providerUpdate.service.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import { sourceForAgency, stageHandbookSource, linkHandbookUpdate } from '../services/workplaceHandbookWorkflow.service.js';
import { handbookChanges, parseHandbookMetadata, mapHandbookReviewUpdates } from '../services/workplaceHandbookContent.js';
import { canAccessHandbookOriginal, handbookResponseForReader } from '../services/workplaceHandbookAccess.js';
import { answerPublishedHandbook } from '../services/workplaceHandbookAnswer.service.js';
import { companyHandbookReadiness } from '../services/workplaceDocumentTemplates.js';

export async function assertHandbookReader(user, agencyId) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) <= 0) throw Object.assign(new Error('agencyId required'), { status: 400 });
  if (['super_admin', 'superadmin'].includes(user?.role)) return;
  const agencies = await User.getAgencies(user?.id);
  if (!(agencies || []).some(a => Number(a.id) === Number(agencyId))) throw Object.assign(new Error('Access denied'), { status: 403 });
}

export const answerQuestion = async (req, res, next) => {
  try {
    const agencyId = Number(req.body.agencyId);
    await assertHandbookReader(req.user, agencyId);
    const answer = await answerPublishedHandbook(agencyId, req.body, req.user.id, req.body.analyticsSurface || 'handbook');
    res.set('Cache-Control', 'private, no-store');
    res.json(answer);
  } catch (error) { next(error); }
};

export const answerQuestionByToken = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const answer = await answerPublishedHandbook(recipient.agency_id, req.body, recipient.user_id, 'handbook');
    res.set('Cache-Control', 'private, no-store');
    res.json(answer);
  } catch (error) { next(error); }
};

export const getWorkspace = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const [source, published] = await Promise.all([sourceForAgency(agencyId), getPublishedHandbook(agencyId)]);
    const [drafts] = await pool.execute('SELECT * FROM workplace_handbook_versions WHERE document_id = ? AND is_draft = 1 ORDER BY version_number DESC LIMIT 1', [published.document.id]);
    let draft = null;
    if (drafts[0]) {
      const [sections] = await pool.execute('SELECT * FROM workplace_handbook_sections WHERE version_id = ? ORDER BY sort_order, id', [drafts[0].id]);
      const metadata = parseHandbookMetadata(drafts[0].metadata_json);
      draft = { version: drafts[0], metadata, sections, requiredCompanySections: companyHandbookReadiness(metadata, sections) };
    }
    const [reviewEntries] = await pool.execute(`SELECT e.*, d.title AS digest_title, d.period_label, d.status, d.published_at
      FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id = e.digest_id
      WHERE d.agency_id = ? ORDER BY d.id DESC, e.sort_order, e.id`, [agencyId]);
    res.json(handbookResponseForReader({ source, published, draft, reviewUpdates: mapHandbookReviewUpdates(source, reviewEntries), changes: draft && published.version ? handbookChanges(published.sections, draft.sections) : [] }, req.user));
  } catch (error) { next(error); }
};

export const stageSource = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    res.json(handbookResponseForReader(await stageHandbookSource({ agencyId, sourceRevision: req.body.sourceRevision, expectedPublishedVersionId: req.body.expectedPublishedVersionId }), req.user));
  } catch (error) { next(error); }
};

export const linkEntry = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const digestId = Number(req.params.digestId);
    await linkHandbookUpdate({ agencyId, digestId, entryId: Number(req.params.entryId), sectionSlug: req.body.sectionSlug || null });
    res.json(handbookResponseForReader(await getDigest(digestId, agencyId), req.user));
  } catch (error) { next(error); }
};

export const getPublished = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    await assertHandbookReader(req.user, agencyId);
    const digest = await getPublishedDigestForAgency(agencyId, {
      adminUpdateId: req.query.adminUpdateId ? Number(req.query.adminUpdateId) : null,
      pushId: req.query.pushId ? Number(req.query.pushId) : null
    });
    const handbook = await getPublishedHandbook(agencyId);
    res.json(handbookResponseForReader({ ...handbook, ...digest, mode: 'handbook', handbook }, req.user));
  } catch (e) {
    next(e);
  }
};

export const getDraft = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    res.json(handbookResponseForReader(await getDraftOrCreate(agencyId, req.user.id), req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const saveSection = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const draft = await getDraftOrCreate(agencyId, req.user.id);
    if (req.body.expectedVersionId && Number(req.body.expectedVersionId) !== Number(draft.version.id)) throw Object.assign(new Error('The draft version changed. Reload before editing.'), { status: 409 });
    await upsertDraftSection({
      agencyId,
      versionId: draft.version.id,
      sectionId: req.body.sectionId || req.params.sectionId || null,
      title: req.body.title,
      bodyHtml: req.body.bodyHtml || req.body.body_html || '',
      sortOrder: Number(req.body.sortOrder ?? req.body.sort_order ?? 0),
      slug: req.body.slug || null,
      expectedSection: req.body.expectedSection
    });
    res.json(handbookResponseForReader(await getDraftOrCreate(agencyId, req.user.id), req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const removeSection = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId || req.query.agencyId);
    const draft = await getDraftOrCreate(agencyId, req.user.id);
    if (req.body.expectedVersionId && Number(req.body.expectedVersionId) !== Number(draft.version.id)) throw Object.assign(new Error('The draft version changed. Reload before editing.'), { status: 409 });
    await deleteDraftSection({
      agencyId,
      versionId: draft.version.id,
      sectionId: Number(req.params.sectionId),
      expectedSection: req.body.expectedSection
    });
    res.json(handbookResponseForReader(await getDraftOrCreate(agencyId, req.user.id), req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publish = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const draft = req.body.versionId ? null : await getDraftOrCreate(agencyId, req.user.id);
    const published = await publishDraft({
      agencyId,
      versionId: Number(req.body.versionId || draft.version.id),
      changelog: req.body.changelog,
      publishedByUserId: req.user.id,
      adminUpdateId: Number(req.body.adminUpdateId) || null,
      pushId: Number(req.body.pushId) || null
    });
    res.json(handbookResponseForReader(published, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listQuestions = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const questions = await listHandbookQuestions(agencyId, { status: req.query.status || null });
    res.json({ questions });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const trackView = async (req, res, next) => {
  try {
    const agencyId = Number(req.body.agencyId);
    const versionId = Number(req.body.versionId || 0);
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId required' } });
    }
    if (versionId) {
      await recordHandbookView({
        agencyId,
        versionId,
        sectionId: req.body.sectionId ? Number(req.body.sectionId) : null,
        userId: req.user?.id || null,
        recipientId: req.body.recipientId ? Number(req.body.recipientId) : null,
        eventType: req.body.eventType || 'open'
      });
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const askQuestion = async (req, res, next) => {
  try {
    const agencyId = Number(req.body.agencyId);
    let versionId = Number(req.body.versionId || 0);
    if (!versionId) {
      const draft = await getDraftOrCreate(agencyId, req.user?.id);
      versionId = draft?.version?.id;
    }
    const question = await askHandbookQuestion({
      agencyId,
      versionId,
      sectionId: req.body.sectionId ? Number(req.body.sectionId) : null,
      askedByUserId: req.user?.id || null,
      recipientId: req.body.recipientId ? Number(req.body.recipientId) : null,
      questionText: req.body.questionText || req.body.question
    });
    res.status(201).json(question);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const saveFullHandbookUrl = async (req, res, next) => {
  try {
    if (!canAccessHandbookOriginal(req.user)) return res.status(403).json({ error: { message: 'Only admins and superadmins can manage the original handbook document.' } });
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const doc = await setFullHandbookUrl(agencyId, req.body.url || req.body.fullHandbookUrl);
    res.json(handbookResponseForReader({ document: doc }, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listDigestsHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    res.json({ digests: await listDigests(agencyId) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getDigestHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    const digest = await getDigest(Number(req.params.digestId), agencyId);
    if (!digest) return res.status(404).json({ error: { message: 'Digest not found' } });
    res.json(handbookResponseForReader(digest, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const createDigestHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const digest = await createDigest({
      agencyId,
      title: req.body.title,
      periodLabel: req.body.periodLabel,
      adminUpdateId: req.body.adminUpdateId,
      providerUpdatePushId: req.body.providerUpdatePushId || req.body.pushId,
      notes: req.body.notes
    });
    res.status(201).json(handbookResponseForReader(digest, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateDigestHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const digest = await updateDigest({
      digestId: Number(req.params.digestId),
      agencyId,
      title: req.body.title,
      periodLabel: req.body.periodLabel,
      adminUpdateId: req.body.adminUpdateId,
      providerUpdatePushId: req.body.providerUpdatePushId || req.body.pushId,
      notes: req.body.notes
    });
    res.json(handbookResponseForReader(digest, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const saveDigestEntryHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const digest = await upsertDigestEntry({
      agencyId,
      digestId: Number(req.params.digestId),
      entryId: req.body.entryId || req.params.entryId || null,
      subject: req.body.subject,
      rationale: req.body.rationale,
      changedContent: req.body.changedContent ?? req.body.changed_content,
      sortOrder: req.body.sortOrder,
      sectionSlug: req.body.sectionSlug
    });
    res.json(handbookResponseForReader(digest, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const deleteDigestEntryHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId || req.query.agencyId);
    const digest = await deleteDigestEntry({
      agencyId,
      digestId: Number(req.params.digestId),
      entryId: Number(req.params.entryId)
    });
    res.json(handbookResponseForReader(digest, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publishDigestHandler = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const digest = await publishDigest({
      agencyId,
      digestId: Number(req.params.digestId),
      publishedByUserId: req.user.id
    });
    res.json(handbookResponseForReader(digest, req.user));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publicPublishedByToken = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const push = await getPush(recipient.push_id);
    let digest = await getPublishedDigestForAgency(recipient.agency_id, {
      adminUpdateId: push?.attached_admin_update_id || null,
      pushId: push?.id || null
    });
    if(recipient.previewOnly || (!digest?.digest && push?.attached_admin_update_id)){
      const drafts=await listDigests(recipient.agency_id);
      const match=drafts.find(d=>d.status==='draft' && (Number(d.provider_update_push_id)===Number(push?.id) || (push?.attached_admin_update_id && Number(d.admin_update_id)===Number(push.attached_admin_update_id))));
      if(match)digest=await getDigest(match.id,recipient.agency_id);
    }
    const handbook = await getPublishedHandbook(recipient.agency_id);
    res.json(handbookResponseForReader({
      ...digest,
      handbook,
      mode: 'handbook',
      recipientId: recipient.id,
      providerUserId: recipient.provider_user_id
    }));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publicAskByToken = async (req, res, next) => {
  try {
    const recipient = await getRecipientByToken(req.params.token);
    if (!recipient) return res.status(404).json({ error: { message: 'Link not found' } });
    const draft = await getDraftOrCreate(recipient.agency_id, recipient.provider_user_id);
    const question = await askHandbookQuestion({
      agencyId: recipient.agency_id,
      versionId: draft.version.id,
      sectionId: req.body.sectionId ? Number(req.body.sectionId) : null,
      askedByUserId: recipient.provider_user_id,
      recipientId: recipient.id,
      questionText: req.body.questionText || req.body.question
    });
    res.status(201).json(question);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publicTrackByToken = async (req, res, next) => {
  try {
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export { ensureDocument };
