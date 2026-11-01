import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { scanSessionMaterial } from '../sessionMaterialScan.service.js';
const connection = () => { const socket = new EventEmitter(); socket.write = vi.fn(); socket.destroy = vi.fn(); socket.setTimeout = vi.fn(); return socket; };
describe('host-local session material scan', () => {
  it('leaves uploads pending without a local Unix socket and never opens an external connection', async () => {
    const connect = vi.fn(); expect(await scanSessionMaterial(Buffer.from('phi'), { socketPath: '', connect })).toMatchObject({ status: 'pending' }); expect(connect).not.toHaveBeenCalled();
  });
  it.each([['stream: OK\0', 'clean'], ['stream: TestSignature FOUND\0', 'infected'], ['stream: scan failed ERROR\0', 'pending']])('handles %s honestly', async (response, status) => {
    const socket = connection(), connect = vi.fn(() => socket);
    const promise = scanSessionMaterial(Buffer.from('phi'), { socketPath: '/run/clamav/clamd.sock', connect });
    socket.emit('connect'); socket.emit('data', Buffer.from(response));
    expect(await promise).toMatchObject({ status }); expect(connect).toHaveBeenCalledWith({ path: '/run/clamav/clamd.sock' }); expect(socket.write.mock.calls[0][0]).toBe('zINSTREAM\0');
  });
  it('does not mistake an incomplete clean-looking response for a completed scan', async () => {
    const socket = connection(); const promise = scanSessionMaterial(Buffer.from('phi'), { socketPath: '/run/clamav/clamd.sock', connect: () => socket });
    socket.emit('data', Buffer.from('stream: OK')); socket.emit('end'); expect(await promise).toMatchObject({ status: 'pending' });
  });
});
