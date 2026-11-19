import { escapePortalHtml as e, portalMessageHtml } from './portalEmailBranding.service.js';
import { conversaEmailBlock, conversaEmailNote } from './conversaEmail.service.js';
import { secureMessageActionHtml } from './secureMessageAction.service.js';

export function clientEmailLabel(client = {}) {
  const parts = String(client.full_name || client.name || '').replace(/\s*[—–-]\s*(?:DEMO|FICTIONAL).*$/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0].slice(0, 2)}${parts.at(-1).slice(0, 2)}`.toUpperCase();
  return String(client.initials || parts[0] || 'Your dependent').slice(0, 4).toUpperCase();
}

export function portalActionHtml(label, url) {
  return `${portalMessageHtml({ text: url, linkUrl: url, linkLabel: label })}<p style="font-size:12px;line-height:1.5;overflow-wrap:anywhere;color:#627187">Or copy and paste this link into your browser:<br><a href="${e(url)}" style="color:#16457c">${e(url)}</a></p>`;
}

export function buildPaperPacketPortalEmail({ firstName, agencyName, schoolName, existingAccount, url, locale = 'en' }) {
  const spanish = String(locale).toLowerCase().startsWith('es');
  const copy = spanish ? {
    subject: `${agencyName}: recibimos su inscripción escolar`,
    greeting: firstName ? `Hola, ${firstName}:` : 'Hola:',
    heading: 'Recibimos su inscripción',
    received: schoolName
      ? `Recibimos su formulario de inscripción en papel para ${schoolName} y terminamos de procesarlo.`
      : 'Recibimos su formulario de inscripción escolar en papel y terminamos de procesarlo.',
    next: `El equipo de ${agencyName} está revisando su inscripción y se comunicará con usted para coordinar los próximos pasos.`,
    portal: existingAccount
      ? 'Puede iniciar sesión en su cuenta de AuricWell con el correo y la contraseña que ya usa.'
      : 'Su cuenta de AuricWell está lista. Cree su contraseña para iniciar sesión por primera vez.',
    action: existingAccount ? 'Iniciar sesión en AuricWell' : 'Crear mi contraseña',
    recovery: 'Para crear o recuperar su contraseña, seleccione Recuperación de contraseña en la página de inicio de sesión de AuricWell.com y use el correo que recibió este mensaje.',
    coordination: 'Coordinación escolar a través de SchoolCareBridge, un programa de MH4Kidz.'
  } : {
    subject: `${agencyName}: we received your school enrollment`,
    greeting: `Hi ${firstName || 'there'},`,
    heading: 'We received your enrollment',
    received: schoolName
      ? `We received and processed your paper enrollment packet for ${schoolName}.`
      : 'We received and processed your paper school enrollment packet.',
    next: `The ${agencyName} team is reviewing your enrollment and will be in touch about next steps.`,
    portal: existingAccount
      ? 'You can sign in to AuricWell with your existing email and password.'
      : 'Your AuricWell account is ready. Create a password to sign in for the first time.',
    action: existingAccount ? 'Sign in to AuricWell' : 'Create my password',
    recovery: 'To set a password or regain access, choose Password recovery on the AuricWell.com sign-in page and enter the email address that received this message.',
    coordination: 'School coordination through SchoolCareBridge, a program of MH4Kidz.'
  };
  return {
    subject: copy.subject,
    locale: spanish ? 'es' : 'en',
    text: [copy.greeting, copy.received, copy.next, copy.portal, `${copy.action}: ${url}`, copy.recovery, copy.coordination].join('\n\n'),
    html: `<div lang="${spanish ? 'es' : 'en'}"><p>${e(copy.greeting)}</p><h2>${e(copy.heading)}</h2>
      <p>${e(copy.received)}</p><p>${e(copy.next)}</p><p>${e(copy.portal)}</p>
      ${portalMessageHtml({ text: url, linkUrl: url, linkLabel: copy.action })}
      <p>${e(copy.recovery)}</p><p>${e(copy.coordination)}</p></div>`,
    linkUrl: url
  };
}

export function buildClientEnrollmentEmail({ firstName, agencyName, clients = [], learning = false, existingAccount = false, url, username = null, locale = 'en' }) {
  if(locale==='es') {
    const action=existingAccount?'Inicie sesión en su portal':'Configure su portal';
    const paragraphs=[`Hola ${firstName||''},`,`Bienvenido al portal de ${agencyName}. ${clients.map(clientEmailLabel).join(', ')}: la información y los servicios autorizados ya están disponibles en su cuenta.`,existingAccount?'Use su correo y contraseña actuales. No necesita otra cuenta.':'Cree su contraseña para ver citas, completar documentos y firmas, y administrar los pagos que correspondan a su acceso.',username?`Su correo para iniciar sesión es: ${username}`:'',`${action}: ${url}`,'Revise las preferencias de comunicación de cada perfil para elegir sus recordatorios. Los documentos y la información clínica solo se muestran a las cuentas autorizadas.'].filter(Boolean);
    return {subject:`${agencyName}: bienvenido a su portal`,text:paragraphs.join('\n\n'),html:`<div lang="es">${paragraphs.map(text=>`<p>${e(text)}</p>`).join('')}${portalActionHtml(action,url)}</div>`,linkUrl:url};
  }
  const labels = clients.map(clientEmailLabel).join(', '), count = clients.length || 1;
  const who = count === 1 ? 'Your dependent' : `Your ${count} dependents`;
  const service = learning ? 'tutoring services' : 'counseling services';
  const heading = existingAccount ? `${agencyName}: ${learning ? 'tutoring' : 'counseling'} access added` : `${agencyName}: welcome to your ${learning ? 'family' : 'AuricWell'} portal`;
  const introduction = `${who}${labels ? ` (${labels})` : ''} ${count === 1 ? 'has' : 'have'} been enrolled in ${service} with ${agencyName}.`;
  const details = existingAccount
    ? learning
      ? `Their ${agencyName} profile and tutoring information have been added to your existing account. Sign in to your ${agencyName} tutoring portal with your existing email and password, then select your dependent to view their tutoring dashboard, learning information, and appointments. Your other dependents remain available in the same account.`
      : `Their information and care profile have been added to your AuricWell portal. Sign in with your existing account and select your dependent to see their ${agencyName} care team, appointments, documents, and shared treatment plan. You do not need a new account or password.`
    : `Use one ${learning ? 'family' : 'AuricWell'} portal account for ${count === 2 ? 'both dependents' : count > 2 ? 'all your dependents' : 'your dependent'}. ${agencyName} is your ${learning ? 'tutoring' : 'care'} agency. Your account shows only the appointments, forms, payment information and updates authorized for you. Set your password below to get started.`;
  const greeting = `Hi ${firstName || 'there'},`, action = existingAccount ? 'View your dependents' : 'Set up your portal';
  const preferences = 'Review your notification preferences in the portal to choose which reminders you receive.';
  const signIn = username ? `Your sign-in email (username): ${username}` : '';
  const nextTime = existingAccount ? '' : 'After saving your password, you will be signed in automatically. On your own device, you can save your password when your browser offers. Next time, use your email and password from the Portal login button on our website.';
  return { subject: heading, text: `${greeting}\n\n${introduction}\n\n${details}\n\n${signIn ? `${signIn}\n\n` : ''}${action}:\n${url}\n\n${nextTime ? `${nextTime}\n\n` : ''}${preferences}`,
    html: `<p>${e(greeting)}</p><h2 style="font-size:22px;line-height:1.3">${existingAccount ? 'Your account has new access' : 'Welcome to your portal'}</h2><p>${e(introduction)}</p><p>${e(details)}</p>${username ? `<p>Your sign-in email (username): <strong style="overflow-wrap:anywhere">${e(username)}</strong></p>` : ''}${portalActionHtml(action, url)}${nextTime ? `<p>${e(nextTime)}</p>` : ''}<p>${e(preferences)}</p>`, linkUrl: url };
}

export function buildFamilyBillingEmail({ kind, agencyName, url,locale='en' }) {
  if(locale==='es'){
    const subject=kind==='balance'?`${agencyName}: hay un nuevo pago pendiente`:kind==='payment_setup'?'Complete la configuración de su pago':'Su estado de cuenta está disponible';
    const body=kind==='payment_setup'?'Verifique su método de pago y complete su autorización de facturación.':'Inicie sesión en su portal seguro para revisar los saldos asignados a usted, los pagos y los recibos disponibles.';
    return {subject,text:`${agencyName}\n\n${body}\n\nAbrir Facturación:\n${url}\n\nGuardar una tarjeta o recibir este aviso no autoriza un nuevo cobro. Contacte a Facturación si necesita ayuda.`,html:`<div lang="es"><h2>${e(subject)}</h2><p>${e(body)}</p>${portalActionHtml('Abrir Facturación',url)}<p>Guardar una tarjeta o recibir este aviso no autoriza un nuevo cobro. Contacte a Facturación si necesita ayuda.</p></div>`,linkUrl:url};
  }
  const copy = kind === 'payment_setup'
    ? { subject:'Complete your payment setup', body:'Please verify your payment method and complete your billing authorization.', action:'Complete payment setup' }
    : kind === 'balance'
      ? { subject:`${agencyName}: a new payment is due`, body:'A new payment is due. Sign in to your secure portal to view service dates, payment details, and the amount assigned to you.', action:'View billing' }
      : { subject:'Your account statement is ready', body:'Please sign in to review your account statement. You can make a payment or contact our billing team for assistance.', action:'View my statement' };
  const footer = kind === 'balance' ? 'Statements are shared with authorized guardians. Saving a card or receiving this notification does not authorize a new charge. Contact billing if you need help.' : 'Sign in with the account that received this invitation.';
  return { subject:copy.subject, text:`${agencyName}\n\n${copy.body}\n\n${copy.action}:\n${url}\n\n${footer}`,
    html:`<h2 style="font-size:22px">${e(copy.subject)}</h2><p>${e(copy.body)}</p>${portalActionHtml(copy.action,url)}<p>${e(footer)}</p>`,linkUrl:url };
}

export function buildTreatmentPlanEmail({ client, recipientName, url, expires = false }) {
  const label = clientEmailLabel(client);
  const text = `Hi ${recipientName || 'there'},\n\nPlease review and sign the treatment plan for ${label}.\n\n${url}${expires ? '\n\nThis link expires in 14 days.' : ''}`;
  return { subject:'Please review and sign the treatment plan', text,
    html:`<p>Hi ${e(recipientName || 'there')},</p><p>Please review and sign the treatment plan for <strong>${e(label)}</strong>.</p>${portalActionHtml('Review treatment plan',url)}${expires ? '<p>This link expires in 14 days.</p>' : ''}`,linkUrl:url };
}
export function buildSecureMessageEmail({agencyName,clinical=true,url,forDependent=false,senderName=null}) {
  const portal=clinical?'AuricWell':`${agencyName} portal`;
  const subject=forDependent ? `New message on your dependent's account in ${portal}` : `You have a secure message in ${portal}`;
  const intro=forDependent
    ? `A new message has been posted to your dependent's account. Please sign in to ${portal} to read this message and reply.`
    : `A new message has been posted in your secure conversation. Please sign in to ${portal} to read this message and reply.`;
  const sender=senderName?`${senderName} at ${agencyName} sent you a secure message. `:'';
  const note='Your message stays inside your secure portal. This email does not include its contents. Please reply in the portal.';
  return {subject,text:`${sender}${intro}\n\nRead secure message:\n${url}\n\n${note}${clinical ? `\n\n${conversaEmailNote}` : ''}`,
    html:`<h2>You have a secure message</h2><p>${e(sender+intro)}</p>${secureMessageActionHtml(url)}<p>${e(note)}</p>${clinical ? conversaEmailBlock() : ''}`};
}
