import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDisclosureBusinessEntity,
  tenantBusinessEntityFromAgency
} from '../disclosureBusinessEntity.js';

test('NLU tenant fills disclosure header from agency fields, not ITSCO defaults', () => {
  const entity = resolveDisclosureBusinessEntity({
    id: 40,
    slug: 'nlu',
    official_name: 'Next Level Up LLC',
    name: 'NLU',
    street_address: '123 Peak Ave',
    city: 'Colorado Springs',
    state: 'CO',
    postal_code: '80903',
    phone_number: '719-555-0100'
  });
  assert.equal(entity.name, 'Next Level Up LLC');
  assert.match(entity.address, /123 Peak Ave/);
  assert.equal(entity.phone, '719-555-0100');
  assert.doesNotMatch(entity.address, /Windchime/);
  assert.notEqual(entity.phone, '833-444-8726');
});

test('saved disclosure settings override tenant fields', () => {
  const entity = resolveDisclosureBusinessEntity(
    { official_name: 'Next Level Up LLC', street_address: '123 Peak Ave' },
    { name: 'NLU Counseling', address: 'PO Box 1', phone: '111' }
  );
  assert.equal(entity.name, 'NLU Counseling');
  assert.equal(entity.address, 'PO Box 1');
  assert.equal(entity.phone, '111');
});

test('ITSCO still falls back to the Windchime entity when the agency record is empty', () => {
  const entity = resolveDisclosureBusinessEntity({ id: 2, slug: 'itsco', name: 'ITSCO' });
  assert.equal(entity.name, 'ITSCO');
  assert.match(entity.address, /Windchime/);
  assert.equal(entity.phone, '833-444-8726');
});

test('tenantBusinessEntityFromAgency prefers official_name', () => {
  const tenant = tenantBusinessEntityFromAgency({
    official_name: 'Next Level Up',
    name: 'nlu'
  });
  assert.equal(tenant.name, 'Next Level Up');
});
