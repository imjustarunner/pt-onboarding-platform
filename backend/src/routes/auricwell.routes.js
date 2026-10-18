import auricwellOfficeRoutes from './auricwellOffice.routes.js';
import officePublicRoutes from './officePublic.routes.js';
import express from "express";
import rateLimit from "express-rate-limit";
import {
  authenticate,
  protectMutation,
  requireVerified,
  practiceContext,
  login,
  beginMfa,
  verifyMfa,
  COOKIE,
  cookieOptions,
  sendAccountLink,
  redeemAccountToken,
} from "../services/auricwell/auth.js";
import {
  fail,
  hash,
  has,
  requirePermission,
  requirePhi,
  requireCapability,
  readiness,
  text,
  json,
} from "../services/auricwell/policy.js";
import {
  pool,
  open,
  list,
  get,
  create,
  update,
  audit,
  findSource,
} from "../services/auricwell/repository.js";
import * as practices from "../services/auricwell/practices.js";
import {
  previewStaffConnection,
  connectStaffIdentity,
} from "../services/auricwell/staffConnections.js";
import {
  previewConsolidation,
  applyConsolidation,
} from "../services/auricwell/consolidation.js";
import {
  schedulingOptions,
  requestGuardianChange,
  decideGuardianChange,
  previewSeries,
  applySeries,
} from "../services/auricwell/scheduling.js";
import * as clinical from "../services/auricwell/clinical.js";
import * as intake from "../services/auricwell/intake.js";
import {
  noteTemplates,
  saveNoteTemplate,
} from "../services/auricwell/templates.js";
import * as agreements from "../services/auricwell/agreements.js";
import * as imports from "../services/auricwell/imports.js";
import { statement } from "../services/auricwell/reports.js";
import * as billing from "../services/auricwell/billing.js";
import { billingRollout } from '../services/auricwell/billingRollout.js';
import { sharedBilling } from '../services/auricwell/sharedBilling.js';
import {
  noteAidCatalog,
  generateDraft,
} from "../services/auricwell/noteAid.js";

import * as recordsManagement from "../services/auricwell/recordsManagement.js";
import * as recordsRequests from "../services/auricwell/recordsRequests.js";

import { listToasts, saveToast, deleteToast, requireToastOperator, practiceToastAgency } from '../services/toastAnnouncements.service.js';

