export const smtpOptions = {
  host: 'smtp-relay.gmail.com', port: 587, secure: false, requireTLS: true,
  name: 'mail.plottwistco.com', pool: true, maxConnections: 2, maxMessages: 50,
  // A socket closing after DATA may mean accepted mail. Nodemailer's default
  // pool requeues indefinitely; let our durable delivery state handle review.
  maxRequeues: 0,
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  tls: { servername: 'smtp-relay.gmail.com', minVersion: 'TLSv1.2', rejectUnauthorized: true },
  disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false
};
