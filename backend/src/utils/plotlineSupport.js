export const PLOTLINE_SUPPORT_SOURCE = 'plotline_platform_support';
export const PLOTLINE_SUPPORT_URL = 'https://plotlinepo.com/support';
export function plotlineSupportUrl(referenceToken) {
  return /^[a-f0-9]{64}$/i.test(referenceToken || '')
    ? `https://plotlinepo.com/public/hiring/reference/${referenceToken}/support`
    : PLOTLINE_SUPPORT_URL;
}
