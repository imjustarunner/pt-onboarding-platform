/** Public response forms are served on the same product host as the email brand. */
export function appointmentResponseUrl(token, context) {
  const origin = context?.clinical ? 'https://auricwell.com' : new URL(context.url('')).origin;
  return `${origin}/api/public/appointment-response/${encodeURIComponent(token)}`;
}
