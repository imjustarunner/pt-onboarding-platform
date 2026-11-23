import {it,expect} from 'vitest';
import {serviceLocationDisplay,cleanServiceLocationLabel,linkedReservationLocation} from '../serviceLocationDisplay.js';
it('resolves the exact linked reservation and never borrows a room from a different same-time booking',()=>{
 const rows=[{officeEventId:1,buildingName:'Other building',roomLabel:'Wrong room'},{officeEventId:2,buildingName:'Windchime',roomNumber:'204',roomLabel:'North room'}];
 expect(linkedReservationLocation(2,rows)).toEqual({buildingName:'Windchime',roomLabel:'Room 204 · North room'});expect(linkedReservationLocation(3,rows)).toBeNull();expect(linkedReservationLocation(0,rows)).toBeNull();
 expect(linkedReservationLocation(2,[{officeEventId:2},...rows])).toEqual({buildingName:'Windchime',roomLabel:'Room 204 · North room'});
});
it('shows the actual building and reserved room without coding labels',()=>{
 expect(serviceLocationDisplay({name:'Office · POS 11',placeOfService:'11'},{buildingName:'Windchime',roomLabel:'Room 204',reservationLinked:true})).toBe('Windchime · Room 204');
 expect(cleanServiceLocationLabel('School (POS 03)')).toBe('School');
});
it('does not invent a room or substitute a billing office for the physical site',()=>{
 const loc={name:'Office',placeOfService:'11',billingOfficeName:'Billing headquarters'};
 expect(serviceLocationDisplay(loc,{showReservationStatus:true})).toBe('Office · Office reservation not linked');
 expect(serviceLocationDisplay(loc,{buildingName:'Actual building',roomLabel:'Unlinked room'})).toBe('Actual building');
});
it('never applies an office reservation to a school, home or online visit',()=>{
 const reserved={buildingName:'Billing headquarters',roomLabel:'Room 1',reservationLinked:true};
 expect(serviceLocationDisplay({name:'Client school · POS 03',placeOfService:'03'},reserved)).toBe('Client school');
 expect(serviceLocationDisplay({name:'Telehealth',placeOfService:'10'},reserved)).toBe('Online — client at home');
 expect(serviceLocationDisplay({name:'Telehealth',placeOfService:'02'},reserved)).toBe('Online — client away from home');
 expect(serviceLocationDisplay({name:"Client’s home (POS 12)",placeOfService:'12'},reserved)).toBe('Client’s home');
});
