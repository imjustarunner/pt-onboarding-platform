import pool from '../config/database.js';
import {requiresQaStripe,verifiedQaPaymentAgency,stripeConfiguration} from '../utils/qaStripeConfiguration.js';
/** The dedicated synthetic tenant must never fall through to a live platform. */
export async function qaStripeCollectionState(agencyId,db=pool){
 const config=stripeConfiguration(agencyId);
 if(!requiresQaStripe(agencyId))return{testModeRequired:false,allowed:true,mode:config.mode};
 const [[agency]]=await db.execute('SELECT id,slug,feature_flags FROM agencies WHERE id=?',[Number(agencyId)]);
 return{testModeRequired:true,allowed:verifiedQaPaymentAgency(agency)&&config.allowed,mode:config.mode};
}
export async function assertQaStripeTestMode(agencyId,db=pool){
 const state=await qaStripeCollectionState(agencyId,db);
 if(!state.allowed)throw Object.assign(Error('Secure card collection for this QA organization requires an isolated test-mode payment configuration.'),{status:503,statusCode:503,code:'QA_STRIPE_TEST_MODE_REQUIRED'});
 return state;
}
