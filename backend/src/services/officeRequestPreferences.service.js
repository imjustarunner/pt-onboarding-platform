const fail = message => Object.assign(new Error(message), {status:400});
export function readPreferredRooms(raw) {
  try {const value=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(value)?value:[];} catch {return [];}
}
// Preferences describe one requested room, never several simultaneous bookings.
export async function resolveOfficeRequestPreferences(database, {agencyId, officeIds=[], preferredRoomIds, preferredRoomId, slots=[]}) {
  const supplied = preferredRoomIds !== undefined || Number(preferredRoomId)>0;
  const raw = preferredRoomIds !== undefined ? preferredRoomIds : Number(preferredRoomId)>0 ? [preferredRoomId] : [];
  if (!Array.isArray(raw)) throw fail('Room preferences must be a list.');
  const ids=[...new Set(raw.map(Number))];
  if (ids.length>3 || ids.some(id=>!Number.isSafeInteger(id)||id<1)) throw fail('Choose up to three preferred rooms.');
  const requestedIds=[...new Set([...ids,...slots.map(s=>Number(s.roomId)).filter(Boolean)])];
  let rooms=[];
  if(requestedIds.length) {
    [rooms]=await database.execute(`SELECT DISTINCT rm.id,rm.location_id AS officeId,rm.room_number,rm.label,rm.name,ol.name AS officeName
      FROM office_rooms rm JOIN office_locations ol ON ol.id=rm.location_id
      JOIN office_location_agencies ola ON ola.office_location_id=ol.id
      WHERE rm.id IN (${requestedIds.map(()=>'?').join(',')}) AND rm.is_active=1 AND ol.is_active=1 AND ola.agency_id=?`,[...requestedIds,agencyId]);
    if(requestedIds.some(id=>!rooms.some(r=>Number(r.id)===id && (!officeIds.length||officeIds.includes(Number(r.officeId)))))) {
      throw fail('Choose rooms in the selected building that are available to this agency.');
    }
  }
  const preferredRooms=ids.map(id=>{
    const room=rooms.find(r=>Number(r.id)===id);
    return {id,officeId:Number(room.officeId),officeName:room.officeName,label:[room.room_number?`#${room.room_number}`:'',room.label||room.name||`Room ${id}`].filter(Boolean).join(' ')};
  });
  return {preferredRooms,slots:slots.map(s=>({...s,roomId:supplied?(ids.length===1?ids[0]:null):s.roomId}))};
}
