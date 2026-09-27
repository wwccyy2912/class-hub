import assert from 'node:assert/strict';
import {request,adminSession,adminUser,adminPassword} from './helpers.mjs';

await adminSession();
for(let i=1;i<=45;i++){
 const r=await request('/login',{method:'POST',body:{username:adminUser,password:adminPassword}});
 assert.equal(r.status,200,'第 '+i+' 次成功登录被拒绝：'+JSON.stringify(r.data));
}
console.log('PASS: 连续 45 次成功登录均返回 200，成功登录不再消耗尝试额度。');

const username='lock'+Date.now();
for(let i=1;i<=12;i++){
 const r=await request('/login',{method:'POST',body:{username,password:'Wrong-Password-000!'}});
 assert.equal(r.status,401,'第 '+i+' 次错误密码应返回 401，实际 '+r.status+' '+JSON.stringify(r.data));
}
const limited=await request('/login',{method:'POST',body:{username,password:'Wrong-Password-000!'}});
assert.equal(limited.status,429,'连续失败达到上限后应返回 429，实际 '+limited.status);
console.log('PASS: 同一账号连续 12 次密码错误后，第 13 次返回 429。');

const ok=await request('/login',{method:'POST',body:{username:adminUser,password:adminPassword}});
assert.equal(ok.status,200,'失败计数不应影响正常账号：'+JSON.stringify(ok.data));
console.log('PASS: 成功登录清零计数，管理员仍可正常登录。');
