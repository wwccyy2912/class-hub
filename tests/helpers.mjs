import assert from 'node:assert/strict';
export const base=process.env.BASE_URL||'http://127.0.0.1:4173';
export const adminUser=process.env.ADMIN_USER||'owner';
export const adminPassword=process.env.ADMIN_PASSWORD||'Local-New-Password-827!';
export async function request(path,{cookie,body,method='GET',origin=base,headers={}}={}){
 const finalHeaders={Origin:origin,...headers};if(cookie)finalHeaders.Cookie=cookie;
 if(body&&!(body instanceof FormData)){finalHeaders['Content-Type']='application/json';body=JSON.stringify(body)}
 const response=await fetch(base+'/api'+path,{method,headers:finalHeaders,body});
 const type=response.headers.get('content-type')||'';
 return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers,data:type.includes('json')?await response.json():new Uint8Array(await response.arrayBuffer())};
}
export async function raw(path,{origin=base}={}){
 const response=await fetch(base+path,{headers:{Origin:origin}});
 return {status:response.status,headers:response.headers};
}
export async function loginAdmin(){
 if((await (await fetch(base+'/api/me')).json()).setup){const created=await request('/setup',{method:'POST',body:{school:'测试学校',className:'测试班级',username:adminUser,name:'测试管理员',password:adminPassword,password2:adminPassword}});if(created.status!==201)throw new Error('初始化失败：'+JSON.stringify(created.data));return {cookie:created.cookie,user:created.data.user,password:adminPassword}} let result=await request('/login',{method:'POST',body:{username:adminUser,password:adminPassword}}),password=adminPassword;
 
 if(result.status!==200)throw new Error('管理员登录失败：'+JSON.stringify(result.data)+'\n本地数据库里的 admin 密码不是测试密码，请先重置本地数据后重试：rm -rf .wrangler/state && npm run db:migrate');
 return {cookie:result.cookie,user:result.data.user,password};
}
export async function adminSession(){
 const {cookie,user,password}=await loginAdmin();
 if(!user.mustChange)return cookie;
 const changed=await request('/password',{method:'POST',cookie,body:{oldPassword:password,password:adminPassword}});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 return changed.cookie;
}
