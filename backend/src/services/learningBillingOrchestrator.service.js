import LearningProgramSession from '../models/LearningProgramSession.model.js';
import LearningSessionCharge from '../models/LearningSessionCharge.model.js';
import LearningTokenLedger from '../models/LearningTokenLedger.model.js';
import LearningSubscription from '../models/LearningSubscription.model.js';
import LearningService from '../models/LearningService.model.js';
import QuickbooksSyncJob from '../models/QuickbooksSyncJob.model.js';

function idempotencyKeyForCharge({ agencyId, sessionId, mode }) {
  return `learning_charge:${agencyId}:${sessionId}:${mode}`;
}

export class LearningBillingOrchestrator {
  static async getBookingEligibility({ agencyId, clientId, sessionType = 'INDIVIDUAL' }) {
    const [subscription, tokenBalance] = await Promise.all([
      LearningSubscription.findActiveForClient({ agencyId, clientId }),
      LearningTokenLedger.getBalanceByClient({ agencyId, clientId })
    ]);
    const wantsGroup = String(sessionType || '').toUpperCase() === 'GROUP';
    const tokens = wantsGroup ? Number(tokenBalance.groupTokens || 0) : Number(tokenBalance.individualTokens || 0);
    return {
      hasActiveSubscription: Boolean(subscription),
      availableTokens: tokens,
      eligibleByToken: tokens > 0,
      eligiblePayPerEvent: true
    };
  }

  static async createSessionFromOfficeEvent({
    agencyId,
    organizationId = null,
    officeEvent,
    clientId,
    guardianUserId = null,
    learningServiceId = null,
    paymentMode = 'PAY_PER_EVENT',
    sourceTimezone = 'America/New_York',
    startAtUtc = null,
    endAtUtc = null,
    createdByUserId = null
  }) {
    const existing = await LearningProgramSession.findByOfficeEventId(officeEvent.id);
    if (existing) return { session: existing, created: false };
    const session = await LearningProgramSession.create({
      agencyId,
      organizationId,
      officeEventId: officeEvent.id,
      clientId,
      guardianUserId,
      assignedProviderId: officeEvent.booked_provider_id || officeEvent.assigned_provider_id || null,
      learningServiceId,
      paymentMode,
      sessionStatus: 'SCHEDULED',
      scheduledStartAt: officeEvent.start_at,
      scheduledEndAt: officeEvent.end_at,
      sourceTimezone,
      startAtUtc,
      endAtUtc,
      notes: null,
      metadataJson: { source: 'OFFICE_EVENT_LINK' },
      createdByUserId
    });
    return { session, created: true };
  }

  static async createPendingSessionCharge({
    agencyId,
    sessionId,
    clientId,
    guardianUserId = null,
    learningServiceId = null,
    createdByUserId = null
  }) {
    let amountCents = 0;
    if (learningServiceId) {
      const services = await LearningService.listByAgency({ agencyId, activeOnly: false });
      const svc = (services || []).find((s) => Number(s.id) === Number(learningServiceId));
      amountCents = Number(svc?.default_fee_cents || 0);
    }
    const charge = await LearningSessionCharge.create({
      agencyId,
      learningProgramSessionId: sessionId,
      clientId,
      guardianUserId,
      amountCents,
      taxCents: 0,
      discountCents: 0,
      currency: 'USD',
      chargeType: 'SESSION_FEE',
      chargeStatus: 'PENDING',
      idempotencyKey: idempotencyKeyForCharge({ agencyId, sessionId, mode: 'PENDING' }),
      metadataJson: { source: 'SESSION_LINK' },
      createdByUserId
    });
    return charge;
  }

  static async applyCoverageForCharge({
    agencyId,
    session,
    charge,
    paymentMode = 'PAY_PER_EVENT',
    createdByUserId = null
  }) {
    const mode = String(paymentMode || session?.payment_mode || 'PAY_PER_EVENT').toUpperCase();
    if (!charge || Number(charge.id || 0) <= 0) {
      return { covered: false, mode, reason: 'missing_charge' };
    }
    const clientId = Number(session?.client_id || charge?.client_id || 0);
    const sessionId = Number(session?.id || charge?.learning_program_session_id || 0);
    if (!clientId || !sessionId) {
      return { covered: false, mode, reason: 'missing_client_or_session' };
    }

    if (mode === 'TOKEN') {
      const tokenType = 'INDIVIDUAL';
      const alreadyDebited = await LearningTokenLedger.hasSessionDebit({
        agencyId,
        clientId,
        learningProgramSessionId: sessionId,
        tokenType
      });
      if (!alreadyDebited) {
        const balances = await LearningTokenLedger.getBalanceByClient({ agencyId, clientId });
        const available = Number(balances.individualTokens || 0);
        if (available <= 0) {
          return { covered: false, mode, reason: 'insufficient_tokens' };
        }
        await LearningTokenLedger.addEntry({
          agencyId,
          clientId,
          guardianUserId: Number(session?.guardian_user_id || 0) || null,
          learningProgramSessionId: sessionId,
          tokenType,
          direction: 'DEBIT',
          quantity: 1,
          reasonCode: 'SESSION_BOOKED',
          metadataJson: { coveredChargeId: Number(charge.id), mode: 'TOKEN' },
          createdByUserId
        });
      }
      const coveredCharge = await LearningSessionCharge.markCoveredByMode({
        chargeId: charge.id,
        mode: 'TOKEN',
        metadataPatch: { tokenType: 'INDIVIDUAL', sessionId }
      });
      return { covered: true, mode, reason: 'token_debit', charge: coveredCharge };
    }

    if (mode === 'SUBSCRIPTION') {
      const sub = await LearningSubscription.findActiveForClient({
        agencyId,
        clientId,
        at: session?.scheduled_start_at || null
      });
      if (!sub) {
        return { covered: false, mode, reason: 'no_active_subscription' };
      }
      const coveredCharge = await LearningSessionCharge.markCoveredByMode({
        chargeId: charge.id,
        mode: 'SUBSCRIPTION',
        metadataPatch: { subscriptionId: Number(sub.id), sessionId }
      });
      return { covered: true, mode, reason: 'subscription_active', charge: coveredCharge };
    }

    return { covered: false, mode, reason: 'pay_per_event' };
  }

  static async enqueueQuickbooksChargeSync({ agencyId, chargeId }) {
    const idempotencyKey = `learning_qbo_charge:${agencyId}:${chargeId}:create_invoice`;
    const jobId = await QuickbooksSyncJob.enqueue({
      agencyId,
      entityType: 'LEARNING_CHARGE',
      entityId: chargeId,
      operation: 'CREATE_INVOICE',
      idempotencyKey,
      payloadJson: { chargeId }
    });
    if (jobId) {
      await QuickbooksSyncJob.appendEvent({
        jobId,
        status: 'PENDING',
        requestJson: { chargeId },
        responseJson: null
      });
    }
    return jobId;
  }
}

export default LearningBillingOrchestrator;
