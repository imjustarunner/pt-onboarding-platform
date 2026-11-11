import pool from '../config/database.js';
import {isAuricwellQaAgency} from '../utils/auricwellQaPolicy.js';

const keyMode=key=>/^(?:[ps]k|rk)_test_/.test(String(key||''))?'test':/^(?:[ps]k|rk)_live_/.test(String(key||''))?'live':'unconfigured';
/** The dedicated synthetic tenant must never fall through to a live platform. */
export async function qaStripeCollectionState(agencyId,db=pool){
 const secret=process.env.STRIPE_SECRET_KEY||'',publishable=process.env.STRIPE_PUBLISHABLE_KEY||'';
 const secretMode=keyMode(secret),publicMode=keyMode(publishable),mode=secretMode===publicMode?publicMode:'mismatched';
 if(Number(agencyId)!==450)return{testModeRequired:false,allowed:true,mode};
 const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?',[450]);
 const allowed=isAuricwellQaAgency(agency)&&mode==='test'&&!/REPLACE_ME/i.test(secret+publishable);
 return{testModeRequired:true,allowed,mode};
}
export async function assertQaStripeTestMode(agencyId,db=pool){
 const state=await qaStripeCollectionState(agencyId,db);
 if(!state.allowed)throw Object.assign(Error('Secure card collection for this QA organization requires an isolated test-mode payment configuration.'),{status:503,statusCode:503,code:'QA_STRIPE_TEST_MODE_REQUIRED'});
 return state;
}
