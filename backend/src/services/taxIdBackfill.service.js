import { packAgencyTaxId, unpackAgencyTaxId } from './agencyTaxId.service.js';
import { isPrivateTaxField, encryptProfileTaxValue, TAX_VALUE_PREFIX } from '../utils/privateTaxId.js';
import { decryptChatText } from './chatEncryption.service.js';

// All updates use compare-and-swap so an administrator's concurrent edit wins.
// No raw identifiers are returned or logged, including in dry runs.
export async function backfillTaxIds(db, { apply = false } = {}) {
  const counts = { agencies: 0, profileValues: 0, historyValues: 0, searchRows: 0, applied: apply };
  const [agencies] = await db.execute("SELECT id, tax_id FROM agencies WHERE tax_id IS NOT NULL AND tax_id <> ''");
  for (const row of agencies) {
    const packed = packAgencyTaxId(row.tax_id);
    if (unpackAgencyTaxId(packed) !== row.tax_id) throw new Error('Tax ID encryption verification failed. No plaintext was removed.');
    if (apply) await db.execute(`UPDATE agencies SET tax_id = NULL, tax_id_ciphertext = ?, tax_id_iv = ?, tax_id_auth_tag = ?, tax_id_key_id = ?, tax_id_last4 = ? WHERE id = ? AND tax_id = ?`,
      [packed.tax_id_ciphertext, packed.tax_id_iv, packed.tax_id_auth_tag, packed.tax_id_key_id, packed.tax_id_last4, row.id, row.tax_id]);
    counts.agencies++;
  }
  const [definitions] = await db.execute('SELECT id, field_key FROM user_info_field_definitions');
  for (const definition of definitions.filter(row => isPrivateTaxField(row.field_key))) {
    const [values] = await db.execute("SELECT id, value FROM user_info_values WHERE field_definition_id = ? AND value IS NOT NULL AND value <> ''", [definition.id]);
    for (const row of values) {
      if (String(row.value).startsWith(TAX_VALUE_PREFIX)) continue;
      const encrypted = encryptProfileTaxValue(row.value);
      if (decryptChatText(JSON.parse(encrypted.slice(TAX_VALUE_PREFIX.length))) !== row.value) throw new Error('Profile encryption verification failed.');
      if (apply) await db.execute('UPDATE user_info_values SET value = ? WHERE id = ? AND value = ?', [encrypted, row.id, row.value]);
      counts.profileValues++;
    }
  }
  const [historyKeys] = await db.execute('SELECT DISTINCT field_changed FROM credentialing_change_log');
  for (const { field_changed: key } of historyKeys.filter(row => isPrivateTaxField(row.field_changed))) {
    const [rows] = await db.execute('SELECT id, old_value, new_value FROM credentialing_change_log WHERE field_changed = ?', [key]);
    for (const row of rows) for (const column of ['old_value', 'new_value']) {
      if (!row[column] || String(row[column]).startsWith(TAX_VALUE_PREFIX)) continue;
      const encrypted = encryptProfileTaxValue(row[column]);
      if (apply) await db.execute(`UPDATE credentialing_change_log SET ${column} = ? WHERE id = ? AND ${column} = ?`, [encrypted, row.id, row[column]]);
      counts.historyValues++;
    }
  }
  const [indexKeys] = await db.execute('SELECT field_key, COUNT(*) AS total FROM provider_search_index GROUP BY field_key');
  for (const row of indexKeys.filter(row => isPrivateTaxField(row.field_key))) {
    counts.searchRows += Number(row.total);
    if (apply) await db.execute('DELETE FROM provider_search_index WHERE field_key = ?', [row.field_key]);
  }
  return counts;
}
