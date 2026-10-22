import { describe, it, expect, vi } from 'vitest';
const m=vi.hoisted(()=>({clinical:{getConnection:vi.fn()},main:{execute:vi.fn()}}));
vi.mock('../../config/database.js',()=>({default:m.main}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:m.clinical}));
vi.mock('../clinicalNoteCrypto.service.js',()=>({maybeEncryptNotePayload:s=>`encrypted:${s}`,maybeDecryptNotePayload:s=>s}));
import { createReplacementOfferEventService } from '../replacementOfferEvents.service.js';
import UserCommunication from '../../models/UserCommunication.model.js';

describe('durable replacement events',()=>{
  it('adds a nonbillable system outcome without rewriting or signing the original note, and sends provider mail once',async()=>{
    const event={id:1,offer_id:8,event_type:'confirmed',outcome_text:'Session canceled — requested session confirmed and scheduled.',created_at:'2030-01-01 10:00:00',email_status:'pending',note_recorded_at:null};
    const offer={id:8,agency_id:2,client_id:9,provider_id:7,appointment_id:10,created_by_user_id:7,linked_appointment_id:20};
    const database={execute:vi.fn(async(sql,p)=>{
      if(sql.includes('SELECT o.*'))return [[]];
      if(sql.startsWith('SELECT * FROM appointment_replacement_events'))return [[event].filter(e=>!e.note_recorded_at||e.email_status==='pending')];
      if(sql.startsWith('SELECT * FROM appointment_replacement_offers'))return [[offer]];
      if(sql.includes('SET note_recorded_at')){event.note_recorded_at='now';return [{}];}
      if(sql.includes("SET email_status='sending'")){const affectedRows=event.email_status==='pending'?1:0;if(affectedRows)event.email_status='sending';return [{affectedRows}];}
      if(sql.includes('SET email_status=?')){event.email_status=p[0];return [{}];}
      throw new Error(sql);
    })};
    const conn={beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),execute:vi.fn(async sql=>{
      if(sql.startsWith('SELECT id,client_id'))return [[{id:30,client_id:9}]];
      if(sql.startsWith('SELECT id FROM clinical_notes'))return [[]];
      if(sql.startsWith('INSERT INTO clinical_notes'))return [{insertId:40}];throw new Error(sql);
    })};m.clinical.getConnection.mockResolvedValue(conn);
    const sendEmail=vi.fn(async()=>({id:'mail-1'}));
    const service=createReplacementOfferEventService({database,appointment:async()=>({id:10,clinicalSessionId:30}),sendEmail});
    await service.processDue();await service.processDue();
    expect(sendEmail).toHaveBeenCalledTimes(1);expect(event.email_status).toBe('sent');
    const [sql,args]=conn.execute.mock.calls.find(([s])=>s.startsWith('INSERT INTO clinical_notes'));
    expect(sql).not.toContain('provider_signed');expect(sql).toContain('APPOINTMENT_RESCHEDULE_OUTCOME');
    expect(args[4]).toContain('encrypted:Session canceled');expect(JSON.parse(args[5])).toMatchObject({nonBillable:true,systemGenerated:true,replacementEventId:1});
    expect(conn.execute.mock.calls.some(([s])=>s.startsWith('UPDATE clinical_notes'))).toBe(false);
  });
});

describe('email open receipt for an existing queued communication',()=>{
  it('links the outgoing pixel to its original receipt and preserves the first open',async()=>{
    const row={id:12,agency_id:2,tracking_token:null,opened_at:null};
    m.main.execute.mockImplementation(async(sql,p)=>{
      if(sql.includes('SET tracking_token=')){if(row.id!==p[1]||row.agency_id!==p[2])return [{affectedRows:0}];row.tracking_token=p[0];return [{affectedRows:1}];}
      if(sql.startsWith('SELECT id, opened_at'))return [[row].filter(r=>r.tracking_token===p[0])];
      if(sql.includes('SET opened_at')){row.opened_at='first-open';return [{affectedRows:1}];}
      throw new Error(sql);
    });
    await UserCommunication.setTrackingToken(12,2,'outgoing-pixel');
    expect(await UserCommunication.markOpenedByToken('outgoing-pixel')).toBe(12);
    expect(await UserCommunication.markOpenedByToken('outgoing-pixel')).toBe(false);
    expect(row.opened_at).toBe('first-open');
    await expect(UserCommunication.setTrackingToken(12,99,'wrong-agency')).rejects.toThrow('does not belong');
    expect(row.tracking_token).toBe('outgoing-pixel');
  });
});
