import ReferralDirectoryEntry, { PAYLOAD_ALLOWED_COLUMNS } from '../models/ReferralDirectoryEntry.model.js';
import ReferralDirectoryCategory from '../models/ReferralDirectoryCategory.model.js';
import ReferralDirectoryChangeRequest from '../models/ReferralDirectoryChangeRequest.model.js';
import Notification from '../models/Notification.model.js';
import pool from '../config/database.js';

// Which roles can skip the approval queue entirely (CRUD applies immediately).
// Everyone else (provider, provider_plus, staff, support, clinical_practice_assistant...)
// submits a change request that an admin reviews.
const DIRECT_EDIT_ROLES = new Set(['super_admin', 'admin']);

const isAdminRole = (role) => DIRECT_EDIT_ROLES.has(String(role || '').toLowerCase());

// Must match frontend router meta for /admin/referral-directory (tenant-scoped data).
const REFERRAL_DIRECTORY_VIEWER_ROLES = new Set(['super_admin', 'admin', 'support', 'staff', 'provider', 'provider_plus']);

function assertReferralDirectoryViewer(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (!REFERRAL_DIRECTORY_VIEWER_ROLES.has(role)) {
    res.status(403).json({ error: { message: 'You do not have access to the referral directory' } });
    return false;
  }
  return true;
}

const resolveAgencyId = (req) => {
  const fromUser = Number(req.user?.agencyId);
  if (fromUser && Number.isFinite(fromUser)) return fromUser;
  const fromQuery = Number(req.query?.agencyId || req.body?.agencyId);
  if (fromQuery && Number.isFinite(fromQuery)) return fromQuery;
  return null;
};

const extractSanitizedPayload = (body) => {
  const out = {};
  for (const k of PAYLOAD_ALLOWED_COLUMNS) {
    if (body && body[k] !== undefined) out[k] = body[k];
  }
  return out;
};

// Notify every admin in the agency that a change request is pending. Mirrors
// the budget_expense_pending_approval pattern in budget.controller.js — best
// effort, failures are logged but never fail the submitting request.
async function notifyAdminsPendingReview({ agencyId, changeRequest, submitterId, submitterName, changeType, entryName }) {
  try {
    const [adminRows] = await pool.execute(
      `SELECT u.id FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE LOWER(u.role) IN ('admin', 'super_admin')
         AND u.id != ?`,
      [agencyId, submitterId]
    );
    const approverIds = (adminRows || []).map((r) => r.id).filter(Boolean);
    const verb = changeType === 'create' ? 'added' : changeType === 'update' ? 'edited' : 'deleted';
    const title = 'Referral directory review needed';
    const message = `${submitterName || 'A user'} ${verb} "${entryName || 'an entry'}" and is awaiting your approval.`;
    for (const approverId of approverIds) {
      try {
        await Notification.create({
          type: 'referral_directory_pending_approval',
          severity: 'warning',
          title,
          message,
          userId: approverId,
          agencyId,
          relatedEntityType: 'referral_directory_change_request',
          relatedEntityId: changeRequest.id,
          actorUserId: submitterId,
          actorSource: 'Referral Directory'
        });
      } catch (inner) {
        console.warn('[referralDirectory.controller] Notification.create failed', { approverId, err: inner?.message });
      }
    }
  } catch (e) {
    console.warn('[referralDirectory.controller] notifyAdminsPendingReview failed', e?.message);
  }
}

// GET /api/referral-directory/categories
export async function listCategories(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    // Auto-seed the default set the first time an agency opens the directory;
    // subsequent calls are idempotent and effectively cheap.
    let categories = await ReferralDirectoryCategory.findAllForAgency(agencyId, { includeInactive: false });
    if (!categories.length) {
      categories = await ReferralDirectoryCategory.seedDefaultsForAgency(agencyId, { createdByUserId: req.user?.id || null });
    }
    res.json({ categories });
  } catch (err) {
    console.error('[referralDirectory.controller] listCategories:', err);
    res.status(500).json({ error: { message: 'Failed to list categories' } });
  }
}

// POST /api/referral-directory/categories — admins only.
export async function createCategory(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin privileges required to add categories' } });
    }
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: { message: 'Category name is required' } });
    const created = await ReferralDirectoryCategory.create({
      agencyId,
      name,
      orderIndex: Number(req.body?.orderIndex || 0) || 0,
      createdByUserId: req.user?.id || null
    });
    res.status(201).json({ category: created });
  } catch (err) {
    console.error('[referralDirectory.controller] createCategory:', err);
    res.status(500).json({ error: { message: err?.message || 'Failed to create category' } });
  }
}

