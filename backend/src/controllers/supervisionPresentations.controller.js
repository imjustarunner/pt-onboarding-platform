import multer from 'multer';
import pool from '../config/database.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import SupervisionCasePresentation from '../models/SupervisionCasePresentation.model.js';
import StorageService from '../services/storage.service.js';
import { isAdminLikeRole, isSupervisorActor } from '../utils/supervisorSchoolAccess.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file?.originalname || '').toLowerCase();
    const mime = String(file?.mimetype || '').toLowerCase();
    const okExt = name.endsWith('.pptx') || name.endsWith('.ppt') || name.endsWith('.pdf');
    const okMime = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ].includes(mime);
    if (okExt || okMime) cb(null, true);
    else cb(new Error('Only PowerPoint (.ppt/.pptx) or PDF files are allowed'));
  }
});

export const presentationUploadMiddleware = upload.single('file');

async function loadSession(sessionId) {
  const sid = parseInt(sessionId, 10);
  if (!sid) return null;
  return SupervisionSession.findById(sid);
}

async function getSessionAttendeeIds(sessionRow) {
  const sid = Number(sessionRow?.id || 0);
  if (!sid) return [];
  try {
    const attendees = await SupervisionSession.listAttendees?.(sid);
    if (Array.isArray(attendees)) {
      return attendees.map((a) => Number(a.user_id || a.userId || 0)).filter(Boolean);
    }
  } catch {
    // fall through
  }
  const ids = [
    Number(sessionRow.supervisor_user_id || 0),
    Number(sessionRow.supervisee_user_id || 0)
  ];
  try {
    const presenters = await SupervisionSession.listPresentersForSession?.(sid);
    for (const p of presenters || []) {
      ids.push(Number(p.user_id || 0));
    }
  } catch {
    // ignore
  }
  return Array.from(new Set(ids.filter(Boolean)));
}

async function canViewSession(req, sessionRow) {
  if (!sessionRow) return false;
  if (isAdminLikeRole(req.user?.role)) return true;
  const uid = Number(req.user?.id || 0);
  if (!uid) return false;
  if (uid === Number(sessionRow.supervisor_user_id)) return true;
  if (uid === Number(sessionRow.supervisee_user_id)) return true;
  try {
    const [attendee] = await pool.execute(
      `SELECT 1 FROM supervision_session_attendees WHERE session_id = ? AND user_id = ? LIMIT 1`,
      [Number(sessionRow.id), uid]
    );
    if (attendee?.length) return true;
  } catch {
    // fall through
  }
  try {
    const presenters = await SupervisionSession.listPresentersForSession(sessionRow.id);
    if ((presenters || []).some((p) => Number(p.user_id) === uid)) return true;
  } catch {
    // fall through
  }
  if (await isSupervisorActor({ userId: uid, role: req.user?.role, user: req.user })) return true;
  return false;
}

async function canEditPresentation(req, sessionRow, presentation) {
  if (!sessionRow || !presentation) return false;
  if (isAdminLikeRole(req.user?.role)) return true;
  const uid = Number(req.user?.id || 0);
  if (uid && uid === Number(presentation.presenter_user_id)) return true;
  // Supervisor may advance live state; deck content edits are presenter-owned.
  return false;
}

async function canControlLiveState(req, sessionRow) {
  if (!sessionRow) return false;
  if (isAdminLikeRole(req.user?.role)) return true;
  const uid = Number(req.user?.id || 0);
  if (uid && uid === Number(sessionRow.supervisor_user_id)) return true;
  try {
    const presenters = await SupervisionSession.listPresentersForSession(sessionRow.id);
    return (presenters || []).some((p) => Number(p.user_id) === uid);
  } catch {
    return false;
  }
}

function mapPresentationApi(p, slides = null) {
  if (!p) return null;
  return {
    id: p.id,
    sessionId: p.session_id,
    presenterUserId: p.presenter_user_id,
    presenterName: p.presenter_name || null,
    presenterEmail: p.presenter_email || null,
    sourceType: p.source_type,
    externalUrl: p.external_url,
    storagePath: p.storage_path,
    mimeType: p.mime_type,
    originalFilename: p.original_filename,
    status: p.status,
    caseSummary: p.caseSummary || p.case_summary_json || {},
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    slides: slides == null ? undefined : slides
  };
}

export const listSessionPresentations = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });
    if (!(await canViewSession(req, session))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const rows = await SupervisionCasePresentation.listForSession(session.id);
    res.json({ presentations: rows.map((p) => mapPresentationApi(p)) });
  } catch (e) {
    next(e);
  }
};

