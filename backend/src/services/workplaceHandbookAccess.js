const originalDocumentRoles = new Set(['admin', 'super_admin', 'superadmin']);

export function canAccessHandbookOriginal(user) {
  return originalDocumentRoles.has(String(user?.role || '').toLowerCase());
}

// Call only after the endpoint's tenant/recipient authorization. Recipient links
// deliberately pass no user, even when opened by someone signed in as an admin.
export function handbookResponseForReader(payload, user = null) {
  const canPrint = canAccessHandbookOriginal(user);
  const stripOriginalUrls = (value, insideHandbookResource = false) => {
    if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
    if (Array.isArray(value)) return value.map(child => stripOriginalUrls(child, insideHandbookResource));
    const handbookResource = insideHandbookResource || value.kind === 'handbook';
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['fullHandbookUrl', 'full_handbook_url', 'handbookUrl', 'handbook_full_url', 'handbook_ack_url'].includes(key) && !(handbookResource && key === 'url'))
      .map(([key, child]) => key === 'handbookLinks' ? [key, { fullUrl: null, acknowledgementUrl: null }] : [key, child])
      .map(([key, child]) => [key, stripOriginalUrls(child, handbookResource)]));
  };
  // Preserve legacy source URLs in storage/history, but never use them in app flows.
  return { ...stripOriginalUrls(payload), access: { canOpenOriginal: false, canPrint } };
}
