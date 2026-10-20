const EMAIL_ASSET_REVISION = '20261020';

// Give mail image proxies a fresh URL without changing the stored artwork.
// Only public branding/profile assets on our own origins are eligible.
export function refreshEmailBrandImageUrls(html, publicOrigins = []) {
  const origins = new Set(publicOrigins.filter(Boolean).flatMap(value => {
    try { return [new URL(value).origin]; } catch { return []; }
  }));
  return String(html || '').replace(/\b(src|background)\s*=\s*(["'])(.*?)\2/gi, (attribute, name, quote, raw) => {
    try {
      const url = new URL(raw.replace(/&amp;/g, '&'));
      if (!origins.has(url.origin) ||
          !/^\/(?:uploads\/(?:logos|user_photos)\/|email-signatures\/staff-html\/|email-branding\/)/.test(url.pathname) ||
          [...url.searchParams.keys()].some(key => /signature|token|credential/i.test(key))) return attribute;
      url.searchParams.set('pt_email_asset', EMAIL_ASSET_REVISION);
      return `${name}=${quote}${url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}${quote}`;
    } catch {
      return attribute;
    }
  });
}
