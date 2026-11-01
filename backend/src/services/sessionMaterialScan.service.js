import net from 'node:net';
import path from 'node:path';

/** PHI never leaves this host for scanning. Unavailable/incomplete scans stay pending. */
export async function scanSessionMaterial(buffer, { socketPath = process.env.CLAMAV_SOCKET_PATH, connect = net.createConnection } = {}) {
  if (!socketPath || !path.isAbsolute(socketPath)) return { status: 'pending', reason: 'Private local malware scanning is not configured.' };
  return new Promise(resolve => {
    let settled = false;
    let response = '';
    const socket = connect({ path: socketPath });
    const finish = result => { if (settled) return; settled = true; socket.destroy(); resolve(result); };
    socket.setTimeout(15000, () => finish({ status: 'pending', reason: 'Private local malware scan timed out.' }));
    socket.on('error', () => finish({ status: 'pending', reason: 'Private local malware scanning is unavailable.' }));
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let offset = 0; offset < buffer.length; offset += 65536) {
        const chunk = buffer.subarray(offset, offset + 65536);
        const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length);
        socket.write(length); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on('data', chunk => {
      response += chunk.toString('utf8');
      if (response.length > 4096) return finish({ status: 'pending', reason: 'Private local malware scan returned an invalid response.' });
      if (!/[\0\n]/.test(response)) return;
      if (/^stream: OK[\0\n]/.test(response)) finish({ status: 'clean' });
      else if (/^stream: .+ FOUND[\0\n]/.test(response)) finish({ status: 'infected' });
      else finish({ status: 'pending', reason: 'Private local malware scan did not complete.' });
    });
    socket.on('end', () => finish({ status: 'pending', reason: 'Private local malware scan did not complete.' }));
    socket.on('close', () => finish({ status: 'pending', reason: 'Private local malware scan did not complete.' }));
  });
}
