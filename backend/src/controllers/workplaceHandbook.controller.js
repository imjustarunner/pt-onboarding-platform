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

export const getPublished = async (req, res, next) => {
  try {
    const agencyId = Number(req.query.agencyId || req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId required' } });
    const digest = await getPublishedDigestForAgency(agencyId, {
      adminUpdateId: req.query.adminUpdateId ? Number(req.query.adminUpdateId) : null,
      pushId: req.query.pushId ? Number(req.query.pushId) : null
    });
    // Keep legacy shape for older clients, but prefer digest.
    const legacy = await getPublishedHandbook(agencyId).catch(() => ({ document: null, version: null, sections: [] }));
    res.json({ ...legacy, ...digest, mode: 'digest' });
  } catch (e) {
    next(e);
  }
};

export const getDraft = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.query.agencyId);
    res.json(await getDraftOrCreate(agencyId, req.user.id));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const saveSection = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const draft = await getDraftOrCreate(agencyId, req.user.id);
    await upsertDraftSection({
      agencyId,
      versionId: draft.version.id,
      sectionId: req.body.sectionId || req.params.sectionId || null,
      title: req.body.title,
      bodyHtml: req.body.bodyHtml || req.body.body_html || '',
      sortOrder: Number(req.body.sortOrder ?? req.body.sort_order ?? 0),
      slug: req.body.slug || null
    });
    res.json(await getDraftOrCreate(agencyId, req.user.id));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const removeSection = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId || req.query.agencyId);
    const draft = await getDraftOrCreate(agencyId, req.user.id);
    await deleteDraftSection({
      agencyId,
      versionId: draft.version.id,
      sectionId: Number(req.params.sectionId)
    });
    res.json(await getDraftOrCreate(agencyId, req.user.id));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const publish = async (req, res, next) => {
  try {
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const draft = await getDraftOrCreate(agencyId, req.user.id);
    const published = await publishDraft({
      agencyId,
      versionId: draft.version.id,
      changelog: req.body.changelog,
      publishedByUserId: req.user.id
    });
    res.json(published);
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
    const agencyId = await assertAgencyAdmin(req.user, req.body.agencyId);
    const doc = await setFullHandbookUrl(agencyId, req.body.url || req.body.fullHandbookUrl);
    res.json({ document: doc });
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
    res.json(digest);
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
    res.status(201).json(digest);
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
    res.json(digest);
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
      changedContent: req.body.changedContent || req.body.changed_content,
      sortOrder: req.body.sortOrder
    });
    res.json(digest);
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
    res.json(digest);
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
    res.json(digest);
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
    const digest = await getPublishedDigestForAgency(recipient.agency_id, {
      adminUpdateId: push?.attached_admin_update_id || null,
      pushId: push?.id || null
    });
    res.json({
      ...digest,
      mode: 'digest',
      recipientId: recipient.id,
      providerUserId: recipient.provider_user_id
    });
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
