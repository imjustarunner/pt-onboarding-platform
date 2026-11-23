// Human location labels for care-team and client surfaces. Billing retains the
// saved place-of-service codes separately; a billing address is not a visit site.
export const cleanServiceLocationLabel=value=>String(value||'').replace(/\s*[·—(,-]?\s*POS\s*\d{1,2}\)?/gi,'').replace(/\s*[·—,]\s*$/,'').trim();
export const serviceSettingName=value=>({'02':'Online — client away from home','10':'Online — client at home','11':'Office','03':'School','12':"Client's home",'22':'Outpatient hospital'})[String(value||'').padStart(2,'0')]||'';
export function linkedReservationLocation(officeEventId,reservations=[]) {
 const id=Number(officeEventId);if(!id)return null;
 const matches=reservations.filter(row=>Number(row?.officeEventId||row?.eventId||row?.id||0)===id).map(row=>{
  const name=cleanServiceLocationLabel(row.roomLabel||row.roomName||row.room?.name),number=String(row.roomNumber||row.room?.number||'').trim();
  return {buildingName:cleanServiceLocationLabel(row.buildingName||row.officeLocationName||row.officeName),roomLabel:number&&!name.includes(number)?[`Room ${number}`,name].filter(Boolean).join(' · '):name};
 });
 return matches.find(row=>row.buildingName&&row.roomLabel)||matches.find(row=>row.roomLabel)||matches[0]||null;
}
export function serviceLocationDisplay(location={},options={}) {
 const pos=String(location.placeOfService||location.place_of_service||'').padStart(2,'0');
 const name=cleanServiceLocationLabel(location.name||location.label);
 if(['02','10'].includes(pos))return serviceSettingName(pos);
 if(pos==='11') {
  const physical=cleanServiceLocationLabel(options.buildingName||location.physicalOfficeName||location.physical_office_name);
  const ownName=name&&!/^office(?:\s+location)?$/i.test(name)?name:'';
  const building=physical||ownName||'Office';
  const room=options.reservationLinked?cleanServiceLocationLabel(options.roomLabel):'';
  return [building,room|| (options.showReservationStatus?(options.reservationLinked?'Reserved room details loading':'Office reservation not linked'):'')].filter(Boolean).join(' · ');
 }
 return name||serviceSettingName(pos)||'Location needs review';
}
