import {it,expect} from 'vitest';
import {serviceLocationDisplay,cleanServiceLocationLabel} from '../serviceLocationDisplay.js';
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