export const getOrCreateMyPresentation = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });
    const uid = Number(req.user?.id || 0);
    if (!uid) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const presenterUserId = req.query.presenterUserId
      ? parseInt(req.query.presenterUserId, 10)
      : uid;

    if (presenterUserId !== uid && !isAdminLikeRole(req.user?.role) && Number(session.supervisor_user_id) !== uid) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    // Presenters (or supervisor viewing) may open; create seeds template for the presenter.
    let presentation = await SupervisionCasePresentation.findBySessionAndPresenter({
      sessionId: session.id,
      presenterUserId
    });
    if (!presentation) {
      const presenters = await SupervisionSession.listPresentersForSession(session.id);
      const isAssigned = (presenters || []).some((p) => Number(p.user_id) === presenterUserId);
      if (!isAssigned && presenterUserId !== uid) {
        return res.status(404).json({ error: { message: 'Presentation not found' } });
      }
      if (!isAssigned && presenterUserId === uid) {
        // Allow assigned presenters only for create
        return res.status(403).json({ error: { message: 'You are not assigned as a presenter for this session' } });
      }
      presentation = await SupervisionCasePresentation.create({
        sessionId: session.id,
        presenterUserId,
        createdByUserId: uid,
        seedTemplate: true
      });
    } else {
      await SupervisionCasePresentation.seedTemplateSlides(presentation.id, uid);
    }

    const slides = await SupervisionCasePresentation.listSlides(presentation.id);
    res.json({ presentation: mapPresentationApi(presentation, slides) });
  } catch (e) {
    next(e);
  }
};

export const updatePresentation = async (req, res, next) => {
  try {
    const presentation = await SupervisionCasePresentation.findById(req.params.presentationId);
    if (!presentation) return res.status(404).json({ error: { message: 'Presentation not found' } });
    const session = await loadSession(presentation.session_id);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Only the assigned presenter can edit this deck' } });
    }

    const updated = await SupervisionCasePresentation.updatePresentation(presentation.id, {
      sourceType: req.body?.sourceType,
      externalUrl: req.body?.externalUrl,
      status: req.body?.status,
      caseSummary: req.body?.caseSummary,
      updatedByUserId: req.user.id
    });
    const slides = await SupervisionCasePresentation.listSlides(updated.id);
    res.json({ presentation: mapPresentationApi(updated, slides) });
  } catch (e) {
    next(e);
  }
};

export const createSlide = async (req, res, next) => {
  try {
    const presentation = await SupervisionCasePresentation.findById(req.params.presentationId);
    if (!presentation) return res.status(404).json({ error: { message: 'Presentation not found' } });
    const session = await loadSession(presentation.session_id);
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const slide = await SupervisionCasePresentation.createSlide({
      presentationId: presentation.id,
      title: req.body?.title || 'New slide',
      sectionKey: req.body?.sectionKey || null,
      bodyHtml: req.body?.bodyHtml || '',
      presenterNotes: req.body?.presenterNotes || '',
      layout: req.body?.layout || 'text',
      background: req.body?.background || null,
      mediaUrl: req.body?.mediaUrl || null,
      createdByUserId: req.user.id
    });
    res.status(201).json({ slide });
  } catch (e) {
    next(e);
  }
};

export const updateSlide = async (req, res, next) => {
  try {
    const slide = await SupervisionCasePresentation.getSlideById(req.params.slideId);
    if (!slide) return res.status(404).json({ error: { message: 'Slide not found' } });
    const presentation = await SupervisionCasePresentation.findById(slide.presentation_id);
    const session = await loadSession(presentation?.session_id);
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const updated = await SupervisionCasePresentation.updateSlide(slide.id, {
      title: req.body?.title,
      sectionKey: req.body?.sectionKey,
      bodyHtml: req.body?.bodyHtml,
      presenterNotes: req.body?.presenterNotes,
      layout: req.body?.layout,
      background: req.body?.background,
      mediaUrl: req.body?.mediaUrl,
      slideOrder: req.body?.slideOrder
    });
    res.json({ slide: updated });
  } catch (e) {
    next(e);
  }
};

