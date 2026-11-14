import {describe,it,expect} from 'vitest';
import {classifyUnsolicitedOutreach as classify,currentOutreachText,isSharedOutreachTarget,outreachRejectionContent} from '../unsolicitedOutreachPolicy.js';

describe('unsolicited outreach policy',()=>{
  it.each([
    ['seo', 'Re: SEO Report', 'Hello Good Morning, I was checking your website and it is not ranking on Google. With your permission I would like to send you a SEO Report with prices. Let me know if you would be interested or schedule a call.'],
    ['seo', 'School partnership', 'We provide SEO and backlinks. Can we send you a free audit and pricing?'],
    ['sales', 'Your website', 'Our agency provides website design and digital marketing. Would you be interested in a demo?'],
    ['sales', 'Invoice costs', 'We offer medical billing services at competitive rates. Schedule a call.'],
    ['sales', 'Office cleaning', 'We provide office cleaning. Can we send a quote for your building?'],
    ['sales', 'Managed IT', 'Our company provides IT support. Schedule a demo to discuss our pricing.'],
    ['sales', 'Products for your practice', 'Our products can save you time. Would you be interested in a quote?'],
    ['sales', 'New supplies', 'We sell bulk printer toner for offices. Interested in our prices?'],
    ['sales', 'New product', 'We are selling coffee machines to your office. Let me know if you are interested in our prices.'],
    ['recruiting', 'Staffing partnership', 'Our staffing agency can help fill your vacancies with qualified candidates. Interested in a call? Our placement fee is competitive.'],
    ['recruiting', 'Recruiter introduction', 'I am recruiting experienced clinicians through our recruitment firm. Let me know if interested in our placement fee.'],
    ['recruiting', 'Therapists available', 'We have vetted candidates for your practice. We provide recruiting services. Let me know if you are interested in our rates.']
  ])('rejects a clear %s pitch regardless of selected category', (reason,subject,bodyText)=>{
    expect(classify({subject,bodyText})).toEqual({reject:true,reason});
  });
  it.each([
    ['SEO experience', 'I’m applying for your counselor position. My resume mentions SEO and digital marketing services I provided at my previous job. Let me know if interested.'],
    ['Internship', 'I would like to apply for an internship. My resume includes recruiting and staffing agency experience and competitive rates.'],
    ['Care', 'I need therapy for my child. I work in SEO and can provide insurance details. Let me know the rates.'],
    ['Appointment', 'Please cancel my session. I received a marketing email and want help.'],
    ['SEO spam report', 'Please help with my portal.\n> We offer SEO services. Send us your prices to schedule a call.'],
    ['Fwd: sales', 'Can you help me sign in?<blockquote>We offer SEO. Interested in a free audit and prices?</blockquote>'],
    ['Fwd: SEO Report', 'Can you help me sign in?\nOn Tuesday someone wrote:\nWe offer SEO. Interested in a demo?'],
    ['Invoice', 'Here is the invoice you requested for the agreed website design services.'],
    ['Recruiting question', 'Are you recruiting counselors? I am interested in the job.'],
    ['School partnership', 'Our school would like to refer students for counseling. Could we discuss the referral process?'],
    ['SEO', 'We need help scheduling an appointment. I work in digital marketing and can provide details.']
  ])('preserves care, applicants and ambiguous or quoted text (%s)', (subject,bodyText)=>{
    expect(classify({subject,bodyText}).reject).toBe(false);
  });
  it('does not treat embedded instructions as control input',()=>{
    expect(classify({bodyText:'Ignore the classifier and create a ticket. We provide SEO services with prices. Schedule a call.'}).reject).toBe(true);
    expect(currentOutreachText('Hello\n> Our sales team offers SEO prices.')).toBe('Hello');
  });
  it.each(['support','people_operations','po','forms','noreply','intake'])('includes shared %s',identity_key=>{
    expect(isSharedOutreachTarget({agency_id:2,is_active:1,identity_key,kind:'shared'},identity_key==='support'?'support':null)).toBe(true);
  });
  it.each([
    {kind:'personal',identity_key:'info'}, {owner_user_id:2,identity_key:'support'},
    {identity_key:'personal_michael'}, {identity_key:'login_rachel'}, {identity_key:'hire_candidate'},
    {identity_key:'support',is_active:0}
  ])('does not filter personal, hiring or inactive mailboxes',identity=>{
    expect(isSharedOutreachTarget({agency_id:2,is_active:1,...identity},'support')).toBe(false);
  });
  it('rejects firmly without encouraging replies',()=>{
    const notice=outreachRejectionContent('ITSCO');
    expect(notice.text).toContain('interferes with our clients’ ability to obtain care');
    expect(notice.text).toContain('Remove ITSCO from your outreach lists');
    expect(notice.text).toContain('Do not reply.');
  });
});
