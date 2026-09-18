import { describe, it, expect } from 'vitest';
import { networkEvidence, validateEvidenceProxyConfig, safeRequestPath, resourceEvidence, classifyResponse, containsSignedLink, csvCell, responseEvidence } from '../securityEvidence.js';

describe('evidence network attribution', () => {
  it('rejects mistyped or incomplete trusted-proxy configuration', () => {
    expect(() => validateEvidenceProxyConfig({})).not.toThrow();
    expect(() => validateEvidenceProxyConfig({ AUDIT_PROXY_MODE: 'google_lb', AUDIT_GOOGLE_LB_IPS: '192.0.2.1,2001:db8::1' })).not.toThrow();
    for (const config of [{ AUDIT_PROXY_MODE: 'trusted' }, { AUDIT_PROXY_MODE: 'google_lb' }, { AUDIT_PROXY_MODE: 'google_lb', AUDIT_GOOGLE_LB_IPS: '192.0.2.1,bad' }]) expect(() => validateEvidenceProxyConfig(config)).toThrow();
  });
  const req = xff => ({ ip: '34.102.141.97', socket: { remoteAddress: '169.254.1.1' }, headers: { 'x-forwarded-for': xff } });
  const env = { AUDIT_PROXY_MODE: 'google_lb', AUDIT_GOOGLE_LB_IPS: '34.102.141.97' };
  it('takes the address immediately before the rightmost verified load balancer, not a spoofed leftmost value', () => {
    expect(networkEvidence(req('1.2.3.4, 192.3.22.175, 34.102.141.97'), env)).toMatchObject({ clientIp: '192.3.22.175', ipSource: 'verified_google_lb' });
    expect(networkEvidence(req('1.2.3.4, 34.102.141.97, 192.3.22.175, 34.102.141.97, 169.254.1.1'), env).clientIp).toBe('192.3.22.175');
  });
  it('labels unknown topology or malformed chains as unverified', () => {
    for (const xff of ['192.3.22.175, 8.8.8.8', 'bad, 192.3.22.175, 34.102.141.97', Array(20).fill('34.102.141.97').join(',')]) expect(networkEvidence(req(xff), env).ipSource).toBe('unverified_proxy');
    expect(networkEvidence(req('192.3.22.175, 34.102.141.97'), {}).ipSource).toBe('unverified_proxy');
  });
  it('preserves IPv6 and does not honor forwarding headers in direct mode', () => {
    expect(networkEvidence(req('2001:db8::1, 34.102.141.97'), env).clientIp).toBe('2001:db8::1');
    expect(networkEvidence(req('1.2.3.4'), { AUDIT_PROXY_MODE: 'direct' }).ipSource).toBe('unverified_proxy');
    expect(networkEvidence({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: {} }, { AUDIT_PROXY_MODE: 'direct' }).clientIp).toBe('127.0.0.1');
  });
});
describe('evidence privacy and semantics', () => {
  it('redacts bearer paths, filenames, emails and all query strings', () => {
    expect(safeRequestPath('/api/documents/123/Smith-medical-record.pdf?token=secret')).toBe('/api/documents/:id/:value');
    expect(safeRequestPath('/api/auth/reset-password/secretToken1234?email=rachel@example.com')).not.toContain('secret');
    expect(resourceEvidence({ params: { id: '123', token: 'secret', fileName: 'patient.pdf', clientId: '8' }, body: { password: 'secret' } })).toEqual({ id: 123, clientId: 8 });
  });
  it('distinguishes denied, failed, interrupted, response-sent and link-issued', () => {
    const res = statusCode => ({ statusCode, getHeader: name => name === 'content-disposition' ? 'attachment; filename="secret.pdf"' : '' });
    expect(classifyResponse({ method: 'GET' }, res(200)).outcome).toBe('response_sent');
    expect(classifyResponse({ method: 'GET' }, res(403)).outcome).toBe('denied');
    expect(classifyResponse({ method: 'GET' }, res(500)).outcome).toBe('failed');
    expect(classifyResponse({ method: 'GET' }, res(200), true).outcome).toBe('interrupted');
    expect(classifyResponse({ method: 'GET', evidenceAction: 'download_link_issued' }, res(200)).outcome).toBe('issued');
  });
  it('recognizes nested temporary file links without returning their secrets', () => {
    expect(containsSignedLink({ bundles: [{ url: 'https://storage.example/doc?X-Goog-Signature=SECRET' }] })).toBe(true);
    expect(containsSignedLink('https://example.com/public')).toBe(false);
    expect(containsSignedLink('not a url?Signature=foo')).toBe(false);
  });
  it('does not classify metadata, cache validation or empty responses as delivered files', () => {
    const res = statusCode => ({ statusCode, getHeader: name => name === 'content-type' ? 'application/pdf' : '' });
    expect(classifyResponse({ method: 'HEAD' }, res(200))).toEqual({ action: 'file_metadata', outcome: 'metadata_only' });
    expect(classifyResponse({ method: 'GET' }, res(304)).outcome).toBe('not_modified');
    expect(classifyResponse({ method: 'GET' }, res(204)).outcome).toBe('no_content');
    expect(classifyResponse({ method: 'GET' }, res(302)).outcome).toBe('redirected');
    expect(classifyResponse({ method: 'HEAD' }, res(403)).outcome).toBe('denied');
  });
  it('retains only validated numeric range and size information', () => {
    const response = headers => ({ statusCode: 206, getHeader: name => headers[name] });
    expect(responseEvidence({ method: 'GET' }, response({ 'content-range': 'bytes 10-19/100', 'content-length': '10' }))).toEqual({ transfer: { bodyPermitted: true, partial: true, declaredBytes: 10, rangeStart: 10, rangeEnd: 19, resourceBytes: 100 } });
    for (const range of ['private.pdf', 'bytes 20-10/100', 'bytes 10-19/15', 'bytes 0-999999999999999999999/100']) {
      expect(responseEvidence({ method: 'GET' }, response({ 'content-range': range, 'content-length': 'secret' }))).toEqual({ transfer: { bodyPermitted: true, partial: true } });
    }
  });
  it('prevents formula injection in exported evidence', () => {
    for (const value of ['=HYPERLINK("bad")', '+cmd', '-1+1', '@SUM(A1)', '\t=CMD()']) expect(csvCell(value)).toMatch(/^"'/);
    expect(csvCell('ordinary,"value"')).toBe('"ordinary,""value"""');
  });
});
