import { sanitizeRequestBody } from '../../utils/sanitizeRequest.js';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { packAgencyTaxId, unpackAgencyTaxId } from '../agencyTaxId.service.js';
import { encryptProfileTaxValue, redactTaxIds, TAX_VALUE_PREFIX } from '../../utils/privateTaxId.js';
import { decryptChatText } from '../chatEncryption.service.js';
import { backfillTaxIds } from '../taxIdBackfill.service.js';
beforeEach(() => { vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64')); });
afterEach(() => vi.unstubAllEnvs());
it('encrypts tax IDs with randomized authenticated ciphertext and never stores plaintext', () => {
 const first=packAgencyTaxId('12-3456789'),second=packAgencyTaxId('12-3456789');
 expect(first.tax_id).toBeNull();expect(first.tax_id_ciphertext).not.toBe(second.tax_id_ciphertext);
 expect(unpackAgencyTaxId(first)).toBe('12-3456789');
 expect(()=>unpackAgencyTaxId({...first,tax_id_auth_tag:Buffer.alloc(16).toString('base64'),tax_id:'12-3456789'})).toThrow('could not be decrypted');
});
it('fails closed if the key is missing and validates identifiers without echoing them', () => {
 vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64','');
 expect(()=>packAgencyTaxId('123456789')).toThrow('not saved');
 expect(()=>encryptProfileTaxValue('123456789')).toThrow();
 expect(()=>packAgencyTaxId('123')).toThrow('nine digits');
 expect(packAgencyTaxId(null).tax_id).toBeNull();
});
it('strips nested organization tax IDs, profile fields, histories and encrypted copies from responses', () => {
 const raw={agency:{tax_id:'123456789',tax_id_ciphertext:'secret',tax_id_last4:'6789',name:'Synthetic'},fields:[{field_key:'tax_id',value:'123456789'},{field_key:'credential',value:'LPC'}],history:[{field_changed:'tax_id',old_value:'123456789'}]};
 const safe=redactTaxIds(raw);expect(JSON.stringify(safe)).not.toContain('123456789');expect(JSON.stringify(safe)).not.toContain('secret');
 expect(safe.fields).toEqual([{field_key:'credential',value:'LPC'}]);expect(safe.history).toEqual([]);expect(raw.agency.tax_id).toBe('123456789');
});
it('encrypts legacy profile values reversibly without a browser decrypt path', () => {
 const encrypted=encryptProfileTaxValue('Synthetic legacy identifier');
 expect(encrypted.startsWith(TAX_VALUE_PREFIX)).toBe(true);
 expect(decryptChatText(JSON.parse(encrypted.slice(TAX_VALUE_PREFIX.length)))).toBe('Synthetic legacy identifier');
 expect(redactTaxIds({value:encrypted})).toEqual({value:null});
});
it('dry runs without writing, then removes plaintext with compare-and-swap and deletes search copies', async () => {
 const db={execute:vi.fn(async sql=>{
  if(sql.startsWith('SELECT id, tax_id'))return [[{id:1,tax_id:'123456789'}]];
  if(sql.startsWith('SELECT id, field_key'))return [[{id:2,field_key:'tax_id'}]];
  if(sql.startsWith('SELECT id, value'))return [[{id:3,value:'123456789'}]];
  if(sql.startsWith('SELECT DISTINCT'))return [[]];
  if(sql.startsWith('SELECT field_key'))return [[{field_key:'tax_id',total:2}]];
  return [{affectedRows:1}];
 })};
 expect(await backfillTaxIds(db)).toMatchObject({agencies:1,profileValues:1,searchRows:2,applied:false});
 expect(db.execute.mock.calls.every(([sql])=>sql.startsWith('SELECT'))).toBe(true);
 db.execute.mockClear();await backfillTaxIds(db,{apply:true});
 expect(db.execute.mock.calls.some(([sql])=>sql.includes('tax_id = NULL')&&sql.includes('AND tax_id = ?'))).toBe(true);
 const profileUpdate=db.execute.mock.calls.find(([sql])=>sql.startsWith('UPDATE user_info_values'));
 expect(profileUpdate[1][0]).toMatch(/^tax-encrypted:v1:/);
 expect(db.execute.mock.calls.some(([sql])=>sql.startsWith('DELETE FROM provider_search_index'))).toBe(true);
});

it('redacts tax IDs and opaque profile values from nested request logs', () => {
 const result = sanitizeRequestBody({ agencies: [{ taxId: '123456789' }], fields: [{ fieldDefinitionId: 5, value: '123456789' }] });
 expect(JSON.stringify(result)).not.toContain('123456789');
 expect(result.agencies[0].taxId).toBe('[REDACTED]');
});
it('never falls back to plaintext if an encrypted record is incomplete', () => {
 expect(() => unpackAgencyTaxId({ tax_id_ciphertext: 'broken', tax_id: '123456789' })).toThrow('could not be decrypted');
});
