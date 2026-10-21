import {
  listOfficeApprovals,
  findOfficeApproval,
  officeApprovalContext,
  withOfficeDecisionLock,
  resolveOfficeRequestAlerts,
  officeDecisionAgency,
  notifyOfficeDecision
} from '../services/officeApprovalWorkflow.service.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import pool from '../config/database.js';
import { splitPendingOfficeRequest } from '../services/officeRequestWindows.service.js';

export async function list(req, res, next) {
  try {
    const requests = await listOfficeApprovals(req.user);
    res.json(
      req.query?.summary
        ? { total: requests.length }
        : { requests, total: requests.length }
    );
  } catch (error) {
    next(error);
  }
}
export async function context(req, res, next) {
  try {
    res.json(await officeApprovalContext(req.user, req.params.key));
  } catch (error) {
    next(error);
  }
}

// Compatibility URLs and the unified endpoint share authorization, locking,
// fresh conflict checks, explicit room selection, notification resolution and audit.
export async function runOfficeDecision(
  req,
  res,
  next,
  { source, action, handler }
) {
  try {
    return await withOfficeDecisionLock(async () => {
      const key = `${source}:${Number(req.params.id)}`;
      const request = await findOfficeApproval(req.user, key);
      if (action === 'deny' && !String(req.body?.approverComment || req.body?.reason || '').trim())
        return res.status(400).json({ error: { message: 'A typed reason is required and will be emailed to the provider.' } });
      let selected = null;
      if (action === 'approve' && request.roomRequest) {
        const review = await officeApprovalContext(req.user, key, {
          roomId: req.body?.roomId || request.roomId,
          selectedOnly: true
        });
        const roomId = Number(req.body?.roomId || request.roomId);
        selected = roomId
          ? review.rooms.find((r) => Number(r.roomId) === roomId)
          : review.rooms.find((r) => r.available);
        if (!selected?.available)
          return res
            .status(409)
            .json({
              error: {
                message:
                  selected?.reason ||
                  'No room is available for the requested dates. Refresh and choose an available room.'
              }
            });
        if (
          review.warnings.length &&
          !req.body?.acknowledgeExistingReservations
        )
          return res
            .status(409)
            .json({
              error: {
                code: 'OFFICE_EXISTING_RESERVATION',
                message:
                  'This provider has existing schedule commitments at this time. Review them before confirming.'
              }
            });
      }
      const scoped = Object.create(req);
      scoped.params = { ...req.params, id: String(request.id) };
      scoped.query = {
        ...req.query,
        agencyId: request.agencyId || req.query?.agencyId
      };
      scoped.body = {
        ...req.body,
        agencyId: request.agencyId || req.body?.agencyId
      };
      if (selected) {
        scoped.officeApprovalWindow = selected.window;
        scoped.body = {
          ...scoped.body,
          roomId: selected.roomId,
          officeId: selected.officeId,
          weekday: selected.window.weekday,
          hour: selected.window.startHour,
          endHour: selected.window.endHour
        };
      }
      let status = 200,
        payload;
      const response = {
        status(code) {
          status = code;
          return this;
        },
        json(value) {
          payload = value;
          return this;
        }
      };
      await handler(scoped, response, (error) => {
        throw error;
      });
      if (status < 400) {
        try {
          const agencyId = await officeDecisionAgency(request);
          await AdminAuditLog.logAction({
            actionType: 'OFFICE_REQUEST_DECIDED',
            actorUserId: req.user.id,
            targetUserId: request.providerId,
            agencyId,
            metadata: {
              requestKey: key,
              action,
              officeId: selected?.officeId || request.officeId,
              roomId: selected?.roomId || request.roomId,
              window: selected?.window || null,
              comment: req.body?.approverComment || null
            }
          });
          await resolveOfficeRequestAlerts(key);
          await notifyOfficeDecision({
            request,
            action,
            selected,
            actorId: req.user.id,
            comment: req.body?.approverComment,
            agencyId,
            result: payload
          });
        } catch (error) {
          console.error(
            '[office-approval] Decision saved; follow-up failed',
            key,
            error.message
          );
          payload = {
            ...payload,
            warning:
              'The decision was saved, but its notification or audit follow-up needs review. Do not submit it again.'
          };
        }
      }
      return res.status(status).json(payload);
    });
  } catch (error) {
    next(error);
  }
}
export async function decide(req, res, next) {
  try {
    const { parseOfficeApprovalKey } = await import(
      '../services/officeApprovalWorkflow.service.js'
    );
    const { source, id } = parseOfficeApprovalKey(req.params.key);
    const action = req.body?.action;
    if (action === 'separate') {
      return await withOfficeDecisionLock(async () => {
        const request = await findOfficeApproval(req.user, req.params.key);
        if (source !== 'intake' || request.slots.length < 2)
          return res
            .status(400)
            .json({
              error: {
                message: 'This request already has a single time window.'
              }
            });
        const requestIds = await splitPendingOfficeRequest(pool, {
          requestId: id,
          agencyId: request.agencyId
        });
        return res.json({
          ok: true,
          requestIds,
          message:
            'The time windows are ready to review separately. No rooms have been assigned.'
        });
      });
    }
    if (!['approve', 'deny'].includes(action))
      return res
        .status(400)
        .json({ error: { message: 'Choose approve or deny.' } });
    if (
      action === 'approve' &&
      !req.body?.roomId &&
      (await findOfficeApproval(req.user, req.params.key)).roomRequest
    )
      return res
        .status(400)
        .json({ error: { message: 'Select the room you have reviewed.' } });
    const controller =
      source === 'intake'
        ? await import('./availability.controller.js')
        : await import('./officeSchedule.controller.js');
    const name =
      source === 'intake'
        ? action === 'approve'
          ? 'assignTemporaryOfficeFromRequest'
          : 'denyOfficeAvailabilityRequest'
        : source === 'booking'
          ? action === 'approve'
            ? 'approveOfficeBookingRequest'
            : 'denyOfficeBookingRequest'
          : action === 'approve'
            ? 'approveRequest'
            : 'denyRequest';
    const scoped = Object.create(req);
    scoped.params = { ...req.params, id: String(id) };
    return controller[name](scoped, res, next);
  } catch (error) {
    next(error);
  }
}
