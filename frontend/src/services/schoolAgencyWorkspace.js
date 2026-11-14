import {appendBrandSwitchHandoff} from '../utils/brandSwitchUrl';
import {isSchoolCareBridgeHost} from '../utils/schoolCareBridge';

export async function transferSchoolAgencySession({agencies=[],parentId,section='dashboard',role}, {api,router,location=window.location}) {
 if(!['dashboard','admin-dashboard'].includes(section))throw Error('Choose an agency dashboard.');
 const parent=agencies.find(a=>Number(a.id)===Number(parentId)&&String(a.organization_type||a.organizationType).toLowerCase()==='agency');
 const superadmin=String(role).toLowerCase()==='super_admin';
 if(!parent&&!superadmin)throw Error('Your school session has no linked agency workspace. Sign in with your agency account.');
 const slug=String(parent?.portal_url||parent?.slug||'');
 if(parent&&!/^[a-z0-9-]+$/.test(slug))throw Error('Your agency workspace address could not be verified.');
 const path=slug?`/${slug}/${section}`:`/${section}`;
 if(!isSchoolCareBridgeHost(location.hostname)){await router.push(path);return;}
 const {data}=await api.post('/auth/brand-switch/handoff',{...(parent?{agencyId:Number(parent.id)}:{}),targetHost:'app.itsco.health'},{skipGlobalLoading:true});
 if(!data.handoffToken)throw Error('Your agency session could not be transferred. Sign in with your agency account.');
 location.assign(appendBrandSwitchHandoff(`https://app.itsco.health${path}`,data.handoffToken));
}
