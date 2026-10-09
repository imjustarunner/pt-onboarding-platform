import { describe, it, expect } from 'vitest';
import { consolidateBirthdateFields, formatProfileDate } from '../profileDemographics.js';
import { fieldKeysForSubTab, subTabForFieldKey, isClinicalProfileField } from '../../constants/clinicalProfileLayout.js';
import { formatClinicalFieldValue } from '../clinicalFieldDisplay.js';
import { PROFILE_SEARCH_TARGETS } from '../../navigation/profileSearchCatalog.js';

describe('employee birthdate', () => {
  it.each(['1998-10-09', '1998-10-09T00:00:00.000Z'])('preserves October 9 for %s', (value) => {
    expect(formatProfileDate(value)).toBe('10/09/1998');
    expect(formatClinicalFieldValue({ field_type: 'date', value })).toBe('10/09/1998');
  });
  it('merges aliases into the canonical editable definition without changing the source', () => {
    const fields = [
      { id: 2, field_key: 'provider_birthdate', value: '1998-10-09', hasValue: true },
      { id: 1, field_key: 'date_of_birth', value: null, category_key: 'credentialing' },
      { id: 3, field_key: 'birthdate', value: '1998-10-08' },
      { id: 4, field_key: 'first_name', value: 'Example' }
    ];
    const result = consolidateBirthdateFields(fields);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 1, field_label: 'Birthdate', field_type: 'date', value: '1998-10-09', hasValue: true });
    expect(fields[1].value).toBeNull();
    expect(isClinicalProfileField(result[0])).toBe(true);
  });
  it('prefers a saved canonical birthdate and retains a single empty input', () => {
    expect(consolidateBirthdateFields([
      { id: 1, field_key: 'date_of_birth', value: '1998-10-09' },
      { id: 2, field_key: 'provider_birthdate', value: '1998-10-08' }
    ])[0].value).toBe('1998-10-09');
    expect(consolidateBirthdateFields([
      { id: 1, field_key: 'date_of_birth', value: null },
      { id: 2, field_key: 'provider_birthdate', value: '' }
    ])).toHaveLength(1);
  });
  it('routes every birthdate alias and search to demographics', () => {
    for (const key of ['date_of_birth', 'provider_birthdate', 'birthdate']) {
      expect(subTabForFieldKey(key)).toBe('demographics');
      expect(fieldKeysForSubTab('administrative')).not.toContain(key);
    }
    expect(PROFILE_SEARCH_TARGETS.find((t) => t.aliases.includes('birthdate')).clinicalSubTab).toBe('demographics');
  });
});
