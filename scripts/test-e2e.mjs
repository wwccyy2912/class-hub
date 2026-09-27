import {spawn,spawnSync} from 'node:child_process';
import process from 'node:process';

const port=Number(process.env.E2E_PORT||4173);
const base=process.env.BASE_URL||'http://127.0.0.1:'+port;
const suites=['tests/permissions.mjs','tests/chat.mjs','tests/upload-large.mjs','tests/integration.mjs','tests/office-integration.mjs','tests/rate-limit.mjs'];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const failed=[];
let server=null;

async function reachable(){try{const response=await fetch(base+'/api/me');return response.ok}catch{return false}}
async function waitReady(seconds){for(let i=0;i<seconds*2;i++){if(await reachable())return true;await sleep(500)}return false}
function stop(code){
 if(server){try{process.kill(-server.pid,'SIGTERM')}catch{}}
 console.log(failed.length?'\n端到端检查失败：'+failed.join('、'):'\n端到端检查全部通过。');
 process.exit(code);
}

if(await reachable()){
 console.log('复用已在 '+base+' 运行的开发服务器。');
}else{
 console.log('应用本地数据库迁移…');
 const migrate=spawnSync('npx',['wrangler','d1','migrations','apply','DB','--local'],{stdio:'inherit'});
 if(migrate.status)process.exit(migrate.status||1);
 console.log('启动 wrangler dev（127.0.0.1:'+port+'）…');
 server=spawn('npx',['wrangler','dev','--ip','127.0.0.1','--port',String(port)],{stdio:['ignore','pipe','pipe'],detached:true});
 server.stdout.on('data',chunk=>process.stdout.write('[dev] '+chunk));
 server.stderr.on('data',chunk=>process.stderr.write('[dev] '+chunk));
 if(!await waitReady(90)){console.error('开发服务器启动超时。');failed.push('wrangler dev');stop(1)}
}

// 确保站点已初始化（不再有内置 admin 账号）
{const state=await (await fetch(base+'/api/me')).json();if(state.setup){const created=await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({school:'测试学校',className:'测试班级',username:process.env.ADMIN_USER||'owner',name:'测试管理员',password:process.env.ADMIN_PASSWORD||'E2E-Admin-Password-827!',password2:process.env.ADMIN_PASSWORD||'E2E-Admin-Password-827!'})});console.log('初始化站点：'+created.status)}}
const adminUser=process.env.ADMIN_USER||'owner',adminPassword=process.env.ADMIN_PASSWORD||'E2E-Admin-Password-827!';
for(const suite of suites){
 console.log('\n=== '+suite+' ===');
 const result=spawnSync('node',[suite],{stdio:'inherit',env:{...process.env,BASE_URL:base,ADMIN_USER:process.env.ADMIN_USER||'owner',ADMIN_PASSWORD:process.env.ADMIN_PASSWORD||'E2E-Admin-Password-827!'}});
 if(result.status)failed.push(suite);
}
stop(failed.length?1:0);