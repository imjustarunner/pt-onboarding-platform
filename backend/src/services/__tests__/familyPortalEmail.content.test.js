import {it,expect} from 'vitest';
import {simpleParser} from 'mailparser';
import {buildMimeMessage} from '../unifiedEmail/mime.js';
import {buildClientEnrollmentEmail,buildFamilyBillingEmail,buildTreatmentPlanEmail,buildSecureMessageEmail} from '../clientPortalEmailContent.js';
import {enrollmentMailBrand,renderPortalEmail} from '../portalEmailBranding.service.js';
import {validateOutboundEmailQuality} from '../outboundEmailQuality.service.js';
const url='https://auricwell.com/itsco/guardian';
it('offers a branded secure message button without message contents or a billing sender',()=>{
 const message=buildSecureMessageEmail({agencyName:'ITSCO',url:'https://auricwell.com/secure-message/example'});
 expect(message.subject).toContain('AuricWell');expect(message.html).toContain('Read secure message');expect(message.text).toContain('Please reply in the portal');
 expect(message.text).toContain('Conversa by AuricWell');expect(message.html).toContain('copy and paste');
});
it('welcomes two dependents into one portal without exposing their full names',()=>{
 const message=buildClientEnrollmentEmail({firstName:'Alex',agencyName:'ITSCO',clients:[{full_name:'Riley Bennett — DEMO'},{full_name:'Avery Bennett — DEMO'}],url});
 expect(message.text).toContain('Your 2 dependents (RIBE, AVBE)');expect(message.text).toContain('one AuricWell portal account');
 expect(message.html).not.toContain('Riley');expect(message.html).toContain('Set up your portal');expect(message.html).toContain('copy and paste');
});
it('adds tutoring to an existing account without asking for another password',()=>{
 const message=buildClientEnrollmentEmail({agencyName:'Next Level Up',clients:[{full_name:'Jordan Bennett'}],learning:true,existingAccount:true,url});
 expect(message.text).toContain('tutoring information');expect(message.text).toContain('same account you use for AuricWell');expect(message.text).not.toContain('Set your password');
 const brand=enrollmentMailBrand({agency:{name:'Next Level Up',slug:'nlu'},domain:'nextleveluplcc.com',channel:'tutoring'});
 const html=renderPortalEmail({brand,...message});expect(html).toContain('assets/nlu/logo.png');expect(html).not.toContain('Michael Mendez');
});
it('adds counseling under the correct care agency in the existing AuricWell portal',()=>{
 const message=buildClientEnrollmentEmail({agencyName:'Next Level Up',existingAccount:true,clients:[{full_name:'Jordan Bennett'}],url});
 expect(message.text).toContain('added to your AuricWell portal');expect(message.text).toContain('You do not need a new account or password');
});
it.each(['balance','statement','payment_setup'])('provides a working button and copy link for %s',kind=>{
 const message=buildFamilyBillingEmail({kind,agencyName:'ITSCO',url});expect(message.html.match(/href=/g)).toHaveLength(2);
 expect(message.html).toContain(url);expect(message.html).toContain('copy and paste');
 expect(validateOutboundEmailQuality({...message,templateType:'family_balance_due',source:'auto',attachments:[]}).ok).toBe(true);
});
it('shows exactly two letters from the first and last names on plan messages and escapes user input',()=>{
 const message=buildTreatmentPlanEmail({client:{full_name:'Riley Bennett — DEMO'},recipientName:'<script>bad</script>',url});
 expect(message.html).toContain('RIBE');expect(message.html).not.toContain('Bennett');expect(message.html).not.toContain('<script>');expect(message.html).toContain('Review treatment plan');
});
it.each(['ITSCO · Billing','Next Level Up · Billing','Méndez, Michael','Support "Team"'])('round-trips the From display name through MIME: %s',async name=>{
 const message=buildMimeMessage({from:`${name} <billing@example.test>`,to:'parent@example.test',subject:'Billing',text:'Test'});
 const parsed=await simpleParser(message);
 expect(parsed.from.value[0]).toEqual({name,address:'billing@example.test'});
});
