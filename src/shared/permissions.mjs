// 权限清单与判定：管理员（role=admin）拥有全部权限；普通成员按用户组或手动指定的权限。
export const permissionList=[
 {key:'upload',label:'上传与管理资料',hint:'上传文件、改标题、删除资料'},
 {key:'sites',label:'站点管理',hint:'新建、编辑、删除专题站点'},
 {key:'accounts',label:'账户与用户组',hint:'创建账户、重置密码、停用账户、管理用户组'},
 {key:'courses',label:'课程表',hint:'维护课程、批量导入、教学周与提醒设置'},
 {key:'calendar',label:'日历与事件',hint:'同步节假日、覆盖某一天、自定义事件与调休'},
 {key:'brand',label:'网站信息',hint:'修改学校名称、班级名称与网站副标题'}
];
export const permissionKeys=permissionList.map(item=>item.key);
export const permissionLabel=key=>(permissionList.find(item=>item.key===key)||{}).label||key;
export function cleanPermissions(input){
 if(input===undefined||input===null)return [];
 const list=Array.isArray(input)?input:String(input).split(',');
 const out=[];
 for(const item of list){const key=String(item).trim();if(permissionKeys.includes(key)&&!out.includes(key))out.push(key)}
 return out;
}
export function parsePermissions(value){
 if(Array.isArray(value))return cleanPermissions(value);
 try{return cleanPermissions(JSON.parse(String(value||'[]')))}catch(error){return []}
}
export function permissionsOf(user){
 if(!user)return [];
 if(user.role==='admin')return [...permissionKeys];
 return parsePermissions(user.permissions);
}
export const can=(user,key)=>permissionsOf(user).includes(key);
export function needs(user,key,message){
 if(can(user,key))return true;
 throw Object.assign(Error(message||('当前账户没有“'+permissionLabel(key)+'”权限，请联系管理员')),{status:403});
}
export const permissionText=user=>{const list=permissionsOf(user);return user&&user.role==='admin'?'管理员（全部权限）':list.length?list.map(permissionLabel).join('、'):'只读成员'};
