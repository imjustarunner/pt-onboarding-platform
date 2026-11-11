import {mobileAgencyIcon} from './agencyBrand.service.js';
/** Decorate only rows already admitted by the shared personal notification feed. */
export function presentMobileNotification(item,agencies=[]){
 const agency=agencies.find(a=>Number(a.id)===Number(item.agency_id));
 const out={...item,agency_logo_url:agency?mobileAgencyIcon(agency):null};
 if(String(item.related_entity_type || '').toLowerCase()==='client'){
  // The authorized feed appends recorded initials; do not infer an identity from
  // a record number or fetch an additional chart to decorate a notification.
  const initials=String(item.client_initials || '').trim().slice(0,80);
  out.client_display_name=initials || 'Client';
  if(item.type==='new_packet_uploaded'){
   out.title=`New packet uploaded${initials?' · '+initials:''}`;
   out.message=`A new packet was uploaded for ${initials || 'the client'}. Open the profile to review and process the saved packet.`;
  }
 }
 return out;
}
