import QuickbooksSyncJob from '../models/QuickbooksSyncJob.model.js';

class LearningQuickbooksQueueService {
  static async enqueueChargeInvoice({ agencyId, chargeId }) {
    return await QuickbooksSyncJob.enqueue({
      agencyId,
      entityType: 'LEARNING_CHARGE',
      entityId: chargeId,
      operation: 'CREATE_INVOICE',
      idempotencyKey: `learning_qbo_charge:${agencyId}:${chargeId}:invoice`,
      payloadJson: { chargeId, event: 'CHARGE_CREATED' }
    });
  }

  static async enqueueCapturedPayment({ agencyId, paymentId }) {
    return await QuickbooksSyncJob.enqueue({
      agencyId,
      entityType: 'LEARNING_PAYMENT',
      entityId: paymentId,
      operation: 'CREATE_PAYMENT',
      idempotencyKey: `learning_qbo_payment:${agencyId}:${paymentId}:capture`,
      payloadJson: { paymentId, event: 'PAYMENT_CAPTURED' }
    });
  }
}

export default LearningQuickbooksQueueService;
