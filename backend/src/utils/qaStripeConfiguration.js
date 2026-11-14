import {isAuricwellQaAgency} from './auricwellQaPolicy.js';
import {isNluTutoringQaAgency} from './nluTutoringQaPolicy.js';

export const QA_STRIPE_AGENCY_IDS=Object.freeze([450,453,454]);
export const requiresQaStripe=id=>QA_STRIPE_AGENCY_IDS.includes(Number(id));
export const verifiedQaPaymentAgency=agency=>isAuricwellQaAgency(agency)||isNluTutoringQaAgency(agency);
export const stripeKeyMode=key=>/^(?:[ps]k|rk)_test_/.test(String(key||''))?'test':/^(?:[ps]k|rk)_live_/.test(String(key||''))?'live':'unconfigured';

// Separate server-side keys let synthetic tenants coexist with live payments.
// A partially configured QA pair must fail closed, rather than fall back.
export function stripeConfiguration(agencyId=null,env=process.env){
 const qa=requiresQaStripe(agencyId);
 const dedicated=qa&&!!(env.QA_STRIPE_TEST_SECRET_KEY||env.QA_STRIPE_TEST_PUBLISHABLE_KEY);
 const secret=String(dedicated?env.QA_STRIPE_TEST_SECRET_KEY||'':env.STRIPE_SECRET_KEY||'');
 const publishable=String(dedicated?env.QA_STRIPE_TEST_PUBLISHABLE_KEY||'':env.STRIPE_PUBLISHABLE_KEY||'');
 const secretMode=stripeKeyMode(secret),publicMode=stripeKeyMode(publishable);
 const mode=secretMode===publicMode?secretMode:'mismatched';
 const configured=!!secret&&!/REPLACE_ME/i.test(secret);
 const allowed=qa?configured&&mode==='test'&&!/REPLACE_ME/i.test(publishable):configured;
 return {secret,publishable,mode,allowed,dedicated,testModeRequired:qa};
}