// PUT /api/referral-directory/categories/:id — admins only.
export async function updateCategory(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin privileges required' } });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const existing = await ReferralDirectoryCategory.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Category not found' } });
    const agencyId = resolveAgencyId(req);
    if (existing.agency_id !== agencyId) {
      return res.status(403).json({ error: { message: 'Category belongs to another agency' } });
    }
    const updated = await ReferralDirectoryCategory.update(id, req.body || {});
    res.json({ category: updated });
  } catch (err) {
    console.error('[referralDirectory.controller] updateCategory:', err);
    res.status(500).json({ error: { message: err?.message || 'Failed to update category' } });
  }
}

// DELETE /api/referral-directory/categories/:id — admins only.
export async function deleteCategory(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin privileges required' } });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const existing = await ReferralDirectoryCategory.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Category not found' } });
    const agencyId = resolveAgencyId(req);
    if (existing.agency_id !== agencyId) {
      return res.status(403).json({ error: { message: 'Category belongs to another agency' } });
    }
    await ReferralDirectoryCategory.delete(id);
    res.json({ success: true });
  } catch (err) {
    console.error('[referralDirectory.controller] deleteCategory:', err);
    res.status(500).json({ error: { message: 'Failed to delete category' } });
  }
}

// GET /api/referral-directory/entries
export async function listEntries(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const entries = await ReferralDirectoryEntry.listForAgency(agencyId, {
      search: req.query?.search || '',
      categoryId: req.query?.categoryId ? Number(req.query.categoryId) : null,
      limit: Number(req.query?.limit || 500)
    });
    res.json({ entries });
  } catch (err) {
    console.error('[referralDirectory.controller] listEntries:', err);
    res.status(500).json({ error: { message: 'Failed to list referral entries' } });
  }
}

// POST /api/referral-directory/entries
// Admin: applies immediately as an approved entry.
// Non-admin: queues a create change request.
export async function createEntry(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const payload = extractSanitizedPayload(req.body || {});
    if (!payload.name || !String(payload.name).trim()) {
      return res.status(400).json({ error: { message: 'Entry name is required' } });
    }

    if (isAdminRole(req.user?.role)) {
      const entry = await ReferralDirectoryEntry.create({
        agencyId,
        createdByUserId: req.user?.id || null,
        approvalStatus: 'approved',
        approvedByUserId: req.user?.id || null,
        payload
      });
      return res.status(201).json({ entry, pendingReview: false });
    }

    const changeRequest = await ReferralDirectoryChangeRequest.create({
      agencyId,
      entryId: null,
      changeType: 'create',
      proposedPayload: payload,
      submittedByUserId: req.user?.id || null
    });
    const submitterName = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim();
    await notifyAdminsPendingReview({
      agencyId,
      changeRequest,
      submitterId: req.user?.id,
      submitterName,
      changeType: 'create',
      entryName: payload.name
    });
    res.status(202).json({ changeRequest, pendingReview: true });
  } catch (err) {
    console.error('[referralDirectory.controller] createEntry:', err);
    res.status(500).json({ error: { message: err?.message || 'Failed to create entry' } });
  }
}

// PUT /api/referral-directory/entries/:id
// Admin: applies immediately.
// Non-admin: queues an update change request.
export async function updateEntry(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const existing = await ReferralDirectoryEntry.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Entry not found' } });
    if (existing.agency_id !== agencyId) {
      return res.status(403).json({ error: { message: 'Entry belongs to another agency' } });
    }
    const payload = extractSanitizedPayload(req.body || {});

    if (isAdminRole(req.user?.role)) {
      const updated = await ReferralDirectoryEntry.update(id, payload);
      return res.json({ entry: updated, pendingReview: false });
    }

    const changeRequest = await ReferralDirectoryChangeRequest.create({
      agencyId,
      entryId: id,
      changeType: 'update',
      proposedPayload: payload,
      submittedByUserId: req.user?.id || null
    });
    const submitterName = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim();
    await notifyAdminsPendingReview({
      agencyId,
      changeRequest,
      submitterId: req.user?.id,
      submitterName,
      changeType: 'update',
      entryName: existing.name
    });
    res.status(202).json({ changeRequest, pendingReview: true });
  } catch (err) {
    console.error('[referralDirectory.controller] updateEntry:', err);
    res.status(500).json({ error: { message: err?.message || 'Failed to update entry' } });
  }
}

