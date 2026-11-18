const time = value => value ? new Date(value).getTime() : NaN;
export function pollDeliveryHistory({ logs, smsDeliveries, emailDeliveries = [], users, responses, views }) {
  const receipts = new Map(smsDeliveries.filter(d => d.providerMessageId).map(d => [d.providerMessageId, d]));
  const matched = new Set();
  const history = logs.map(log => {
    const receipt = log.channel === 'sms' ? receipts.get(log.twilioSid) : null;
    const email = log.channel === 'email' ? emailDeliveries.find(item => Number(item.user_id) === Number(log.userId) && ((log.communicationId && Number(item.id) === Number(log.communicationId)) || (log.externalId && item.external_message_id === log.externalId))) : null;
    if (receipt) matched.add(receipt.id);
    return { ...log, status: receipt?.status || email?.delivery_status || log.status, statusReason: receipt?.statusReason || (email && ['sent','delivered'].includes(email.delivery_status) ? null : log.statusReason),
      sentAt: receipt?.sentAt || email?.sent_at || log.sentAt, deliveredAt: receipt?.deliveredAt || email?.delivered_at || null, failedAt: receipt?.failedAt || null };
  });
  for (const receipt of smsDeliveries) if (!matched.has(receipt.id)) history.push({ ...receipt, id: `sms-${receipt.id}`, channel: 'sms', viewedAt: null });
  const loggedEmails = new Set(logs.filter(log=>log.channel==='email').map(log=>Number(log.communicationId)).filter(Boolean));
  for (const email of emailDeliveries) if (!loggedEmails.has(Number(email.id)) && !logs.some(log=>log.externalId && log.externalId===email.external_message_id)) history.push({
    id:`email-${email.id}`,userId:Number(email.user_id),name:users.find(user=>Number(user.id)===Number(email.user_id))?.name || [users.find(user=>Number(user.id)===Number(email.user_id))?.first_name,users.find(user=>Number(user.id)===Number(email.user_id))?.last_name].filter(Boolean).join(' '),
    channel:'email',dispatchType:email.template_type?.endsWith('invitation')?'vote_invite':'poll_followup',status:email.delivery_status,statusReason:email.error_message,
    createdAt:email.generated_at,sentAt:email.sent_at,deliveredAt:email.delivered_at
  });
  history.sort((a,b) => time(b.createdAt) - time(a.createdAt));
  const firstInvitation = Math.min(...history.filter(log => log.dispatchType === 'vote_invite' && ['sent','delivered'].includes(log.status)).map(log => time(log.sentAt || log.createdAt)));
  return { logs: history, recipients: users.map(user => {
    const id = Number(user.id), response = responses.find(r => Number(r.user_id) === id), view = views.find(v => Number(v.user_id) === id);
    const sent = history.filter(log => Number(log.userId) === id && ['sent','delivered','queued'].includes(log.status));
    return { userId: id, name: [user.first_name,user.last_name].filter(Boolean).join(' ') || user.email,
      answeredAt: response?.received_at || null, responseSource: response?.source || null,
      firstViewedAt: view?.first_viewed_at || null, lastViewedAt: view?.last_viewed_at || null,
      status: response ? 'answered' : sent.length ? 'awaiting_reply' : 'not_sent',
      explanation: response && !sent.length && time(response.received_at) <= firstInvitation
        ? `Already answered ${response.source === 'sms' ? 'by text' : 'in the app'}; no additional invitation was needed.`
        : response ? 'Response received; follow-ups are skipped.' : sent.length ? 'Invitation recorded; no response yet.' : 'No invitation recorded. Use Send poll to invite this person.' };
  }) };
}
