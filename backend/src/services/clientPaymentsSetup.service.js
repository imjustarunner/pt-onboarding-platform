import BillingMerchantContextService from './billingMerchantContext.service.js';

class ClientPaymentsSetupService {
  static async getSetupForAgency(agencyId) {
    const context = await BillingMerchantContextService.getAgencyClientPaymentsContext(agencyId);
    return {
      agencyId: context.agencyId,
      billingDomain: context.billingDomain,
      paymentsMode: context.paymentsMode,
      connectionOwnerType: context.connectionOwnerType,
      connectionOwnerId: context.connectionOwnerId,
      providerConnectionId: context.providerConnectionId,
      isConnected: !!context.connection?.is_connected,
      paymentsEnabled: !!context.connection?.qbo_payments_enabled
    };
  }
}

export default ClientPaymentsSetupService;
