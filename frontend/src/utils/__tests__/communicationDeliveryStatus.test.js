import {expect,it} from 'vitest';
import {communicationDeliveryStatus as status, communicationTimestampLabel, hasCommunicationSendEvidence} from '../communicationDeliveryStatus';
it.each(['failed','skipped','flagged'])('shows the contradiction for %s mail with a receipt',deliveryStatus=>{
  expect(status({deliveryStatus,externalMessageId:'accepted',openedAt:'2026-11-01'})).toMatchObject({key:'review',label:'Delivery status needs review'});
});
it('does not treat an old attempt timestamp as a successful send',()=>{
  for (const deliveryStatus of ['skipped','failed','pending','flagged']) {
    const item={deliveryStatus,sentAt:'2026-11-01T07:30:00Z'};
    expect(hasCommunicationSendEvidence(item)).toBe(false);
    expect(communicationTimestampLabel(item)).toBe('Recorded:');
  }
  expect(hasCommunicationSendEvidence({deliveryStatus:'failed',externalMessageId:'receipt'})).toBe(true);
  expect(communicationTimestampLabel({deliveryStatus:'sent'})).toBe('Sent:');
  expect(communicationTimestampLabel({direction:'inbound'})).toBe('Received:');
});
it('distinguishes not sent, held, accepted and bounced',()=>{
  expect(status({deliveryStatus:'skipped'}).key).toBe('skipped');
  expect(status({deliveryStatus:'flagged'}).key).toBe('review');
  expect(status({deliveryStatus:'sent'}).label).toBe('Delivery not recorded');
  expect(status({deliveryStatus:'sent',recipientAddress:'parent@example.test'}).key).toBe('sent');
  expect(status({deliveryStatus:'sent',openedAt:'2026-11-01',recipientAddress:'parent@example.test'}).label).toBe('Sent, then opened');
  expect(status({deliveryStatus:'bounced',externalMessageId:'accepted'}).key).toBe('failed');
});
