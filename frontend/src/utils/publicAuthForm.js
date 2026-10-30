// Product entry pages can show either a sign-in form or an authenticated workspace
// at the same URL. Track the mounted form, rather than treating /app as public.
const forms = new Set();

export function enterPublicAuthForm() {
  const form = Symbol('public-auth-form');
  forms.add(form);
  return () => forms.delete(form);
}

export function isPublicAuthFormActive() {
  return forms.size > 0;
}
