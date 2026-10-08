import {expect,it} from 'vitest';import {itscoRevisionTopics,nextLevelUpTopics,spanishIntakeProcedure,kioskTopic} from '../october2026UpdateRevisions.js';
it('keeps NLU departures out of ITSCO despite shared memberships',()=>{const staff=[{id:461,first_name:'Alexandra',last_name:'Walker'},{id:517,first_name:'Trevor',last_name:'Reynolds'}];const t=itscoRevisionTopics(staff).find(t=>t.key==='people_since_march');expect(t.body).toContain('Alexandra Walker');expect(t.body).not.toContain('Trevor');expect(nextLevelUpTopics({departures:[staff[1]]})[1].body).toContain('Trevor Reynolds');});
it('places Steele and Tesla in Colorado Springs and uses absence-report reminders',()=>{const t=itscoRevisionTopics([]).find(t=>t.key==='schools_since_march').body;expect(t.slice(0,t.indexOf('<strong>Denver'))).toContain('Tesla');expect(t.slice(0,t.indexOf('<strong>Denver'))).toContain('Steele');expect(t).toContain('No confirmation is needed');});
it('includes the Spanish handoff and kiosk instructions',()=>{expect(spanishIntakeProcedure).toContain('No additional approval is needed');expect(spanishIntakeProcedure).toContain('Spanish-speaking team member for intake');expect(kioskTopic.body).toContain('in-app notification');expect(kioskTopic.body).toContain('Optional feedback can be skipped');});

it('uses the NLU kiosk entry in NLU announcements',()=>{const t=nextLevelUpTopics().find(t=>t.key==='office_kiosk');expect(t.body).toContain('/nlu/kiosk');expect(t.body).not.toContain('/itsco/kiosk');});
it('congratulates Emmi rather than Emma, welcomes Eden and announces only Megan’s new role',()=>{
 const staff=[{id:478,first_name:'Emma',last_name:'Boese',title:'Counselor'},{id:479,first_name:'Emmi',last_name:'Regenbogen'},{id:1147,first_name:'Eden',last_name:'Olsen Edwards'},{id:496,first_name:'Megan',last_name:'Geil-Crader',title:'Program Support Coordinator'},{id:465,first_name:'Aunya',last_name:'Albinana',title:'Counselor'}];
 const topics=itscoRevisionTopics(staff);const congrats=topics.find(t=>t.key==='credentials_roles').body;
 expect(congrats).toContain('Emmi Regenbogen');expect(congrats).not.toContain('Emma Boese');expect(congrats).not.toContain('Aunya');expect(congrats).toContain('{{staff:479:photo}}');
 expect(topics.find(t=>t.key==='people_since_march').body).toContain('recent SWC licensure');
});
