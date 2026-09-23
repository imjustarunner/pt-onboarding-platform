// Dedicated synthetic database only. No .env or application credentials are used.
// Start an isolated MySQL server with socket /private/tmp/latinx-directory-test.sock,
// an empty root password and networking disabled before running this test.
import {spawnSync} from 'node:child_process';
const root=new URL('../../',import.meta.url).pathname;
const result=spawnSync(`${root}frontend/node_modules/.bin/vitest`,['run','--config','backend/vitest.directory.config.js'],{cwd:root,stdio:'inherit',env:{...process.env,PROVIDER_DIRECTORY_TEST_SOCKET:'/private/tmp/latinx-directory-test.sock'}});
process.exit(result.status??1);
