import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMichaelWebsiteInquiry} from '../michaelInquiryPolicy.js';
const agency={slug:'michael'};
test('Michael website inquiries require an adult contact and recognized role',()=>{
 for(const contactRole of ['adult_self','parent_guardian','organization']) assert.doesNotThrow(()=>validateMichaelWebsiteInquiry(agency,{inquirySource:'michael_website',adultContact:true,contactRole}));
 for(const payload of [{},{adultContact:false,contactRole:'parent_guardian'},{adultContact:'true',contactRole:'adult_self'},{adultContact:true,contactRole:'minor'}]) assert.throws(()=>validateMichaelWebsiteInquiry(agency,{inquirySource:'michael_website',...payload}),e=>e.status===400);
});
test('a coaching interest still requires the adult check if source is omitted',()=>{
 for(const interest of ['coaching','running-reset','running-plan','college-session','college-roadmap','recruiting-strategy']) assert.throws(()=>validateMichaelWebsiteInquiry(agency,{interest}),e=>e.status===400);
});
test('unrelated support forms and other tenants retain their existing validation',()=>{
 assert.doesNotThrow(()=>validateMichaelWebsiteInquiry({slug:'kimi'},{inquirySource:'michael_website'}));
 assert.doesNotThrow(()=>validateMichaelWebsiteInquiry(agency,{category:'technical'}));
});
