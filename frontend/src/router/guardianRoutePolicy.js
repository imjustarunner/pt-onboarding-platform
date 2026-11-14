// Receipt routes still enforce authenticated payer ownership at the API.
// This exception only lets a family stay on its receipt instead of redirecting.
export function isGuardianReceiptRoute(route) {
  return ['PaymentReceipt','OrganizationPaymentReceipt'].includes(String(route?.name || ''))
    && /^\d+$/.test(String(route?.params?.paymentId || ''));
}
