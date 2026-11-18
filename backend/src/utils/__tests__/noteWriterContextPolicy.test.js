import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{}}));
import {noteWriterContextPolicy} from '../noteWriterContextPolicy.js';
const base={agencyId:2,providerUserId:13,featureFlags:{clientSessionBookingRollout:{entries:[]}},careEligibility:{canProvideCare:true},quickCopyEnabled:true};
it('keeps the standalone Therapy Notes writer for a provider whose individual scheduling is closed',()=>{
 expect(noteWriterContextPolicy(base)).toEqual({individualSchedulingEnabled:false,therapyNotesWriterOnly:true,therapyNotesQuickCopyEnabled:true,linkedProgressNotesRequireSession:true});
});
it('does not enable scheduling or chart signing by granting text-only writer access',()=>{
 expect(noteWriterContextPolicy({...base,careEligibility:{canProvideCare:false}})).toMatchObject({individualSchedulingEnabled:false,therapyNotesWriterOnly:true,linkedProgressNotesRequireSession:true});
});
it('uses the exact person activation while preserving an independently disabled quick-copy feature',()=>{
 expect(noteWriterContextPolicy({...base,featureFlags:{clientSessionBookingRollout:{entries:[{providerUserId:13,enabled:true}]}}})).toMatchObject({individualSchedulingEnabled:true,therapyNotesWriterOnly:false});
 expect(noteWriterContextPolicy({...base,quickCopyEnabled:false})).toMatchObject({therapyNotesWriterOnly:false,therapyNotesQuickCopyEnabled:false});
});
it('does not apply ITSCO writer-only mode to another practice',()=>{
 expect(noteWriterContextPolicy({...base,agencyId:7})).toMatchObject({therapyNotesWriterOnly:false});
});

it('keeps Therapy Notes writing available while account conversion is pending even if booking was previously enabled',()=>{
 expect(noteWriterContextPolicy({agencyId:2,providerUserId:7,featureFlags:{clientSessionBookingRollout:{entries:[{providerUserId:7,enabled:true}]}},careEligibility:{canProvideCare:true},quickCopyEnabled:true,conversionPending:true})).toMatchObject({individualSchedulingEnabled:false,therapyNotesWriterOnly:true});
});
