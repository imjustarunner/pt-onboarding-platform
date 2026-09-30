import { expect, it } from 'vitest';
import { validateOutboundEmailQuality } from '../outboundEmailQuality.service.js';
it('keeps staff-authored mail sendable after the composer attachment warning', () => {
  expect(validateOutboundEmailQuality({ source:'manual',templateType:'hub_email',text:'Please send me the attachment.\n\nFrom: Previous sender\nClick the link below',subject:'Re: Release of information' })).toEqual({ok:true,flags:[]});
});
it('still blocks incomplete automated templates, including mislabeled hub templates', () => {
  for(const templateType of ['school_roi_signing','hub_email']) {
    const result=validateOutboundEmailQuality({source:'auto',templateType,text:'See attached'});
    expect(result.ok).toBe(false);expect(result.flags).toContainEqual(expect.objectContaining({code:'missing_attachment'}));
  }
});
it('does not exempt other manually triggered automation templates', () => {
  expect(validateOutboundEmailQuality({source:'manual',templateType:'school_roi_signing',text:'See attached'}).ok).toBe(false);
});
