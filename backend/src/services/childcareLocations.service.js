const fail=message=>{throw Object.assign(new Error(message),{status:400,code:'CHILDCARE_LOCATION_INVALID'});};
export async function childcareLocations(agencyId,db) {
  const [sites]=await db.execute(`SELECT l.id,l.name FROM office_locations l WHERE l.is_active=1 AND
    (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies a WHERE a.office_location_id=l.id AND a.agency_id=?)) ORDER BY l.name,l.id`,[agencyId,agencyId]);
  const [rooms]=await db.execute(`SELECT r.id,r.location_id,COALESCE(NULLIF(r.label,''),r.name) name,r.room_number FROM office_rooms r
    JOIN office_locations l ON l.id=r.location_id WHERE r.is_active=1 AND l.is_active=1 AND
    (l.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies a WHERE a.office_location_id=l.id AND a.agency_id=?)) ORDER BY r.sort_order,r.name,r.id`,[agencyId,agencyId]);
  return {locations:sites.map(site=>({id:Number(site.id),name:site.name,rooms:rooms.filter(room=>Number(room.location_id)===Number(site.id)).map(room=>({id:Number(room.id),name:room.name,number:room.room_number||null}))}))};
}
export async function resolveChildcareLocation(value,agencyId,db,existing={}) {
  if(!value.officeLocationId) {
    if(value.roomId)fail('Choose the building before choosing a childcare room.');
    // Existing free-text locations remain evidence; new shifts use the picker.
    if(value.locationName && value.locationName!==existing.locationName)fail('Choose a childcare building from the location list.');
    return value;
  }
  const {locations}=await childcareLocations(agencyId,db),site=locations.find(row=>row.id===value.officeLocationId);
  if(!site)fail('Choose an active childcare building in this organization.');
  const room=value.roomId?site.rooms.find(row=>row.id===value.roomId):null;
  if(value.roomId&&!room)fail('Choose a room in the selected childcare building.');
  value.locationName=site.name+(room?` · ${room.number?`Room ${room.number} — `:''}${room.name}`:'');
  return value;
}
