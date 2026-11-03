// Older rows can carry an attempt timestamp even when delivery was skipped.
export function hasCommunicationSendEvidence(item) {
  return Boolean(item?.direction === 'inbound' || item?.externalMessageId || item?.openedAt || item?.deliveredAt
    || ['sent', 'delivered'].includes(String(item?.deliveryStatus || '').toLowerCase()));
}

export function communicationTimestampLabel(item) {
  if (item?.direction === 'inbound') return 'Received:';
  return hasCommunicationSendEvidence(item) ? 'Sent:' : 'Recorded:';
}

export function communicationDeliveryStatus(item) {
  const status=String(item?.deliveryStatus || '').toLowerCase();
  if(item?.direction==='inbound')return {key:'received',label:'Received',tooltip:'Inbound message received'};
  if(['failed','skipped','flagged'].includes(status) && (item.openedAt || item.deliveredAt || item.externalMessageId)) {
    return {key:'review',label:'Delivery status needs review',tooltip:'A send receipt or tracking event conflicts with the recorded status. Verify this message before considering another send.'};
  }
  if(status==='flagged')return {key:'review',label:'Needs review',tooltip:item.errorMessage || 'Delivery is held or uncertain. Verify before resending.'};
  if(status==='skipped')return {key:'skipped',label:'Not sent (skipped)',tooltip:item.errorMessage || 'This message was intentionally skipped before delivery. No carrier audit is recorded.'};
  if(['failed','bounced','undelivered'].includes(status))return {key:'failed',label:status.toUpperCase(),tooltip:item.errorMessage || 'Delivery failed'};
  if(item?.openedAt && ['sent','delivered'].includes(status))return {key:'opened',label:'Sent, then opened',tooltip:'The message was sent. An email tracking image later loaded; that does not prove a person read it.'};
  if(item?.openedAt)return {key:'opened',label:'Opened',tooltip:'An email tracking image loaded; this does not prove a person read it.'};
  if((item?.deliveredAt || status==='delivered') && (item?.recipientAddress || item?.toNumber || item?.recipientUserName))return {key:'delivered',label:'Delivered',tooltip:'The provider reported delivery.'};
  if(status==='sent' && (item?.recipientAddress || item?.toNumber || item?.recipientUserName || item?.externalMessageId))return {key:'sent',label:'Sent',tooltip:'The transport accepted the message; inbox receipt is not confirmed.'};
  if(['pending','sending','queued'].includes(status)){
    const recordedAt = new Date(item?.sentAt || item?.occurredAt || item?.generatedAt || 0).getTime();
    if (Number.isFinite(recordedAt) && recordedAt > 0 && Date.now() - recordedAt > 15 * 60 * 1000) return {key:'unknown',label:'Delivery not recorded',tooltip:'This notice stayed unfinished. That is not proof it was sent.'};
    return {key:'pending',label:'Pending',tooltip:'Waiting to send'};
  }
  if(['delivered','sent'].includes(status))return {key:'unknown',label:'Delivery not recorded',tooltip:'A delivery label was stored without a recipient or send receipt.'};
  return {key:'unknown',label:status ? 'Delivery not recorded' : 'Delivery not recorded',tooltip:'No confirmed delivery status'};
}
