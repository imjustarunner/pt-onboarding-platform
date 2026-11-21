#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const audience = 'https://plottwisthq.com/api/codex-assistant/mail';
const identity = process.env.CODEX_ASSISTANT_GOOGLE_SERVICE_ACCOUNT;
const gcloud = process.env.CODEX_ASSISTANT_GCLOUD || 'gcloud';

async function readRequest() {
  if (process.stdin.isTTY) throw new Error('Supply the authorized email request as JSON on standard input.');
  let request = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    request += chunk;
    if (request.length > 24000) throw new Error('Email request is too large.');
  }
  const parsed = JSON.parse(request);
  if (typeof parsed?.requestId !== 'string') throw new Error('Include a persistent requestId to prevent duplicate sends.');
  return JSON.stringify(parsed);
}

async function main() {
  if (!/^[a-z][a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(identity || '')) {
    throw new Error('Configure the approved Codex Assistant Google service account.');
  }
  const body = await readRequest();
  const preflight = process.argv.includes('--preflight');
  let token;
  try {
    const cloudAccess = execFileSync(gcloud, ['auth', 'print-access-token', '--quiet'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000
    }).trim();
    const iam = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(identity)}:generateIdToken`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${cloudAccess}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience, includeEmail: true })
    });
    if (!iam.ok) throw new Error('Cloud IAM denied the scoped identity token.');
    token = (await iam.json()).token;
    if (typeof token !== 'string' || !token) throw new Error('Cloud IAM returned no identity token.');
  } catch {
    throw new Error('Google Cloud could not authorize the scoped Codex Assistant identity.');
  }
  const response = await fetch(preflight ? `${audience}/preflight` : audience, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body, redirect: 'error', signal: AbortSignal.timeout(45000)
  }).catch(() => { throw new Error('Delivery could not be confirmed. Recheck using the same request ID.'); });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.requestId) {
    throw new Error(data?.error?.message || `Codex Assistant mail endpoint returned ${response.status}.`);
  }
  console.log(JSON.stringify(data));
  if (data.status !== (preflight ? 'ready' : 'sent')) process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof SyntaxError ? 'Provide a valid JSON email request.' : error.message);
  process.exitCode = 1;
});
