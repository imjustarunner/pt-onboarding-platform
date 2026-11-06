import Agency from '../models/Agency.model.js';
import {agencyActionColor} from '../utils/agencyBrandColor.js';
import {publicUploadsUrlFromStoredPath} from '../utils/uploads.js';
export async function meetingAgencyBrand(agencyId) {
  const agency=await Agency.findById(agencyId);
  if(!agency)return null;
  let logo=agency.logo_url || agency.logo_path || '';
  if(logo && !logo.startsWith('/') && !/^https:\/\//i.test(logo))logo=publicUploadsUrlFromStoredPath(logo);
  if(!/^(?:https:\/\/|\/(?!\/))/i.test(logo))logo='';
  const slug=String(agency.slug || agency.portal_url || '').toLowerCase();
  if(!logo)logo=({nlu:'/assets/nlu/logo.png',itsco:'/assets/plotline/careers/itsco-logo.png'})[slug] || '';
  return {name:agency.name,logoUrl:logo,primaryColor:agencyActionColor(agency)};
}