export const deleteSlide = async (req, res, next) => {
  try {
    const slide = await SupervisionCasePresentation.getSlideById(req.params.slideId);
    if (!slide) return res.status(404).json({ error: { message: 'Slide not found' } });
    const presentation = await SupervisionCasePresentation.findById(slide.presentation_id);
    const session = await loadSession(presentation?.session_id);
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    await SupervisionCasePresentation.deleteSlide(slide.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const reorderSlides = async (req, res, next) => {
  try {
    const presentation = await SupervisionCasePresentation.findById(req.params.presentationId);
    if (!presentation) return res.status(404).json({ error: { message: 'Presentation not found' } });
    const session = await loadSession(presentation.session_id);
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const slides = await SupervisionCasePresentation.reorderSlides(
      presentation.id,
      req.body?.orderedSlideIds || []
    );
    res.json({ slides });
  } catch (e) {
    next(e);
  }
};

export const uploadPresentationFile = async (req, res, next) => {
  try {
    const presentation = await SupervisionCasePresentation.findById(req.params.presentationId);
    if (!presentation) return res.status(404).json({ error: { message: 'Presentation not found' } });
    const session = await loadSession(presentation.session_id);
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: { message: 'File is required' } });
    }
    const saved = await StorageService.saveAdminDoc(
      req.file.buffer,
      `supervision_presentations/${Date.now()}_${req.file.originalname}`,
      req.file.mimetype || 'application/octet-stream'
    );
    const path = saved?.path || saved?.key || null;
    const updated = await SupervisionCasePresentation.updatePresentation(presentation.id, {
      sourceType: 'upload',
      storagePath: typeof path === 'string' ? path : path?.path || null,
      mimeType: req.file.mimetype,
      originalFilename: req.file.originalname,
      status: 'ready',
      updatedByUserId: req.user.id
    });
    const slides = await SupervisionCasePresentation.listSlides(updated.id);
    res.json({ presentation: mapPresentationApi(updated, slides) });
  } catch (e) {
    next(e);
  }
};

export const setExternalPresentationLink = async (req, res, next) => {
  try {
    const presentation = await SupervisionCasePresentation.findById(req.params.presentationId);
    if (!presentation) return res.status(404).json({ error: { message: 'Presentation not found' } });
    const session = await loadSession(presentation.session_id);
    if (!(await canEditPresentation(req, session, presentation))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const url = String(req.body?.externalUrl || '').trim();
    if (!url) return res.status(400).json({ error: { message: 'externalUrl is required' } });
    const updated = await SupervisionCasePresentation.updatePresentation(presentation.id, {
      sourceType: 'external_link',
      externalUrl: url,
      status: 'ready',
      updatedByUserId: req.user.id
    });
    const slides = await SupervisionCasePresentation.listSlides(updated.id);
    res.json({ presentation: mapPresentationApi(updated, slides) });
  } catch (e) {
    next(e);
  }
};

export const getPresentationState = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });
    if (!(await canViewSession(req, session))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const state = await SupervisionCasePresentation.getState(session.id);
    let activePresentation = null;
    let slides = [];
    let currentSlide = null;
    if (state?.active_presentation_id) {
      activePresentation = await SupervisionCasePresentation.findById(state.active_presentation_id);
      slides = await SupervisionCasePresentation.listSlides(state.active_presentation_id);
      currentSlide = state.current_slide_id
        ? await SupervisionCasePresentation.getSlideById(state.current_slide_id)
        : slides.find((s) => Number(s.slide_order) === Number(state.current_slide_order)) || slides[0] || null;
    } else {
      const list = await SupervisionCasePresentation.listForSession(session.id);
      activePresentation = list[0] || null;
      if (activePresentation) {
        slides = await SupervisionCasePresentation.listSlides(activePresentation.id);
        currentSlide = slides[0] || null;
      }
    }
    res.json({
      state: state || null,
      presentation: mapPresentationApi(activePresentation, slides),
      currentSlide
    });
  } catch (e) {
    next(e);
  }
};

export const putPresentationState = async (req, res, next) => {
  try {
    const session = await loadSession(req.params.id);
    if (!session) return res.status(404).json({ error: { message: 'Session not found' } });
    if (!(await canControlLiveState(req, session))) {
      return res.status(403).json({ error: { message: 'Only the supervisor or presenter can advance slides' } });
    }
    const state = await SupervisionCasePresentation.upsertState({
      sessionId: session.id,
      activePresentationId: req.body?.activePresentationId,
      currentSlideId: req.body?.currentSlideId,
      currentSlideOrder: req.body?.currentSlideOrder,
      updatedByUserId: req.user.id
    });
    res.json({ state });
  } catch (e) {
    next(e);
  }
};