import { integrationStatus, savePlatformIntegrations, verifyNotifyre, verifyVonageAgency, requireOfficeEnabled } from '../services/auricwell/platformIntegrations.js';
import { joinAppointmentVideo, joinGuestVideo } from '../services/auricwell/appointmentVideo.js';
import { sessionPreferences, saveSessionPreferences, sessionDeliveryStatus, retrySessionDelivery } from '../services/auricwell/sessionReminders.js';
import * as clientMessaging from '../services/auricwell/clientMessaging.js';
const router = express.Router();
const run = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const previewLimit = rateLimit({
  windowMs: 60000,
  limit: 30,
  keyGenerator: (req) => req.aw.accountId,
  standardHeaders: true,
  legacyHeaders: false,
});
const aiLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 60,
  keyGenerator: (req) => req.aw.accountId,
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
router.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  next();
});
router.use(protectMutation);
router.get("/health", (_req, res) =>
  res.json({ product: "auricwell_ehr", status: "available" }),
);
router.post(
  "/auth/login",
  authLimit,
  run(async (req, res) => {
    const result = await login(req.body.username, req.body.password);
    if (result.error) throw result.error;
    res
      .cookie(COOKIE, result.token, cookieOptions())
      .json({ mfaEnabled: result.mfaEnabled });
  }),
);
router.post(
  "/auth/redeem",
  authLimit,
  run(async (req, res) =>
    res.json(await redeemAccountToken(req.body.token, req.body.password)),
  ),
);
router.post(
  "/auth/recovery",
  authLimit,
  run(async (req, res) => {
    const [[a]] = await pool.execute(
      "SELECT id FROM auricwell_accounts WHERE username=?",
      [
        String(req.body.username || "")
          .trim()
          .toLowerCase(),
      ],
    );
    if (a) {
      try {
        await sendAccountLink(a.id, "recovery");
      } catch {
        /* Same response avoids account enumeration. */
      }
    }
    res.json({
      message:
        "If this account can receive recovery email, a link has been sent.",
    });
  }),
);
router.use('/office-public', (_req, _res, next) => requireOfficeEnabled().then(() => next(), next), officePublicRoutes);
router.get('/records-requests/practices', authLimit, run(async (_req, res) => res.json(await recordsRequests.publicPractices())));
router.post('/records-requests/:slug', authLimit, run(async (req, res) => res.status(202).json(await recordsRequests.submitPublic(req.params.slug, req.body))));
router.post('/sessions/join', authLimit, run(async (req, res) => res.json(await joinGuestVideo(req.body.token))));
router.use(authenticate);
router.get("/auth/status", (req, res) =>
  res.json({
    verified: req.aw.verified,
    mfaEnabled: req.aw.mfaEnabled,
    username: req.aw.username,
  }),
);
router.post(
  "/auth/logout",
  run(async (req, res) => {
    await pool.execute("DELETE FROM auricwell_sessions WHERE token_hash=?", [
      req.aw.sessionHash,
    ]);
    res.clearCookie(COOKIE, cookieOptions()).json({ signedOut: true });
  }),
);
router.post(
  "/auth/mfa/begin",
  authLimit,
  run(async (req, res) => res.json(await beginMfa(req.aw))),
);
router.post(
  "/auth/mfa/verify",
  authLimit,
  run(async (req, res) => res.json(await verifyMfa(req.aw, req.body.code))),
);
router.use(requireVerified);
router.get('/platform/integrations', run(async (req, res) => res.json(await integrationStatus(req.aw))));
router.put('/platform/integrations', run(async (req, res) => res.json(await savePlatformIntegrations(req.aw, req.body))));
router.post('/platform/integrations/notifyre/verify', run(async (req, res) => res.json(await verifyNotifyre(req.aw, req.body.practiceId || null))));
router.post('/platform/integrations/vonage/verify', run(async (req,res) => res.json(await verifyVonageAgency(req.aw,req.body.practiceId))));
router.get(
  "/bootstrap",
  run(async (req, res) => res.json(await practices.bootstrap(req.aw))),
);
router.post(
  "/practices",
  run(async (req, res) =>
    res.status(201).json(await practices.provisionPractice(req.aw, req.body)),
  ),
);
// Platform notices may only be posted by an AuricWell operator.
router.get('/support-toasts', run(async (req, res) => {
  requireToastOperator(req.aw);
  res.json(await listToasts({}));
}));
router.post('/support-toasts', run(async (req, res) => {
  requireToastOperator(req.aw);
  res.status(201).json(await saveToast({ accountId: req.aw.accountId, input: req.body }));
}));
router.put('/support-toasts/:id', run(async (req, res) => {
  requireToastOperator(req.aw);
  res.json(await saveToast({ accountId: req.aw.accountId, id: req.params.id, input: req.body }));
}));
router.delete('/support-toasts/:id', run(async (req, res) => {
  requireToastOperator(req.aw);
  res.json(await deleteToast({ id: req.params.id }));
}));
router.use("/practices/:slug", practiceContext);
router.post(
  "/practices/:slug/consolidation/preview",
  run(async (req, res) =>
    res.json(await previewConsolidation(req.aw, req.body)),
  ),
);
router.post(
  "/practices/:slug/consolidation",
  run(async (req, res) => res.json(await applyConsolidation(req.aw, req.body))),
);
const p = "/practices/:slug";
router.get(`${p}/sms/preferences/:patientId`, run(async (req,res) => res.json(await clientMessaging.clientSmsPreferences(req.aw,req.params.patientId))));
router.put(`${p}/sms/preferences/:patientId`, run(async (req,res) => res.json(await clientMessaging.saveClientSmsPreferences(req.aw,req.params.patientId,req.body))));
router.get(`${p}/sms/threads`, run(async (req,res) => res.json(await clientMessaging.smsInbox(req.aw,req.query.patientId || null))));
router.post(`${p}/sms/threads`, run(async (req,res) => res.json(await clientMessaging.startSmsThread(req.aw,req.body.patientId,req.body.line))));
router.put(`${p}/sms/threads/:id/assignment`, run(async (req,res) => res.json(await clientMessaging.assignSmsThread(req.aw,req.params.id,req.body.accountId))));
router.get(`${p}/sms/threads/:id`, run(async (req,res) => res.json(await clientMessaging.smsConversation(req.aw,req.params.id))));
router.post(`${p}/sms/threads/:id/replies`, run(async (req,res) => res.status(202).json(await clientMessaging.replySms(req.aw,req.params.id,req.body))));
router.post(`${p}/sms/threads/:id/resolve`, run(async (req,res) => res.json(await clientMessaging.closeSmsThread(req.aw,req.params.id))));
router.get(`${p}/sms/notices`, run(async (req,res) => res.json(await clientMessaging.smsNotices(req.aw))));
router.post(`${p}/sms/billing-notices/:patientId`, run(async (req,res) => res.status(202).json(await clientMessaging.sendBillingNotice(req.aw,req.params.patientId,req.body))));
router.get(`${p}/sms/operations`, run(async (req,res) => res.json(await clientMessaging.messagingOperations(req.aw))));
router.put(`${p}/sms/operations`, run(async (req,res) => res.json(await clientMessaging.saveMessagingOperations(req.aw,req.body))));
router.put(`${p}/sms/staff/:id`, run(async (req,res) => res.json(await clientMessaging.saveStaffRelay(req.aw,req.params.id,req.body))));
router.get(`${p}/sms/deliveries`, run(async (req,res) => res.json(await clientMessaging.messagingDeliveryQueue(req.aw))));
router.post(`${p}/sms/deliveries/:id/retry`, run(async (req,res) => res.json(await clientMessaging.retryClientSms(req.aw,req.params.id,req.body.confirmedNotSent))));
router.post(`${p}/sms/events/:id/retry`, run(async (req,res) => res.json(await clientMessaging.retryInboundSms(req.aw,req.params.id))));
router.get(`${p}/toasts/active`, run(async (req, res) => res.json(await listToasts({
  agencyId: practiceToastAgency(req.aw), active: true, includeSupport: true
}))));
router.get(`${p}/toasts`, run(async (req, res) => res.json(await listToasts({ agencyId: practiceToastAgency(req.aw, true) }))));
router.post(`${p}/toasts`, run(async (req, res) => res.status(201).json(await saveToast({
  agencyId: practiceToastAgency(req.aw, true), accountId: req.aw.accountId, input: req.body
}))));
router.put(`${p}/toasts/:id`, run(async (req, res) => res.json(await saveToast({
  agencyId: practiceToastAgency(req.aw, true), accountId: req.aw.accountId, id: req.params.id, input: req.body
}))));
router.delete(`${p}/toasts/:id`, run(async (req, res) => res.json(await deleteToast({
  agencyId: practiceToastAgency(req.aw, true), id: req.params.id
}))));

