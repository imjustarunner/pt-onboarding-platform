import { expect, it } from 'vitest';
import { notificationTransportReceipt } from '../notificationTransportReceipt.js';
const qa = { id: 'gmail-receipt', redirected: true, testInboxRedirect: { agencyId: 450, deliveredTo: ['testing@itsco.health'] } };
it('recognizes an accepted controlled-inbox send without claiming delivery to the intended family address', () => {
  expect(notificationTransportReceipt(qa,450)).toEqual({ externalId:'gmail-receipt',accepted:true,redirectedTo:'testing@itsco.health' });
});
it.each([{...qa,id:null},{...qa,queued:true},{...qa,pendingApproval:true},{...qa,blocked:true},{...qa,skipped:true},
  {...qa,testInboxRedirect:null},{...qa,testInboxRedirect:{agencyId:450,deliveredTo:['elsewhere@example.org']}},
  {...qa,testInboxRedirect:{agencyId:450,deliveredTo:['testing@itsco.health','elsewhere@example.org']}}])('keeps an unconfirmed, suppressed, or unrecognized redirect held: %j', result => {
  expect(notificationTransportReceipt(result,450).accepted).toBe(false);
});
it('cannot use a demo receipt to change another organization’s outcome', () => {
  expect(notificationTransportReceipt(qa,2).accepted).toBe(false);
});
it('preserves ordinary production transport acceptance', () => {
  expect(notificationTransportReceipt({id:'receipt'},2)).toEqual({externalId:'receipt',accepted:true});
});
