// Local-only optional intelligence service. No client data is sent to this stack.
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseEnv } from 'node:util';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'.cache/worldmonitor');
const commit='1ec0af6f33db2bc14d9339bd365dbf52846ccc7f';
const run=(cmd,args,options={})=>{const r=spawnSync(cmd,args,{cwd:root,stdio:'inherit',...options});if(r.status!==0)throw new Error(`${cmd} failed`);return r;};
if(!existsSync(source))run('git',['clone','https://github.com/koala73/worldmonitor.git',source]);
const head=run('git',['-C',source,'rev-parse','HEAD'],{stdio:'pipe'}).stdout.toString().trim();
if(head!==commit){
 const dirty=run('git',['-C',source,'status','--porcelain'],{stdio:'pipe'}).stdout.toString().trim();
 if(dirty)throw new Error('World Monitor checkout has local edits; preserve them before selecting the pinned release.');
 run('git',['-C',source,'fetch','origin',commit]);run('git',['-C',source,'checkout','--detach',commit]);
}
const envPath=path.join(source,'.env');
if(!existsSync(envPath))writeFileSync(envPath,[...['REDIS_PASSWORD','REDIS_TOKEN','WM_SESSION_SECRET','RELAY_SHARED_SECRET'].map(k=>`${k}=${randomBytes(32).toString('hex')}`),`WORLDMONITOR_VALID_KEYS=wm_${randomBytes(24).toString('hex')}`,'WM_PORT=127.0.0.1:6901',''].join('\n'),{mode:0o600});
chmodSync(envPath,0o600);
const env=parseEnv(readFileSync(envPath,'utf8'));
if(!env.WORLDMONITOR_VALID_KEYS?.startsWith('wm_'))throw new Error('Local World Monitor needs a configured operator key.');
if(env.WM_PORT!=='127.0.0.1:6901')throw new Error('This setup expects World Monitor bound to 127.0.0.1:6901.');
const appEnv=path.join(root,'.env.local');
const existing=existsSync(appEnv)?readFileSync(appEnv,'utf8'):'';
writeFileSync(appEnv,existing.split('\n').filter(l=>!/^WORLDMONITOR_(BASE_URL|API_KEY)=/.test(l)).join('\n').trimEnd()+`\nWORLDMONITOR_BASE_URL=http://127.0.0.1:6901\nWORLDMONITOR_API_KEY=${env.WORLDMONITOR_VALID_KEYS.split(',')[0]}\n`,{mode:0o600});
chmodSync(appEnv,0o600);
// Compose does not automatically read the app's .env.local. Later files win.
run('docker',['compose','--env-file',envPath,'--env-file',appEnv,'-f',path.join(source,'docker-compose.yml'),'-f','deploy/worldmonitor/compose.override.yml','-p','compass-worldmonitor','up','-d','--build']);
console.log('World Monitor API: http://127.0.0.1:6901/api/sidecar-health. Restart Vite if it did not reload .env.local.');
