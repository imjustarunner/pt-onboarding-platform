import User from '../models/User.model.js';

export function isSchoolCareBridgeOnly(agency) {
  let flags=agency?.feature_flags||agency?.featureFlags||{};
  try{if(typeof flags==='string')flags=JSON.parse(flags);}catch{return false;}
  return flags?.schoolCareBridgeOnly===true;
}

// Product scope narrows existing authorization; it never grants a role, school
// membership or ROI. Resource controllers remain the final access authority.
export function schoolCareBridgeApiAllowed(method,path,userId) {
  if(/^\/api\/(schoolcarebridge|school-portal|school-overview|clients|client-notes|referrals|referral-packet-drafts|phi-documents|public-intake|school-reinit|messages|chat|chats|communications|notifications|document-signing|documents|user-documents|document-acknowledgments|support-tickets|compliance-corner|account-security|presence|auth)(\/|$)/.test(path))return true;
  if(method==='GET' && /^\/api\/(agencies|organizations|users|providers|branding|platform-branding|app-version|icons|portal|tasks|user-preferences|client-settings|supervisor-assignments|public)(\/|$)/.test(path))return true;
  if(/^\/api\/organizations\/[^/]+\/upload-referral(\/|$)/.test(path))return true;
  if(/^\/api\/availability\/school-requests(\/|$)/.test(path))return true;
  if(/^\/api\/company-events\/\d+\/session-staffing-summary$/.test(path)&&method==='GET')return true;
  if(new RegExp(`^/api/users/${Number(userId)}/(preferences|profile|signature)(/|$)`).test(path))return true;
  return method==='POST' && path==='/api/users/change-password';
}

export async function enforceSchoolCareBridgeScope(req,res,next) {
  try{
    if(req.user?.role==='super_admin'||!req.user?.id)return next();
    req.scbMembershipsPromise ||= User.getAgencies(req.user.id);
    const members=await req.scbMembershipsPromise;
    const tenants=members.filter(a=>a.organization_type==='agency');
    const agencyRouteId=String(req.originalUrl||'').match(/^\/api\/agencies\/(\d+)(?:\/|\?|$)/)?.[1];
    const explicit=[agencyRouteId,req.headers?.['x-agency-id'],req.query?.agencyId,req.body?.agencyId,req.body?.agency_id,req.params?.agencyId].filter(Boolean).map(Number);
    const targetRestricted=tenants.some(a=>isSchoolCareBridgeOnly(a)&&explicit.includes(Number(a.id)));
    const onlyRestricted=tenants.length>0&&tenants.every(isSchoolCareBridgeOnly);
    if(!targetRestricted&&!onlyRestricted)return next();
    const path=String(req.originalUrl||req.path||'').split('?')[0].replace(/\/$/,'');
    if(!schoolCareBridgeApiAllowed(req.method,path,req.user.id))return res.status(403).json({error:{code:'SCHOOLCAREBRIDGE_SCOPE',message:'This feature is outside your SchoolCareBridge workspace.'}});
    return next();
  }catch(error){next(error);}
}
