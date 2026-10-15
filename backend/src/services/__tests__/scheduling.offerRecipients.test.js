import { describe, it, expect, vi } from 'vitest';
import { readReplacementSlotRecipients } from '../privateReplacementSlots.service.js';

describe('private offered-time recipient details',()=>{
  const slot={id:20,agency_id:2,provider_id:5};
  const row={id:1,appointment_id:10,client_id:8,status:'open',full_name:'Test Client',created_at:'2030-01-01 17:00:00',expires_at:'2030-01-03 17:00:00'};
  it('returns each client’s own offer timestamp and expiration, not the pool’s latest expiration',async()=>{
    const db={execute:vi.fn(async()=>[[row,{...row,id:2,client_id:9,full_name:'Second Client',created_at:'2030-01-02 17:00:00',expires_at:'2030-01-04 17:00:00'}]])};
    const recipients=await readReplacementSlotRecipients(db,slot,new Date('2030-01-02T18:00:00Z'));
    expect(recipients).toMatchObject([{clientName:'Test Client',offeredAt:'2030-01-01T17:00:00.000Z',expiresAt:'2030-01-03T17:00:00.000Z',status:'open'},
      {clientName:'Second Client',offeredAt:'2030-01-02T17:00:00.000Z',expiresAt:'2030-01-04T17:00:00.000Z',status:'open'}]);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('c.agency_id=o.agency_id'),[2,5,20]);
  });
  it('distinguishes expiry, selected elsewhere, selected here, declined, and released',async()=>{
    const db={execute:vi.fn(async()=>[[row,{...row,id:2,status:'requested',selected_slot_id:21,selected_modality:'IN_PERSON'},
      {...row,id:3,status:'requested',selected_slot_id:20,selected_modality:'VIRTUAL',request_status:'PENDING'},
      {...row,id:4,status:'declined'},{...row,id:5,released_at:'2030-01-02 17:00:00'}]])};
    const recipients=await readReplacementSlotRecipients(db,slot,new Date('2030-01-05T18:00:00Z'));
    expect(recipients.map(r=>r.status)).toEqual(['expired','selected_other_time','requested','declined','released']);
    expect(recipients[1].selectedModality).toBeNull();expect(recipients[2].selectedModality).toBe('VIRTUAL');
  });
});
