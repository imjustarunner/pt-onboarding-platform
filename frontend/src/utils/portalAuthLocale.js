import { ref, watch, onBeforeUnmount } from 'vue';

export const portalAuthSpanish = {
  'Loading...':'Cargando…', 'Setup Error':'Error al configurar su cuenta', 'Welcome, {name}!':'¡Bienvenido, {name}!',
  'Create your password to get started. You will be signed in automatically after you save it.':'Cree su contraseña para comenzar. Su sesión se iniciará automáticamente después de guardarla.',
  'On your own device, you can save your password when your browser offers. Next time, use this email and your password.':'En su propio dispositivo puede guardar la contraseña cuando el navegador lo ofrezca. La próxima vez, use este correo y su contraseña.',
  'Choose your password':'Elija su contraseña', 'Confirm Password':'Confirme la contraseña', 'Re-enter your password':'Vuelva a escribir su contraseña',
  'Client’s date of birth':'Fecha de nacimiento del cliente', 'Create password and continue':'Crear contraseña y continuar',
  'Enter your date of birth if you are also a client, or the date of birth of any one of your linked dependents to finish opening your account.':'Ingrese su fecha de nacimiento si también es cliente, o la de uno de sus dependientes vinculados para terminar de abrir su cuenta.',
  'Enter your date of birth to finish opening your portal account.':'Ingrese su fecha de nacimiento para terminar de abrir su cuenta del portal.',
  'Invalid setup link. Token is missing.':'El enlace de configuración no es válido. Solicite uno nuevo.',
  'Invalid or expired setup link.':'El enlace de configuración no es válido o ha vencido.', 'Failed to set up account.':'No se pudo configurar su cuenta.',
  'Waiting for your device…':'Esperando su dispositivo…', 'Sign in with a passkey':'Iniciar sesión con una clave de acceso',
  'Invalid or expired setup link. Please contact your administrator.':'El enlace no es válido o ha vencido. Comuníquese con su equipo de atención.',
  'Invalid setup link':'El enlace de configuración no es válido', 'Failed to set password. Please try again.':'No se pudo guardar su contraseña. Inténtelo de nuevo.',
  'Your password was saved. Sign in to continue.':'Se guardó su contraseña. Inicie sesión para continuar.',
  'Sign in to your {agency} AuricWell portal':'Inicie sesión en su portal AuricWell de {agency}',
  'Sent ({seconds}s)':'Enviado ({seconds}s)',
  'Invalid email or password':'El correo o la contraseña no son correctos',
  'Username not found. Please check and try again.':'No se encontró ese correo de acceso. Revíselo e inténtelo de nuevo.',
  'User not found. Check your username or contact Technology for sign-in help.':'No se encontró la cuenta. Revise su nombre de usuario o comuníquese con el equipo de Tecnología para recibir ayuda con el acceso.',
  'This account is not available through employee onboarding. Use your regular portal sign-in or contact Technology for help.':'Esta cuenta no está disponible en la incorporación de empleados. Use el acceso habitual de su portal o comuníquese con el equipo de Tecnología para recibir ayuda.',
  'Contact Technology for sign-in help':'Contactar a Tecnología para recibir ayuda con el acceso',
  'Verification failed. Please try again.':'No se pudo verificar. Inténtelo de nuevo.',
  'Account has been archived. Access denied.':'Esta cuenta está archivada. Comuníquese con su equipo de atención para revisar el acceso.',
  'Account is inactive. Access denied.':'Esta cuenta está inactiva. Comuníquese con su equipo de atención.',
  'Account access has expired. Please contact your administrator.':'El acceso de esta cuenta ha vencido. Comuníquese con su equipo de atención.',
  'Account is not accessible. Please contact your administrator.':'No se puede acceder a esta cuenta. Comuníquese con su equipo de atención.',
  'Invalid token or last name does not match':'El enlace no es válido o el apellido no coincide',
  'We could not submit your request. Please try again in a few minutes.':'No se pudo enviar su solicitud. Inténtelo de nuevo en unos minutos.',
  'Security verification did not complete. Please refresh and try again.':'No se completó la verificación de seguridad. Actualice e inténtelo de nuevo.',
  'Loading…':'Cargando…', 'Reset Error':'Error al restablecer la contraseña', 'Go to Login':'Ir a iniciar sesión',
  'Password saved':'Contraseña guardada', 'Set your password':'Establezca su contraseña', 'Hi {name},':'Hola {name},',
  'Choose a new password for your account.':'Elija una contraseña nueva para su cuenta.',
  'Your sign-in username':'Su nombre de usuario para iniciar sesión',
  'You will be signed in after saving. On your own device, you can save your password when your browser offers.':'Después de guardar, se iniciará su sesión. En su propio dispositivo puede guardar la contraseña cuando su navegador lo ofrezca.',
  'Your job title / role at the school':'Su cargo o función en la escuela', 'e.g. Counselor, Assistant Principal':'Por ejemplo: consejero, subdirector',
  'New Password':'Contraseña nueva', 'Choose a new password':'Elija una contraseña nueva',
  'Confirm New Password':'Confirme la contraseña nueva', 'Re-enter your new password':'Vuelva a escribir la contraseña nueva',
  'Hide password':'Ocultar contraseña', 'Show password':'Mostrar contraseña', 'Hide':'Ocultar', 'Show':'Mostrar',
  'Saving and signing you in…':'Guardando e iniciando su sesión…', 'Save password and continue':'Guardar contraseña y continuar',
  'Passwords do not match':'Las contraseñas no coinciden', 'Passwords match':'Las contraseñas coinciden',
  'Password is required':'Se requiere una contraseña', 'Password must be at least 10 characters':'La contraseña debe tener al menos 10 caracteres',
  'Password must be no more than 128 characters':'La contraseña debe tener un máximo de 128 caracteres',
  'Password must contain at least one letter (a–z or A–Z)':'La contraseña debe contener al menos una letra (a–z o A–Z)',
  'Password must contain at least one number (0–9)':'La contraseña debe contener al menos un número (0–9)',
  'Invalid reset link. Token is missing.':'El enlace no es válido. Solicite un enlace nuevo para establecer su contraseña.',
  'This reset link could not be validated. Please request a new password reset link.':'No se pudo validar este enlace. Solicite un enlace nuevo para restablecer la contraseña.',
  'Invalid or expired reset link.':'El enlace no es válido o ha vencido.', 'Failed to reset password.':'No se pudo restablecer la contraseña.',
  'Identity Verification':'Verificación de identidad', 'Please enter your last name to continue:':'Ingrese su apellido para continuar:',
  'Last Name':'Apellido', 'Verifying...':'Verificando…', 'Verifying…':'Verificando…', 'Continue':'Continuar',
  'Logging you in...':'Iniciando su sesión…', 'Login Failed':'No se pudo iniciar sesión', 'Login Successful':'Sesión iniciada', 'Redirecting...':'Redirigiendo…',
  'Invalid login link. Token is missing.':'El enlace de acceso no es válido. Solicite un enlace nuevo.',
  'Invalid login link. Token format is invalid.':'El enlace de acceso no es válido. Solicite un enlace nuevo.',
  'Invalid or expired login link. Please contact your administrator.':'El enlace no es válido o ha vencido. Comuníquese con su equipo de atención.',
  'Please enter your last name':'Ingrese su apellido', 'Email address':'Correo electrónico', 'Email':'Correo electrónico',
  'Username':'Correo de acceso', 'Enter your username':'Ingrese su correo de acceso', 'Work email':'Correo de trabajo',
  'Password':'Contraseña', 'Enter your password':'Ingrese su contraseña', 'Use another account':'Usar otra cuenta',
  'Remember me on this browser':'Recordarme en este navegador', 'Forgot password?':'¿Olvidó su contraseña?',
  'Forgot Password?':'¿Olvidó su contraseña?', 'Forgot Username?':'¿Olvidó su correo de acceso?',
  'Sign In':'Iniciar sesión', 'Signing in...':'Iniciando sesión…', 'Verify':'Verificar', 'Change username':'Cambiar correo de acceso',
  'Choose your organization':'Elija su organización', 'Select an organization':'Seleccione una organización',
  'Contact us':'Contáctenos', 'Sign in to continue':'Inicie sesión para continuar', 'Welcome back':'Le damos la bienvenida',
  'Welcome back, {name}':'Le damos la bienvenida, {name}', 'Security':'Seguridad', 'Keep your sign-in secure':'Proteja su acceso',
  'Use your saved work bookmark to sign in. If an unexpected document asks you to log in, close it and open your bookmark instead. Keep your password and authenticator codes private.':'Use su marcador guardado para iniciar sesión. Si un documento inesperado le pide iniciar sesión, ciérrelo y abra su marcador. Mantenga su contraseña y sus códigos de autenticación en privado.',
  'Reset your password':'Restablezca su contraseña', 'work or personal email':'Su correo electrónico',
  'Send reset link':'Enviar enlace', 'Cancel':'Cancelar', 'Close':'Cerrar', 'Sending…':'Enviando…', 'Sending...':'Enviando…',
  'Check Junk / Spam.':'Revise Correo no deseado / Spam.',
  'If the email matches an account, you will receive a reset link shortly.':'Si el correo coincide con una cuenta, recibirá pronto un enlace para establecer su contraseña.',
  'Enter your email to receive a link to set or reset your portal password.':'Ingrese su correo para recibir un enlace y establecer o restablecer su contraseña del portal.',
  'At least 10 characters':'Al menos 10 caracteres', 'Contains a letter (a–z or A–Z)':'Contiene una letra (a–z o A–Z)',
  'Contains a number (0–9)':'Contiene un número (0–9)', 'Contains a symbol':'Contiene un símbolo',
  '(optional, strengthens password)':'(opcional, refuerza la contraseña)', 'Password requirements':'Requisitos de la contraseña',
  'Password strength: {strength}':'Seguridad de la contraseña: {strength}', 'Does not meet requirements':'No cumple los requisitos',
  'Weak':'Débil', 'Fair':'Aceptable', 'Strong':'Segura', 'Very strong':'Muy segura',
  'Too long — maximum 128 characters ({length}/128)':'Demasiado larga: máximo 128 caracteres ({length}/128)',
  'Sign in to your account':'Inicie sesión en su cuenta', 'or use password':'o use su contraseña'
};

