import { encryptChatText, decryptChatText } from '../services/chatEncryption.service.js';

const token = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const isPrivateTaxField = value => /^(taxid|ein|ssn|organizationtaxid|agencytaxid|providertaxid|employeridentificationnumber|socialsecuritynumber)$/.test(token(value));
const privateProperty = key => /^(taxid|ein|ssn)(ciphertext|iv|authtag|keyid|last4|hash)?$/.test(token(key));
export const TAX_VALUE_PREFIX = 'tax-encrypted:v1:';

// No decrypt path is exposed to profile APIs. This envelope preserves legacy
// imported values for administrative recovery without keeping plaintext copies.
export function encryptProfileTaxValue(value) {
  if (value == null || value === '') return null;
  const raw = String(value);
  if (raw.startsWith(TAX_VALUE_PREFIX)) {
    decryptChatText(JSON.parse(raw.slice(TAX_VALUE_PREFIX.length)));
    return raw;
  }
  return TAX_VALUE_PREFIX + JSON.stringify(encryptChatText(raw));
}

export function redactTaxIds(value) {
  if (Array.isArray(value)) return value.filter(row => !isPrivateTaxField(row?.field_key || row?.fieldKey || row?.field_changed || row?.fieldChanged)).map(redactTaxIds);
  if (typeof value === 'string' && value.startsWith(TAX_VALUE_PREFIX)) return null;
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  const isField = isPrivateTaxField(value.field_key || value.fieldKey || value.field_changed || value.fieldChanged);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (privateProperty(key) || isPrivateTaxField(key)) continue;
    if (isField && ['value', 'oldValue', 'newValue', 'old_value', 'new_value'].includes(key)) output[key] = null;
    else output[key] = redactTaxIds(item);
  }
  if (isField) output.hasValue = false;
  return output;
}

export function protectTaxIdResponses(req, res, next) {
  const json = res.json;
  res.json = function (body) { return json.call(this, redactTaxIds(body)); };
  next();
}
