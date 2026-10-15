import {it,expect} from 'vitest';
import {supervisionParticipantDetails} from '../supervisionParticipantDetails.js';
it('distinguishes bachelor-level staff from student interns using existing classification',()=>{
 const staff=supervisionParticipantDetails({role:'provider',credential:'BA',title:'Facilitator'});
 const intern=supervisionParticipantDetails({role:'provider',credential:'BA',title:'Counseling Intern'});
 expect(staff).toMatchObject({educationLabel:'Bachelor’s level',isIntern:false,hcbsCategory:1});
 expect(intern).toMatchObject({educationLabel:'Bachelor’s level',isIntern:true,hcbsCategory:2});
});
it('does not invent a qualification when none is saved',()=>{
 expect(supervisionParticipantDetails({})).toMatchObject({educationLabel:'Education not recorded',hcbsCategory:null});
});
