import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import nodemailer from 'nodemailer';
import { smtpOptions } from '../smtpOptions.js';

test('an SMTP socket closing after DATA is not automatically requeued', async () => {
  assert.equal(smtpOptions.requireTLS, true);
  assert.equal(smtpOptions.tls.rejectUnauthorized, true);
  let connections = 0;
  const server = net.createServer(socket => {
    connections += 1;
    socket.write('220 synthetic.local SMTP\r\n');
    let buffered = '', data = false;
    socket.on('data', chunk => {
      buffered += chunk;
      if (data) {
        if (buffered.includes('\r\n.\r\n')) socket.destroy();
        return;
      }
      let newline;
      while ((newline = buffered.indexOf('\r\n')) >= 0) {
        const command = buffered.slice(0, newline); buffered = buffered.slice(newline + 2);
        if (/^(EHLO|HELO)/.test(command)) socket.write('250 synthetic.local\r\n');
        else if (/^(MAIL FROM|RCPT TO)/.test(command)) socket.write('250 OK\r\n');
        else if (command === 'DATA') { data = true; socket.write('354 Continue\r\n'); }
        else if (command === 'QUIT') socket.end('221 Bye\r\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const smtp = nodemailer.createTransport({ ...smtpOptions, host: '127.0.0.1', port: server.address().port, requireTLS: false, ignoreTLS: true, socketTimeout: 1000 });
  try {
    await assert.rejects(() => smtp.sendMail({ envelope: { from: 'demo@example.com', to: ['payer@example.com'] }, raw: 'From: demo@example.com\r\nTo: payer@example.com\r\n\r\nSynthetic only\r\n' }));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(connections, 1);
  } finally {
    smtp.close();
    await new Promise(resolve => server.close(resolve));
  }
});