// DELETE /api/referral-directory/entries/:id
// Admin: soft-deletes immediately (is_active=false) so existing references stay intact.
// Non-admin: queues a delete change request.
export async function deleteEntry(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const existing = await ReferralDirectoryEntry.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Entry not found' } });
    if (existing.agency_id !== agencyId) {
      return res.status(403).json({ error: { message: 'Entry belongs to another agency' } });
    }

    if (isAdminRole(req.user?.role)) {
      const hard = String(req.query?.hard || '').toLowerCase() === 'true';
      if (hard) {
        await ReferralDirectoryEntry.hardDelete(id);
        return res.json({ success: true, hardDeleted: true });
      }
      const entry = await ReferralDirectoryEntry.softDelete(id);
      return res.json({ entry, pendingReview: false });
    }

    const changeRequest = await ReferralDirectoryChangeRequest.create({
      agencyId,
      entryId: id,
      changeType: 'delete',
      proposedPayload: null,
      submittedByUserId: req.user?.id || null
    });
    const submitterName = [req.user?.firstName, req.user?.lastName].filter(Boolean).join(' ').trim();
    await notifyAdminsPendingReview({
      agencyId,
      changeRequest,
      submitterId: req.user?.id,
      submitterName,
      changeType: 'delete',
      entryName: existing.name
    });
    res.status(202).json({ changeRequest, pendingReview: true });
  } catch (err) {
    console.error('[referralDirectory.controller] deleteEntry:', err);
    res.status(500).json({ error: { message: 'Failed to delete entry' } });
  }
}

// GET /api/referral-directory/change-requests?status=pending
export async function listChangeRequests(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin privileges required' } });
    }
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const status = String(req.query?.status || 'pending').toLowerCase();
    const rows = status === 'pending'
      ? await ReferralDirectoryChangeRequest.listPendingForAgency(agencyId)
      : await ReferralDirectoryChangeRequest.listHistoryForAgency(agencyId, { status });
    res.json({ changeRequests: rows });
  } catch (err) {
    console.error('[referralDirectory.controller] listChangeRequests:', err);
    res.status(500).json({ error: { message: 'Failed to list change requests' } });
  }
}

// GET /api/referral-directory/change-requests/pending-count
export async function pendingChangeRequestsCount(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.json({ count: 0 });
    if (!isAdminRole(req.user?.role)) return res.json({ count: 0 });
    const count = await ReferralDirectoryChangeRequest.countPendingForAgency(agencyId);
    res.json({ count });
  } catch (err) {
    console.error('[referralDirectory.controller] pendingChangeRequestsCount:', err);
    res.json({ count: 0 });
  }
}

// POST /api/referral-directory/change-requests/:id/approve
export async function approveChangeRequest(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin privileges required' } });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const existing = await ReferralDirectoryChangeRequest.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Change request not found' } });
    const agencyId = resolveAgencyId(req);
    if (existing.agency_id !== agencyId) {
      return res.status(403).json({ error: { message: 'Change request belongs to another agency' } });
    }
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: { message: `Change request already ${existing.status}` } });
    }

    let resultEntry = null;
    const payload = existing.proposed_payload || {};
    if (existing.change_type === 'create') {
      resultEntry = await ReferralDirectoryEntry.create({
        agencyId,
        createdByUserId: existing.submitted_by_user_id,
        approvalStatus: 'approved',
        approvedByUserId: req.user?.id || null,
        payload
      });
    } else if (existing.change_type === 'update') {
      if (!existing.entry_id) {
        return res.status(409).json({ error: { message: 'Change request references no entry' } });
      }
      resultEntry = await ReferralDirectoryEntry.update(existing.entry_id, payload);
    } else if (existing.change_type === 'delete') {
      if (!existing.entry_id) {
        return res.status(409).json({ error: { message: 'Change request references no entry' } });
      }
      resultEntry = await ReferralDirectoryEntry.softDelete(existing.entry_id);
    }

    const reviewed = await ReferralDirectoryChangeRequest.markReviewed(id, {
      status: 'approved',
      reviewerUserId: req.user?.id || null,
      adminNotes: req.body?.adminNotes || null
    });
    res.json({ changeRequest: reviewed, entry: resultEntry });
  } catch (err) {
    console.error('[referralDirectory.controller] approveChangeRequest:', err);
    res.status(500).json({ error: { message: err?.message || 'Failed to approve' } });
  }
}

// POST /api/referral-directory/change-requests/:id/reject
export async function rejectChangeRequest(req, res) {
  try {
    if (!assertReferralDirectoryViewer(req, res)) return;
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin privileges required' } });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const existing = await ReferralDirectoryChangeRequest.findById(id);
    if (!existing) return res.status(404).json({ error: { message: 'Change request not found' } });
    const agencyId = resolveAgencyId(req);
    if (existing.agency_id !== agencyId) {
      return res.status(403).json({ error: { message: 'Change request belongs to another agency' } });
    }
    if (existing.status !== 'pending') {
      return res.status(409).json({ error: { message: `Change request already ${existing.status}` } });
    }
    const reviewed = await ReferralDirectoryChangeRequest.markReviewed(id, {
      status: 'rejected',
      reviewerUserId: req.user?.id || null,
      adminNotes: req.body?.adminNotes || null
    });
    res.json({ changeRequest: reviewed });
  } catch (err) {
    console.error('[referralDirectory.controller] rejectChangeRequest:', err);
    res.status(500).json({ error: { message: 'Failed to reject' } });
  }
}
