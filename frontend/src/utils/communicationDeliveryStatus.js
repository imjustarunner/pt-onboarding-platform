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
  if(status==='skipped')return {key:'skipped',label:'Not sent',tooltip:item.errorMessage || 'This message was intentionally skipped before delivery.'};
  if(['failed','bounced','undelivered'].includes(status))return {key:'failed',label:status.toUpperCase(),tooltip:item.errorMessage || 'Delivery failed'};
  if(item?.openedAt)return {key:'opened',label:'Opened',tooltip:'An email tracking image loaded; this does not prove a person read it.'};
  if(item?.deliveredAt || status==='delivered')return {key:'delivered',label:'Delivered',tooltip:'The provider reported delivery.'};
  if(status==='sent')return {key:'sent',label:'Sent',tooltip:'The transport accepted the message; inbox receipt is not confirmed.'};
  if(status==='pending')return {key:'pending',label:'Pending',tooltip:'Waiting to send'};
  return {key:'unknown',label:status || 'Unknown',tooltip:'No confirmed delivery status'};
}
