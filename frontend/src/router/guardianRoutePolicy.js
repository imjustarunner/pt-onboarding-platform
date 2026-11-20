// Receipt routes still enforce authenticated payer ownership at the API.
// This exception only lets a family stay on its receipt instead of redirecting.
export function isGuardianReceiptRoute(route) {
  return ['PaymentReceipt','OrganizationPaymentReceipt'].includes(String(route?.name || ''))
    && /^\d+$/.test(String(route?.params?.paymentId || ''));
}

// This is the public waiting room, not the employee's private office. Visit
// credentials, appointment windows and admission remain enforced by its API.
export function isGuardianOfficeJoinRoute(route) {
  const slug = String(route?.params?.slug || '');
  return route?.name === 'JoinMyRoom'
    && /^\/join\/my-room\/[^/]+\/?$/.test(String(route?.path || ''))
    && /^[^/\\\u0000-\u001f\u007f]{1,200}$/.test(slug)
    && !['.', '..'].includes(slug);
}

export function isGuardianWorkspaceRoute(route) {
  const path = String(route?.path || '');
  return isGuardianReceiptRoute(route) || isGuardianOfficeJoinRoute(route)
    || ['VirtualTutoringAppointment','OrganizationVirtualTutoringAppointment'].includes(route?.name)
    || path === '/my-portal' || path === '/guardian'
    || path.endsWith('/guardian') || path.includes('/guardian/')
    || path.endsWith('/client-dashboard') || path.includes('/client-dashboard')
    || ['/tutoring-session/', '/in-person-tutoring-session/', '/billing/complete'].some(prefix => path.includes(prefix));
}
