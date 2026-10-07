import pool from '../config/database.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { defaultPhoneWorkflow } from './phoneWorkflow.service.js';
const conflict = () => Object.assign(new Error('Phone setup changed or this agency is unavailable. Reload before saving.'),{status:409});
export async function readPhoneWorkflow(agencyId) {
  const [rows]=await pool.execute(`SELECT a.name, w.revision, w.config_ciphertext, w.config_iv, w.config_auth_tag, w.encryption_key_id
    FROM agencies a LEFT JOIN agency_phone_workflows w ON w.agency_id=a.id WHERE a.id=? LIMIT 1`,[agencyId]);
  if (!rows.length) throw Object.assign(new Error('Agency not found.'),{status:404});
  const row=rows[0];
  const config=row.revision ? JSON.parse(decryptChatText({ciphertextB64:row.config_ciphertext,ivB64:row.config_iv,authTagB64:row.config_auth_tag,keyId:row.encryption_key_id})) : defaultPhoneWorkflow(row.name);
  for (const option of config.menu || []) option.ticketTopic ??= option.key === '2' ? 'billing' : 'general';
  return {revision:row.revision || 0,config};
}
export async function storePhoneWorkflow({agencyId,userId,config,revision}) {
  // No plaintext fallback if encryption is unavailable.
  const enc=encryptChatText(JSON.stringify(config));
  try {
    const args=[enc.ciphertextB64,enc.ivB64,enc.authTagB64,enc.keyId,userId,agencyId];
    const [result]=revision === 0
      ? await pool.execute(`INSERT INTO agency_phone_workflows (config_ciphertext,config_iv,config_auth_tag,encryption_key_id,updated_by,agency_id)
        SELECT ?,?,?,?,?,id FROM agencies WHERE id=?`,args)
      : await pool.execute(`UPDATE agency_phone_workflows SET config_ciphertext=?,config_iv=?,config_auth_tag=?,encryption_key_id=?,updated_by=?,revision=revision+1
        WHERE agency_id=? AND revision=?`,[...args,revision]);
    if (!result.affectedRows) throw conflict();
  } catch(e) { if(e.code==='ER_DUP_ENTRY')throw conflict();throw e; }
  return revision+1;
}
