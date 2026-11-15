export function attendanceLetterText(plan) {
  const data = plan.data || plan, scheduled = data.letterType === 'Scheduled appointment';
  const signer = plan.signers?.find(item => item.kind === 'clinician' && item.signedAt && !item.revokedAt);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(data.appointmentDate || '') ? new Intl.DateTimeFormat('en-US', {timeZone:'UTC',year:'numeric',month:'long',day:'numeric'}).format(new Date(`${data.appointmentDate}T12:00:00Z`)) : data.appointmentDate || '[date]';
  const time = value => { const match = /^(\d{2}):(\d{2})$/.exec(value || ''); return match ? `${Number(match[1]) % 12 || 12}:${match[2]} ${Number(match[1]) < 12 ? 'AM' : 'PM'}` : value || '[time]'; };
  let zone = data.timezone || 'time zone', signatureZone = 'UTC';
  try { if (data.timezone) { new Intl.DateTimeFormat('en',{timeZone:data.timezone}); signatureZone=data.timezone; } zone = new Intl.DateTimeFormat('en-US',{timeZone:data.timezone,timeZoneName:'long'}).formatToParts(new Date(`${data.appointmentDate}T12:00:00Z`)).find(part=>part.type==='timeZoneName')?.value || zone; } catch { /* Preserve a legacy staff-entered zone label. */ }
  const title = scheduled ? 'Appointment confirmation' : 'Appointment attendance verification';
  const body = [scheduled || data.attendanceStatus === 'Confirmed attended'
    ? `${data.personLabel || '[client]'} ${scheduled ? 'has an appointment scheduled' : 'attended an appointment'} on ${date}, from ${time(data.startTime)} to ${time(data.endTime)} (${zone}).`
    : 'Attendance has not yet been confirmed. This draft does not verify attendance.',
    `Location: ${data.location || '[location]'}.`,
    ...(data.excuseRequested === 'Yes' ? [`Please excuse the related absence${data.absenceFrom && data.absenceThrough ? ` from ${time(data.absenceFrom)} to ${time(data.absenceThrough)}` : ''}.`] : []),
    'This letter does not disclose a diagnosis or treatment details.'];
  const signedInstant = signer?.signedAt ? signer.signedAt instanceof Date ? signer.signedAt : new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(signer.signedAt)) ? signer.signedAt : String(signer.signedAt).replace(' ','T')+'Z') : null;
  const signedLabel = signedInstant ? new Intl.DateTimeFormat('en-US',{year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:signatureZone}).format(signedInstant) : '';
  const signature = signer ? `Electronically signed by ${signer.evidence?.name || signer.name || data.issuerName}, ${data.issuerTitle || ''}. Signed ${signedLabel}. Letter ${plan.id}, version ${plan.version}.`
    : `${data.issuerName || '[issuing staff]'}${data.issuerTitle ? `, ${data.issuerTitle}` : ''}`;
  return {title,body,signature,signer,text:[plan.branding?.name,title,'',...body,'',signature,...(data.contactPhone?[`Contact: ${data.contactPhone}`]:[])].filter(value=>value!==undefined).join('\n')};
}
