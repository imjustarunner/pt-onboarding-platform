// A new disposable MySQL instance, synthetic data only, no TCP listener or project credentials.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
const backend=fileURLToPath(new URL('../../',import.meta.url));
const binary=process.env.CLINICAL_TEST_MYSQLD||'/opt/homebrew/opt/mysql/bin/mysqld';
const directory=await fs.mkdtemp('/private/tmp/clinical-encounter-test.');
await fs.chmod(directory,0o700);
const socket=`${directory}/mysql.sock`;
let server;
async function run(command,args,options={}){const child=spawn(command,args,{cwd:backend,stdio:'inherit',...options});const [code]=await once(child,'exit');if(code!==0)throw new Error(`Synthetic validation failed (${code}).`);}
try{
 await run(binary,['--no-defaults','--initialize-insecure',`--datadir=${directory}/data`,`--log-error=${directory}/mysql.log`]);
 server=spawn(binary,['--no-defaults',`--datadir=${directory}/data`,`--socket=${socket}`,`--pid-file=${directory}/mysql.pid`,`--log-error=${directory}/mysql.log`,'--skip-networking','--mysqlx=0','--skip-log-bin','--innodb-buffer-pool-size=67108864'],{stdio:'ignore'});
 let ready=false;
 for(let n=0;n<80;n++){try{const db=await mysql.createConnection({socketPath:socket,user:'root',connectTimeout:500});await db.end();ready=true;break;}catch{if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,250));}}
 if(!ready)throw new Error('Disposable MySQL could not start.');
 await run('../frontend/node_modules/.bin/vitest',['run','--config','vitest.meeting-launch.config.js','src/services/__tests__/meetingClinical.mysql.test.js'],{env:{...process.env,CLINICAL_TEST_SOCKET:socket}});
}finally{
 if(server&&server.exitCode===null){server.kill('SIGTERM');await once(server,'exit');}
 await fs.rm(directory,{recursive:true,force:true});
}
