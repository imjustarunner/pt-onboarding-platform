export function sameDayServiceWarningMessage(data) {
  const services = (data?.warnings || []).map(w => `${w.date} · ${w.providerName || 'Provider not assigned'}${w.serviceCode ? ` · ${w.serviceCode}` : ''}`);
  return [data?.error?.message || 'This client already has a service on this date.', ...services, '',
    'Choose Cancel to select another date, or OK to continue scheduling this date. Billing still requires review.'].join('\n');
}
