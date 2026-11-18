export function serviceLocationForOffice(locations, officeId, placeOfService) {
  const office = row => Number(row.billing_office_location_id || row.billingOfficeLocationId || 0);
  const matchesPos = row => String(row.place_of_service || row.placeOfService || '') === String(placeOfService);
  return locations.find(row => office(row) === Number(officeId) && matchesPos(row))
    || locations.find(row => !office(row) && matchesPos(row))
    || null;
}

/** Collapse identical claim destinations, preserving a saved selection. Distinct
 * addresses or billing identities keep distinct, descriptive options. */
export function billingServiceLocationOptions(locations, selectedId = '') {
  const metadata=new Set(['id','name','label','created_at','updated_at','created_by_user_id','updated_by_user_id','created_by','updated_by','is_default','display_order']);
  const groups=new Map();
  for(const row of locations){
    const key=JSON.stringify(Object.entries(row).filter(([key])=>!metadata.has(key)).sort(([a],[b])=>a.localeCompare(b)));
    if(!groups.has(key)||String(row.id)===String(selectedId))groups.set(key,row);
  }
  const result=[...groups.values()].map(row=>({...row,displayLabel:`${row.name||row.label||'Billing location'}${row.place_of_service||row.placeOfService?` (POS ${row.place_of_service||row.placeOfService})`:''}`}));
  const labelKey=row=>String(row.place_of_service||row.placeOfService||row.displayLabel).toLowerCase();
  for(const row of result)if(result.filter(other=>labelKey(other)===labelKey(row)).length>1){
    const address=row.address_line1||row.address_line_1||row.street_address||row.address||'';
    row.displayLabel+=` — ${address||`billing location #${row.id}`}`;
  }
  return result;
}
