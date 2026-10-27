import pool from '../config/database.js';

export async function familyEnrollmentContext(userId, agencyId, db = pool) {
  const [rows] = await db.execute(
    `SELECT il.language_code, il.master_channel,
       CASE WHEN il.scope_type='school' THEN il.organization_id ELSE NULL END AS school_id
     FROM intake_submissions s
     JOIN intake_links il ON il.id=s.intake_link_id
     JOIN intake_submission_clients isc ON isc.intake_submission_id=s.id
     JOIN clients c ON c.id=isc.client_id
     JOIN client_guardians cg ON cg.client_id=c.id
       AND cg.guardian_user_id=s.guardian_user_id AND cg.access_enabled=1
     WHERE s.guardian_user_id=? AND s.status='submitted' AND c.agency_id=?
     ORDER BY s.submitted_at DESC, s.id DESC LIMIT 1`,
    [userId, agencyId]
  );
  const row = rows?.[0];
  return {
    agencyId,
    locale: String(row?.language_code || 'en').toLowerCase().startsWith('es') ? 'es' : 'en',
    channel: row?.master_channel || null,
    schoolOrganizationId: row?.school_id || null
  };
}

export function familyRecoveryMessage({ locale, firstSet, resetLink, loginEmail, expiresInHours }) {
  const spanish = locale === 'es';
  const title = spanish
    ? (firstSet ? 'Cree su contraseña' : 'Restablezca su contraseña')
    : (firstSet ? 'Set your password' : 'Reset your password');
  const paragraphs = spanish ? [
    title,
    `Use este enlace para ${firstSet ? 'crear' : 'restablecer'} su contraseña. Caduca en ${expiresInHours} horas:\n${resetLink}`,
    `Su correo para iniciar sesión es: ${loginEmail}`,
    'Si no solicitó este mensaje, puede ignorarlo. Su contraseña no cambia hasta que abra el enlace y guarde una nueva. Revise también la carpeta de correo no deseado si espera otros mensajes.'
  ] : [
    title,
    `Use this link to ${firstSet ? 'set' : 'reset'} a password for your account so you can sign in. It expires in ${expiresInHours} hours:\n${resetLink}`,
    `Your login email / username is: ${loginEmail}`,
    'You can ignore this email if you did not request it. Your password changes only after you open the link and save a new one. Please also check Junk or Spam for messages you are expecting.'
  ];
  const escape = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  return {
    subject: title,
    body: paragraphs.join('\n\n'),
    html: `<div lang="${spanish ? 'es' : 'en'}">${paragraphs.map(p => `<p>${escape(p).replaceAll('\n', '<br>')}</p>`).join('')}<p><a href="${escape(resetLink)}">${title}</a></p></div>`,
    resetLink,
    firstSet,
    loginEmail
  };
}
