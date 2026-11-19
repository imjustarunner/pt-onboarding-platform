import {describe,it,expect,vi} from 'vitest';
vi.mock('../../config/database.js', () => ({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
import pool from '../../config/database.js';
import {chartCommunicationMessage} from '../chartCommunicationExport.service.js';
import {communicationPrintDocument} from '../communicationPrint.service.js';
describe('communication record printing',()=>{
  it('includes every message, sender, recipients, timestamp and purpose without executing message HTML',()=>{
    const messages=Array.from({length:301},(_,i)=>({body_text:`Message ${i} <script>alert(1)</script>`,from:{name:'Sender',email:'sender@example.test'},to:[{email:'parent@example.test'}],cc:[{email:'copy@example.test'}],sent_at:'2026-10-01T12:30:00Z',send_status:'sent'}));
    const html=communicationPrintDocument('Record <unsafe>',[{subject:'Thread',documentation:[{purpose:'Scheduling <img onerror=bad>',author:'Provider',completed:true,reviewedThroughId:301}],messages}]);
    expect(html).toContain('Message 300');expect(html).toContain('parent@example.test');expect(html).toContain('copy@example.test');expect(html).toContain('2026-10-01T12:30:00.000Z');expect(html).toContain('Scheduling &lt;img');expect(html).not.toContain('<script>');expect(html).not.toContain('<unsafe>');
  });
});

it.each([['email-7','uc.client_id=?','uc.id=?'],['ml-7','ml.client_id=?','ml.id=?'],
  ['nsl-7',"n.related_entity_type='client' AND n.related_entity_id=?",'nsl.id=?']])(
  'exports one attributed message for %s', async (key, scope, id) => {
    pool.execute.mockResolvedValueOnce([[{subject:'Message',body_text:'Hello',sentAt:'2026-11-12'}]]);
    expect((await chartCommunicationMessage(31, key)).messages).toHaveLength(1);
    const [query, args] = pool.execute.mock.lastCall;
    expect(query).toContain(scope);
    expect(query).toContain(id);
    expect(args).toEqual([31,7]);
    if (key.startsWith('nsl')) expect(query).toContain('cg.guardian_user_id=nsl.user_id');
    pool.execute.mockResolvedValueOnce([[]]);
    await expect(chartCommunicationMessage(88, key)).rejects.toHaveProperty('status',404);
  }
);
it('rejects an invalid message key before reading records', async () => {
  pool.execute.mockClear();
  await expect(chartCommunicationMessage(31, 'unrecognized-7')).rejects.toHaveProperty('status',400);
  expect(pool.execute).not.toHaveBeenCalled();
});
