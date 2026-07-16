import * as deliverableService from '../services/assessmentDeliverable.service.js';
import * as assignService from '../services/assessmentAssign.service.js';

function handleError(res, error) {
  const status = error?.status || 500;
  if (status >= 500) console.error('[assessment-deliverables]', error);
  return res.status(status).json({
    success: false,
    error: error?.message || 'Assessment deliverable error'
  });
}

function userAgencyId(req) {
  return req.user?.agencyId || req.user?.agency_id || null;
}

export async function listForClient(req, res) {
  try {
    const clientId = Number(req.params.clientId);
    const client = await deliverableService.assertCoachCanAccessClient({
      user: req.user,
      clientId
    });
    const agencyId = userAgencyId(req) || client.agency_id;
    const [deliverables, assessments] = await Promise.all([
      deliverableService.listForClient({ clientId, agencyId }),
      deliverableService.listClientAssessments({ clientId, agencyId })
    ]);
    return res.json({ success: true, deliverables, assessments });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function listSharedForClient(req, res) {
  try {
    const clientId = Number(req.params.clientId);
    await deliverableService.assertClientCanViewOwnShared({
      user: req.user,
      clientId
    });
    const deliverables = await deliverableService.listSharedForClient({ clientId });
    return res.json({ success: true, deliverables });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getOne(req, res) {
  try {
    const doc = await deliverableService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    const role = String(req.user?.role || '').toLowerCase();
    const isClientLike = role === 'client' || role === 'guardian';
    if (isClientLike || doc.sharedWithClient) {
      try {
        await deliverableService.assertClientCanViewOwnShared({
          user: req.user,
          clientId: doc.clientId
        });
        if (!doc.sharedWithClient && isClientLike) {
          return res.status(403).json({ success: false, error: 'Document is not shared' });
        }
      } catch (e) {
        if (!isClientLike) {
          await deliverableService.assertCoachCanAccessClient({
            user: req.user,
            clientId: doc.clientId
          });
        } else {
          throw e;
        }
      }
    } else {
      await deliverableService.assertCoachCanAccessClient({
        user: req.user,
        clientId: doc.clientId
      });
    }
    return res.json({ success: true, deliverable: doc });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function patchOne(req, res) {
  try {
    const doc = await deliverableService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    await deliverableService.assertCoachCanAccessClient({
      user: req.user,
      clientId: doc.clientId
    });
    const updated = await deliverableService.updateDeliverable({
      id: doc.id,
      title: req.body?.title,
      htmlBody: req.body?.htmlBody ?? req.body?.html_body,
      plainSummary: req.body?.plainSummary ?? req.body?.plain_summary
    });
    return res.json({ success: true, deliverable: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function share(req, res) {
  try {
    const doc = await deliverableService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    await deliverableService.assertCoachCanAccessClient({
      user: req.user,
      clientId: doc.clientId
    });
    const updated = await deliverableService.shareDeliverable({
      id: doc.id,
      userId: req.user?.id
    });
    return res.json({ success: true, deliverable: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function unshare(req, res) {
  try {
    const doc = await deliverableService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    await deliverableService.assertCoachCanAccessClient({
      user: req.user,
      clientId: doc.clientId
    });
    const updated = await deliverableService.unshareDeliverable({ id: doc.id });
    return res.json({ success: true, deliverable: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function exportOne(req, res) {
  try {
    const doc = await deliverableService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    const role = String(req.user?.role || '').toLowerCase();
    const isClientLike = role === 'client' || role === 'guardian';
    if (isClientLike) {
      await deliverableService.assertClientCanViewOwnShared({
        user: req.user,
        clientId: doc.clientId
      });
      if (!doc.sharedWithClient) {
        return res.status(403).json({ success: false, error: 'Document is not shared' });
      }
    } else {
      await deliverableService.assertCoachCanAccessClient({
        user: req.user,
        clientId: doc.clientId
      });
    }
    const format = req.body?.format || req.query?.format;
    const subjectEmail =
      req.body?.subjectEmail ||
      req.user?.email ||
      req.user?.workEmail ||
      null;
    const result = await deliverableService.exportDeliverable({
      id: doc.id,
      format,
      subjectEmail
    });
    if (result.meta?.googleDocUrl) {
      return res.json({
        success: true,
        format: 'google_doc',
        googleDocId: result.meta.googleDocId,
        googleDocUrl: result.meta.googleDocUrl,
        deliverable: result.doc
      });
    }
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`
    );
    return res.send(result.buffer);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function replaceOne(req, res) {
  try {
    const doc = await deliverableService.getById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Not found' });
    await deliverableService.assertCoachCanAccessClient({
      user: req.user,
      clientId: doc.clientId
    });
    const updated = await deliverableService.replaceDeliverable({
      id: doc.id,
      htmlBody: req.body?.htmlBody ?? req.body?.html_body,
      title: req.body?.title,
      fileBuffer: req.file?.buffer || null,
      filename: req.file?.originalname || null,
      mimeType: req.file?.mimetype || null
    });
    return res.json({ success: true, deliverable: updated });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function assign(req, res) {
  try {
    const clientId = Number(req.body?.clientId);
    const family = req.body?.family || req.body?.catalogId || req.body?.toolId;
    const agencyId =
      Number(req.body?.agencyId) || userAgencyId(req) || null;
    if (!clientId || !family || !agencyId) {
      return res.status(400).json({
        success: false,
        error: 'family, clientId, and agencyId are required'
      });
    }
    await deliverableService.assertCoachCanAccessClient({
      user: req.user,
      clientId
    });
    const result = await assignService.assignAssessmentToClient({
      family,
      agencyId,
      clientId,
      coachUserId: req.user?.id,
      organizationSlug: req.body?.organizationSlug || ''
    });
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return handleError(res, error);
  }
}