router.use(`${p}/office`,auricwellOfficeRoutes);
router.get(`${p}/records-management`, run(async (req, res) => res.json(await recordsManagement.managementOptions(req.aw))));
router.put(`${p}/records-management`, run(async (req, res) => res.json(await recordsManagement.saveManagement(req.aw, req.body))));
router.put(`${p}/records-requests/:id/assignment`, run(async (req, res) => {
  const result = await recordsManagement.assignRequest(req.aw, req.params.id, req.body);
  await recordsManagement.trySyncRequest(req.aw.practiceId, req.params.id);
  res.json(result);
}));
router.get(`${p}/records-requests`, run(async (req, res) => res.json(await recordsRequests.requests(req.aw))));
router.post(`${p}/records-requests`, authLimit, run(async (req, res) => res.status(201).json(await recordsRequests.submitPortal(req.aw, req.body))));
router.patch(`${p}/records-requests/:id`, run(async (req, res) => res.json(await recordsRequests.review(req.aw, req.params.id, req.body))));
router.get(
  `${p}/intake-templates`,
  run(async (req, res) => res.json(await intake.intakeTemplates(req.aw))),
);
router.post(
  `${p}/intake-templates`,
  run(async (req, res) =>
    res.status(201).json(await intake.saveIntakeTemplate(req.aw, req.body)),
  ),
);
router.put(
  `${p}/intake-templates/:id`,
  run(async (req, res) =>
    res.json(await intake.saveIntakeTemplate(req.aw, req.body, req.params.id)),
  ),
);
router.get(
  `${p}/intake-options`,
  run(async (req, res) => res.json(await intake.intakeOptions(req.aw))),
);
router.get(
  `${p}/intakes`,
  run(async (req, res) => res.json(await intake.getIntakes(req.aw))),
);
router.post(
  `${p}/intakes`,
  run(async (req, res) =>
    res.status(201).json(await intake.assignIntake(req.aw, req.body)),
  ),
);
router.get(
  `${p}/intakes/:id`,
  run(async (req, res) =>
    res.json(await intake.readIntake(req.aw, req.params.id)),
  ),
);
router.put(
  `${p}/intakes/:id/answers`,
  run(async (req, res) =>
    res.json(await intake.answerIntake(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/intakes/:id/review`,
  run(async (req, res) =>
    res.json(await intake.reviewIntake(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/intakes/:id/cancel`,
  run(async (req, res) =>
    res.json(await intake.cancelIntake(req.aw, req.params.id, req.body)),
  ),
);
router.get(
  `${p}/intakes/:id/history`,
  run(async (req, res) =>
    res.json(await intake.intakeHistory(req.aw, req.params.id)),
  ),
);
router.get(
  `${p}/workspace`,
  run(async (req, res) => res.json(await clinical.workspace(req.aw))),
);
router.get(
  `${p}/settings`,
  run(async (req, res) => {
    requirePermission(req.aw, "admin");
    res.json({
      settings: req.aw.settings,
      revision: req.aw.settingsRevision,
      readiness: readiness(req.aw.settings, await list(req.aw, "agreement")),
    });
  }),
);
router.put(
  `${p}/settings`,
  run(async (req, res) =>
    res.json(await practices.saveSettings(req.aw, req.body)),
  ),
);
router.post(
  `${p}/activate-phi`,
  run(async (req, res) =>
    res.json(await practices.activatePhi(req.aw, req.body)),
  ),
);
router.get(
  `${p}/members`,
  run(async (req, res) => res.json(await practices.members(req.aw))),
);
router.post(
  `${p}/members`,
  run(async (req, res) =>
    res.status(201).json(await practices.addMember(req.aw, req.body)),
  ),
);
router.put(
  `${p}/members/:id`,
  run(async (req, res) =>
    res.json(await practices.updateMember(req.aw, req.params.id, req.body)),
  ),
);
router.put(
  `${p}/members/:id/identity`,
  run(async (req, res) =>
    res.json(
      await practices.saveStaffIdentity(req.aw, req.params.id, req.body),
    ),
  ),
);
router.post(
  `${p}/members/:id/invite`,
  run(async (req, res) => {
    requirePermission(req.aw, "admin");
    if (!(await practices.members(req.aw)).some((m) => m.id === req.params.id))
      throw fail(404, "Account not found in this practice.");
    await pool.execute(
      "UPDATE auricwell_memberships SET status='active' WHERE practice_id=? AND account_id=?",
      [req.aw.practiceId, req.params.id],
    );
    const delivery=await sendAccountLink(req.params.id, "invitation", {agencyId:req.aw.agencyId});
    res.status(delivery.sent?200:202).json({sent:delivery.sent,deliveryStatus:delivery.deliveryStatus});
  }),
);
router.post(
  `${p}/members/:id/shared-identity/preview`,
  run(async (req, res) =>
    res.json(await previewStaffConnection(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/members/:id/shared-identity`,
  run(async (req, res) =>
    res.json(await connectStaffIdentity(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/patients`,
  run(async (req, res) =>
    res.status(201).json(await clinical.savePatient(req.aw, req.body)),
  ),
);
router.put(
  `${p}/patients/:id`,
  run(async (req, res) =>
    res.json(await clinical.savePatient(req.aw, req.body, req.params.id)),
  ),
);
router.post(
  `${p}/providers`,
  run(async (req, res) =>
    res.status(201).json(await clinical.saveProvider(req.aw, req.body)),
  ),
);
router.put(
  `${p}/providers/:id`,
  run(async (req, res) =>
    res.json(await clinical.saveProvider(req.aw, req.body, req.params.id)),
  ),
);
router.get(
  `${p}/scheduling-options`,
  run(async (req, res) => res.json(await schedulingOptions(req.aw))),
);
router.post(
  `${p}/appointment-series/preview`,
  run(async (req, res) => res.json(await previewSeries(req.aw, req.body))),
);
router.post(
  `${p}/appointment-series`,
  run(async (req, res) =>
    res.status(201).json(await applySeries(req.aw, req.body)),
  ),
);
router.post(
  `${p}/appointments`,
  run(async (req, res) =>
    res.status(201).json(await clinical.saveAppointment(req.aw, req.body)),
  ),
);
router.put(
  `${p}/appointments/:id`,
  run(async (req, res) =>
    res.json(await clinical.saveAppointment(req.aw, req.body, req.params.id)),
  ),
);
router.get(
  `${p}/note-templates`,
  run(async (req, res) => res.json(await noteTemplates(req.aw))),
);
router.post(
  `${p}/note-templates`,
  run(async (req, res) =>
    res.status(201).json(await saveNoteTemplate(req.aw, req.body)),
  ),
);
router.put(
  `${p}/note-templates/:id`,
  run(async (req, res) =>
    res.json(await saveNoteTemplate(req.aw, req.body, req.params.id)),
  ),
);
router.post(
  `${p}/notes`,
  run(async (req, res) =>
    res.status(201).json(await clinical.saveNote(req.aw, req.body)),
  ),
);
router.put(
  `${p}/notes/:id`,
  run(async (req, res) =>
    res.json(await clinical.saveNote(req.aw, req.body, req.params.id)),
  ),
);
router.post(
  `${p}/notes/:id/sign`,
  run(async (req, res) =>
    res.json(await clinical.signNote(req.aw, req.params.id, req.body)),
  ),
);
router.get(
  `${p}/note-aid`,
  run(async (req, res) => res.json(await noteAidCatalog(req.aw))),
);
router.post(
  `${p}/note-aid/generate`,
  aiLimit,
  run(async (req, res) => res.json(await generateDraft(req.aw, req.body))),
);
router.get(
  `${p}/notes/:id/source`,
  run(async (req, res) => {
    requireCapability(req.aw, "documentation");
    const note = await get(req.aw, "note", req.params.id);
    await clinical.patientAccess(
      req.aw,
      note.patientId,
      req.aw.actorType === "staff",
    );
    if (
      req.aw.actorType !== "staff" &&
      !(
        await list(req.aw, "document_share", { patientId: note.patientId })
      ).some((r) => r.data.noteId === note.id && r.data.shared)
    )
      throw fail(403, "This note has not been shared.");
    await audit(req.aw, "note.source_downloaded", note.id);
    res
      .type("pdf")
      .set("Content-Disposition", 'attachment; filename="historical-note.pdf"')
      .send(await imports.patientPdf(req.aw, note));
  }),
);
router.get(
  `${p}/notifications`,
  run(async (req, res) => res.json(await clinical.notifications(req.aw))),
);
router.get(
  `${p}/patients/:id/message-contacts`,
  run(async (req, res) =>
    res.json(await clinical.messageContacts(req.aw, req.params.id)),
  ),
);
router.post(
  `${p}/messages/:id/read`,
  run(async (req, res) =>
    res.json(await clinical.readMessage(req.aw, req.params.id)),
  ),
);
router.post(
  `${p}/notes/:id/share`,
  run(async (req, res) =>
    res.json(await clinical.shareNote(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/messages`,
  run(async (req, res) =>
    res.status(201).json(await clinical.createMessage(req.aw, req.body)),
  ),
);
router.post(
  `${p}/ledger`,
  run(async (req, res) =>
    res.status(201).json(await clinical.postLedger(req.aw, req.body)),
  ),
);
router.get(
  `${p}/patients/:id/statement`,
  run(async (req, res) =>
    res
      .type("pdf")
      .set(
        "Content-Disposition",
        'attachment; filename="AuricWell-statement.pdf"',
      )
      .send(await statement(req.aw, req.params.id, req.query.receiptId)),
  ),
);
router.get(
  `${p}/shared-documents`,
  run(async (req, res) => {
    requireCapability(req.aw, "documentation");
    requirePhi(req.aw);
    const shares = await list(req.aw, "document_share");
    const documents = [];
    for (const share of shares.filter(
      (r) => r.data.shared && req.aw.patientIds.includes(r.patientId),
    )) {
      const n = await get(req.aw, "note", share.data.noteId);
      documents.push({
        id: n.id,
        patientId: n.patientId,
        title: n.data.title,
        serviceDate: n.data.serviceDate,
      });
    }
    res.json(documents);
  }),
);
router.get(
  `${p}/payers`,
  run(async (req, res) => {
    requirePermission(req.aw, "billing");
    requireCapability(req.aw, "billing");
    res.json(await list(req.aw, "payer"));
  }),
);
router.post(
  `${p}/payers`,
  run(async (req, res) => {
    requirePermission(req.aw, "billing");
    requireCapability(req.aw, "billing");
    res.status(201).json(
      await create(req.aw, "payer", {
        name: text(req.body.name, "Payer name", 200),
        electronicPayerId: String(req.body.electronicPayerId || "").slice(
          0,
          80,
        ),
        address: String(req.body.address || "").slice(0, 500),
        electronicMatchReviewed: false,
        enrollmentVerified: false,
      }),
    );
  }),
);
router.put(
  `${p}/payers/:id`,
  run(async (req, res) =>
    res.json(await billing.savePayer(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/claims`,
  run(async (req, res) =>
    res.status(201).json(await clinical.prepareClaim(req.aw, req.body)),
  ),
);
router.get(`${p}/billing-rollout`, run(async (req, res) => res.json(await billingRollout(req.aw))));
router.all(`${p}/shared-billing/*`, run(async (req, res) => {
  const result = await sharedBilling(req.aw, { method: req.method, path: req.params[0], query: req.query, body: req.body });
  res.status(result.status).json(result.data);
}));
router.put(`${p}/billing-rollout`, run(async (req, res) => res.json(await billingRollout(req.aw, req.body))));
router.post(
  `${p}/claims/:id/review`,
  run(async (req, res) =>
    res.json(await clinical.reviewClaim(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/claims/:id/transmission-review`,
  run(async (req, res) =>
    res.json(await billing.reviewSubmission(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/claims/:id/submit`,
  run(async (req, res) =>
    res.json(await billing.transmitClaim(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/claims/sync`,
  run(async (req, res) => res.json(await billing.syncResponses(req.aw))),
);
router.post(
  `${p}/integrations/:name`,
  run(async (req, res) =>
    res.json(
      await billing.configureIntegration(req.aw, req.params.name, req.body),
    ),
  ),
);
router.get(
  `${p}/patients/:id/insurance`,
  run(async (req, res) =>
    res.json(await billing.readInsurance(req.aw, req.params.id)),
  ),
);
router.put(
  `${p}/patients/:id/insurance`,
  run(async (req, res) =>
    res.json(await billing.saveInsurance(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/patients/:id/eligibility`,
  run(async (req, res) =>
    res.json(await billing.checkEligibility(req.aw, req.params.id)),
  ),
);
router.post(
  `${p}/patients/:id/payments`,
  run(async (req, res) =>
    res.json(await billing.startPayment(req.aw, req.params.id, req.body)),
  ),
);
router.post(
  `${p}/payments/:id/reconcile`,
  run(async (req, res) =>
    res.json(await billing.reconcilePayment(req.aw, req.params.id)),
  ),
);
router.post(
  `${p}/remittances`,
  run(async (req, res) =>
    res.json(await billing.postRemittance(req.aw, req.body)),
  ),
);
router.put(
  `${p}/billing-identity`,
  run(async (req, res) =>
    res.json(await billing.saveBillingIdentity(req.aw, req.body)),
  ),
);
router.post(
  `${p}/ledger/:id/refund`,
  run(async (req, res) =>
    res.json(await billing.refundCardPayment(req.aw, req.params.id, req.body)),
  ),
);
router.get(
  `${p}/billing-setup`,
  run(async (req, res) => {
    requirePermission(req.aw, "billing");
    requireCapability(req.aw, "billing");
    res.json({
      identity: req.aw.settings.billingIdentity || {},
      integrations: Object.fromEntries(
        Object.entries(req.aw.settings.integrations || {}).map(
          ([name, value]) => [
            name,
            { verifiedAt: value.verifiedAt, mode: value.mode },
          ],
        ),
      ),
    });
  }),
);
router.get(
  `${p}/agreements`,
  run(async (req, res) => {
    const records = await list(req.aw, "agreement");
    res.json(
      records.filter(
        (r) =>
          has(req.aw, "agreements") ||
          r.data.signers?.some((s) => s.accountId === req.aw.accountId),
      ),
    );
  }),
);
router.get(
  `${p}/agreement-signers`,
  run(async (req, res) => {
    requirePermission(req.aw, "agreements");
    const [rows] = await pool.execute(
      "SELECT a.id,a.profile,m.actor_type,m.permissions FROM auricwell_memberships m JOIN auricwell_accounts a ON a.id=m.account_id WHERE m.practice_id=? AND m.status='active' AND a.status='active'",
      [req.aw.practiceId],
    );
    res.json(
      rows
        .filter(
          (r) =>
            r.actor_type !== "staff" ||
            json(r.permissions, []).includes("agreements"),
        )
        .map((r) => {
          const profile = open(r.profile, `auricwell:account:${r.id}`);
          return {
            id: r.id,
            name: profile.name,
            operator: !!profile.operator,
            actorType: r.actor_type,
          };
        }),
    );
  }),
);
router.get(`${p}/agreement-templates`, (_req, res) =>
  res.json(agreements.AGREEMENT_TEMPLATES),
);
router.post(
  `${p}/agreements`,
  run(async (req, res) => {
    if (req.body.patientId)
      await clinical.patientAccess(req.aw, req.body.patientId);
    res.status(201).json(await agreements.createAgreement(req.aw, req.body));
  }),
);
router.put(
  `${p}/agreements/:id`,
  run(async (req, res) =>
    res.json(await agreements.saveAgreement(req.aw, req.params.id, req.body)),
  ),
);
for (const action of ["approve", "issue", "sign", "revise"])
  router.post(
    `${p}/agreements/:id/${action}`,
    run(async (req, res) =>
      res.json(
        await agreements[`${action}Agreement`](req.aw, req.params.id, req.body),
      ),
    ),
  );
router.get(
  `${p}/agreements/:id/pdf`,
  run(async (req, res) => {
    const r = await get(req.aw, "agreement", req.params.id);
    if (
      !has(req.aw, "agreements") &&
      !r.data.signers?.some((s) => s.accountId === req.aw.accountId)
    )
      throw fail(403, "Agreement access required.");
    await audit(req.aw, "agreement.downloaded", r.id);
    const executed =
      r.data.status === "completed"
        ? (await list(req.aw, "agreement_pdf", { limit: 10000 })).find(
            (p) => p.data.agreementId === r.id,
          )
        : null;
    res
      .type("pdf")
      .set(
        "Content-Disposition",
        'attachment; filename="AuricWell-agreement.pdf"',
      )
      .send(
        executed
          ? Buffer.from(executed.data.base64, "base64")
          : await agreements.agreementPdf(r),
      );
  }),
);
router.get(
  `${p}/imports`,
  run(async (req, res) => {
    requirePermission(req.aw, "migration");
    requireCapability(req.aw, "imports");
    res.json(await list(req.aw, "import"));
  }),
);
router.post(
  `${p}/imports`,
  run(async (req, res) =>
    res.status(201).json(await imports.beginUpload(req.aw, req.body)),
  ),
);
router.get(
  `${p}/imports/:id`,
  run(async (req, res) =>
    res.json(await imports.previewImport(req.aw, req.params.id)),
  ),
);
router.put(
  `${p}/imports/:id/chunks/:index`,
  run(async (req, res) =>
    res.json(
      await imports.putChunk(
        req.aw,
        req.params.id,
        Number(req.params.index),
        req.body.base64,
      ),
    ),
  ),
);
router.post(
  `${p}/imports/:id/complete`,
  run(async (req, res) =>
    res.json(await imports.finishUpload(req.aw, req.params.id)),
  ),
);
router.post(
  `${p}/imports/:id/apply`,
  run(async (req, res) =>
    res.json(await imports.applyImport(req.aw, req.params.id, req.body)),
  ),
);
for (const action of ["retry", "reconcile", "rollback"])
  router.post(
    `${p}/imports/:id/${action}`,
    run(async (req, res) =>
      res.json(
        await imports[`${action}Import`](req.aw, req.params.id, req.body),
      ),
    ),
  );
router.get(
  `${p}/imports/:id/pages/:page`,
  previewLimit,
  run(async (req, res) => {
    requirePermission(req.aw, "migration");
    requireCapability(req.aw, "imports");
    requirePhi(req.aw);
    const batch = await get(req.aw, "import", req.params.id);
    if (batch.data.type !== "clinical_pdf")
      throw fail(400, "Choose a clinical PDF.");
    const page = Number(req.params.page);
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > (batch.data.pageCount || 0)
    )
      throw fail(400, "Invalid source page.");
    const saved = await findSource(
      req.aw,
      "import_preview",
      `${batch.id}:${page}`,
    );
    if (!saved)
      throw fail(409, "The import worker has not prepared this page yet.");
    await audit(req.aw, "import.page_viewed", batch.id, { page });
    res.type("png").send(Buffer.from(saved.data.base64, "base64"));
  }),
);
router.get(
  `${p}/imports/:id/source`,
  run(async (req, res) => {
    requirePermission(req.aw, "migration");
    requireCapability(req.aw, "imports");
    const batch = await get(req.aw, "import", req.params.id);
    requirePhi(req.aw);
    await audit(req.aw, "import.original_downloaded", batch.id);
    res
      .type(
        batch.data.type === "clinical_pdf"
          ? "application/pdf"
          : "application/octet-stream",
      )
      .set("Content-Disposition", 'attachment; filename="original-export"')
      .send(await imports.sourceBuffer(req.aw, batch));
  }),
);
router.post(
  `${p}/appointment-requests`,
  run(async (req, res) => {
    requireCapability(req.aw, "schedule");
    if(req.body.appointmentId) return res.status(201).json(await requestGuardianChange(req.aw,req.body));
    await clinical.patientAccess(req.aw, req.body.patientId);
    res.status(201).json(
      await create(
        req.aw,
        "appointment_request",
        {
          requestedBy: req.aw.accountId,
          message: text(req.body.message, "Request", 2000),
          status: "pending",
        },
        { patientId: req.body.patientId },
      ),
    );
  }),
);
router.post(
  `${p}/appointment-requests/:id/resolve`,
  run(async (req, res) => {
    requirePermission(req.aw, "schedule");
    requireCapability(req.aw, "schedule");
    const r = await get(req.aw, "appointment_request", req.params.id);
    if(r.data.appointmentId) return res.json(await decideGuardianChange(req.aw,req.params.id,req.body));
    await clinical.patientAccess(req.aw, r.patientId);
    res.json(
      await update(req.aw, r, {
        ...r.data,
        status: "resolved",
        resolution: text(req.body.resolution, "Resolution", 2000),
        resolvedBy: req.aw.accountId,
        resolvedAt: new Date().toISOString(),
      }),
    );
  }),
);
router.post(`${p}/appointments/:id/video`, run(async (req, res) => res.json(await joinAppointmentVideo(req.aw, req.params.id))));
router.get(`${p}/patients/:id/session-preferences`, run(async (req, res) => res.json(await sessionPreferences(req.aw, req.params.id))));
router.put(`${p}/patients/:id/session-preferences`, run(async (req, res) => res.json(await saveSessionPreferences(req.aw, req.params.id, req.body))));
router.get(`${p}/appointments/:id/deliveries`, run(async (req, res) => res.json(await sessionDeliveryStatus(req.aw, req.params.id))));
router.post(`${p}/appointments/:id/deliveries/:deliveryId/retry`, run(async (req, res) => res.json(await retrySessionDelivery(req.aw, req.params.id, req.params.deliveryId, req.body.confirmedNotSent))));
router.use((_req, _res, next) =>
  next(fail(404, "AuricWell endpoint not found.")),
);
router.use((err, req, res, _next) => {
  const status = err.status || (err.code === "ER_DUP_ENTRY" ? 409 : 500);
  if ([401, 403, 409].includes(status))
    console.warn(
      JSON.stringify({
        product: "auricwell_ehr",
        event: "request_rejected",
        status,
        route: req.route?.path || "unmatched",
        practiceId: req.aw?.practiceId || null,
      }),
    );
  if (status >= 500) console.error("[auricwell]", err.code || err.name);
  res.status(status).json({
    error: {
      message:
        status >= 500
          ? "AuricWell could not complete the request. Contact your administrator."
          : err.code === "ER_DUP_ENTRY"
            ? "This record or username already exists."
            : err.message,
    },
  });
});
export default router;
