import { escapePortalHtml as e, portalMessageHtml } from './portalEmailBranding.service.js';

/** A receipt contains no answers, child identities, or signed attachments. */
export function enrollmentConfirmationContent({ portalLoginUrl = null, locale = 'en', agencyName = '', school = false } = {}) {
  const es = String(locale).toLowerCase().startsWith('es');
  const c = es ? {
    subject: 'Inscripción recibida', heading: 'Gracias por dar este paso con nosotros.',
    intro: 'Recibimos su inscripción y guardamos la información que compartió. Gracias por tomarse el tiempo de completarla.',
    next: '¿Qué sigue?', review: 'Nuestro equipo revisará su inscripción y se comunicará con usted para coordinar los próximos pasos.',
    school: 'Si los servicios se ofrecen en la escuela, coordinaremos los próximos pasos con el equipo escolar según sus autorizaciones.',
    booking: 'Si eligió un profesional o un horario, lo revisaremos con usted. La inscripción por sí sola no confirma una cita.',
    portal: 'En su portal puede consultar los documentos y mensajes que su equipo comparta con usted.',
    setup: '¿Es su primera visita? En la página de inicio de sesión, solicite un enlace para crear su contraseña con el correo que utilizó al inscribirse.',
    action: 'Abrir mi portal', help: 'Si tiene preguntas o necesita ayuda para comenzar, comuníquese con nuestro equipo.',
    thanks: 'Estamos aquí para ayudarle,', signature: agencyName ? `El equipo de ${agencyName}` : 'Su equipo de atención'
  } : {
    subject: 'Enrollment received', heading: 'Thank you for taking this step with us.',
    intro: 'We received your enrollment and saved the information you shared. Thank you for taking the time to complete it.',
    next: 'What happens next?', review: 'Our team will review your enrollment and contact you to coordinate the next steps.',
    school: 'For services at school, we will coordinate next steps with the school team according to your permissions.',
    booking: 'If you requested a provider or time, we will review that preference with you. Enrollment alone does not confirm an appointment.',
    portal: 'Your portal is where you can find documents and messages shared by your team.',
    setup: 'First visit? Request a password setup link on the sign-in page using the email you enrolled with.',
    action: 'Open my portal', help: 'If you have questions or need help getting started, please contact our team.',
    thanks: 'We’re here to help,', signature: agencyName ? `Your ${agencyName} care team` : 'Your care team'
  };
  const next = [c.review, school ? c.school : c.booking];
  const portal = portalLoginUrl ? [c.portal, c.setup, `${c.action}: ${portalLoginUrl}`] : [];
  return {
    templateType: 'enrollment_submission_confirmation', subject: c.subject, locale: es ? 'es' : 'en', attachments: null,
    text: [c.heading, c.intro, c.next, ...next, ...portal, c.help, `${c.thanks}\n${c.signature}`].join('\n\n'),
    html: `<h1 style="margin:0 0 16px;font-size:25px;line-height:1.3;color:#16457c">${e(c.heading)}</h1><p>${e(c.intro)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#f0f6fa;border:1px solid #dce8f0;border-radius:8px"><tr><td style="padding:20px">
      <h2 style="margin:0 0 12px;font-size:18px;color:#16457c">${e(c.next)}</h2>${next.map(line => `<p style="margin:0 0 10px">${e(line)}</p>`).join('')}</td></tr></table>
      ${portalLoginUrl ? `<p>${e(c.portal)}</p>${portalMessageHtml({text: portalLoginUrl, linkUrl: portalLoginUrl, linkLabel: c.action})}<p style="font-size:14px;color:#53657a">${e(c.setup)}</p>` : ''}
      <p>${e(c.help)}</p><p style="margin-top:28px">${e(c.thanks)}<br><strong>${e(c.signature)}</strong></p>`
  };
}
