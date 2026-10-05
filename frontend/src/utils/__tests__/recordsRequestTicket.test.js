import { describe, it, expect } from 'vitest';
import { recordsRequestQueueUrl } from '../recordsRequestTicket.js';
const url = 'https://plottwisthq.com/records-manager?agencyId=10&request=00000000-0000-4000-8000-000000000001';
describe('records support shortcut', () => {
  it('links only the protected AuricWell route on a records ticket', () => {
    expect(recordsRequestQueueUrl({ created_by_source_key: 'auricwell_records_request', question: `Open: ${url}\nMore text` })).toBe(url);
    expect(recordsRequestQueueUrl({ created_by_source_key: 'public_agency_support', question: url })).toBe('');
  });
  it('rejects lookalike hosts and modified query strings', () => {
    for (const question of [url.replace('plottwisthq.com', 'plottwisthq.com.evil.example'), url + '&redirect=https://example.com', url.replace('/records-manager', '/settings'), 'javascript:alert(1)']) {
      expect(recordsRequestQueueUrl({ created_by_source_key: 'auricwell_records_request', question })).toBe('');
    }
  });
});
