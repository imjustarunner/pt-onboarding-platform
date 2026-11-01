import {expect,it} from 'vitest';
import {communicationDeliveryStatus as status} from '../communicationDeliveryStatus';
it.each(['failed','skipped','flagged'])('shows the contradiction for %s mail with a receipt',deliveryStatus=>{
  expect(status({deliveryStatus,externalMessageId:'accepted',openedAt:'2026-11-01'})).toMatchObject({key:'review',label:'Delivery status needs review'});
});
it('distinguishes not sent, held, accepted and bounced',()=>{
  expect(status({deliveryStatus:'skipped'}).key).toBe('skipped');
  expect(status({deliveryStatus:'flagged'}).key).toBe('review');
  expect(status({deliveryStatus:'sent'}).key).toBe('sent');
  expect(status({deliveryStatus:'bounced',externalMessageId:'accepted'}).key).toBe('failed');
});