export function portalAuthText(locale, text, values = {}) {
  const result = locale === 'es' ? portalAuthSpanish[text] || text : text;
  return String(result ?? '').replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}
export function portalAuthError(error, locale, fallback) {
  const message = error?.response?.data?.error?.message || error?.message || fallback;
  if (locale !== 'es' || portalAuthSpanish[message]) return portalAuthText(locale, message);
  const status = error?.response?.status;
  if (status === 410) return 'Este enlace ha vencido. Solicite un enlace nuevo.';
  if (status === 409) return 'La información cambió o la operación ya se inició. Actualice la página antes de intentar de nuevo.';
  if (status === 429) return 'Espere unos minutos antes de volver a intentarlo.';
  if (status === 400 || status === 422) return 'Revise los datos ingresados y vuelva a intentarlo.';
  if (status === 401 || status === 403) return 'No se pudo verificar este acceso. Revise sus datos o solicite un enlace nuevo al equipo de atención.';
  return portalAuthText(locale, fallback);
}
export function portalAuthLanguage(route) {
  const direct = route?.query?.lang;
  if (['en','es'].includes(direct)) return direct;
  try { const language = new URL(String(route?.query?.redirect || ''), 'https://portal.invalid').searchParams.get('lang'); if (['en','es'].includes(language)) return language; } catch { /* No redirect language. */ }
  try { return sessionStorage.getItem('portalAuthLanguage') === 'es' ? 'es' : 'en'; } catch { return 'en'; }
}
export function rememberAuthenticatedPortalLanguage(user, locale) {
  if (!user?.id || !['client','client_guardian','guardian'].includes(user.role) || !['en','es'].includes(locale)) return;
  try { localStorage.setItem(`familyPortalLanguage:${user.id}`, locale); } catch { /* Language still travels in the URL. */ }
}
export function withPortalAuthLanguage(target, locale) {
  if (!['en','es'].includes(locale)) return target;
  if (target && typeof target === 'object') return locale === 'es' || target.query?.lang ? { ...target, query:{ ...target.query, lang:locale } } : target;
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) return target;
  const url = new URL(target, 'https://portal.invalid');
  if (locale === 'es' || url.searchParams.has('lang')) url.searchParams.set('lang', locale);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function usePortalAuthLocale(route) {
  const locale = ref(portalAuthLanguage(route));
  const previous = document.documentElement.lang;
  function setLocale(value) { locale.value = value === 'es' ? 'es' : 'en'; }
  watch(() => route?.query?.lang, value => { if (['en','es'].includes(value)) setLocale(value); });
  watch(locale, value => { document.documentElement.lang = value; try { sessionStorage.setItem('portalAuthLanguage', value); } catch { /* Optional preference. */ } }, { immediate:true });
  onBeforeUnmount(() => { document.documentElement.lang = previous; });
  return { locale, setLocale, text:(text, values) => portalAuthText(locale.value, text, values) };
}
