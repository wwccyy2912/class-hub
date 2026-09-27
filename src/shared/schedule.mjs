// 日期/节假日/教学周/课程提醒的纯函数：浏览器与 Worker 共用，可直接单元测试。
export const weekdayNames=['周一','周二','周三','周四','周五','周六','周日'];
export const beijingDate=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
export const isDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
export function addDays(date,count){const t=new Date(date+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+count);return t.toISOString().slice(0,10)}
export function weekdayIndex(date){const day=new Date(date+'T00:00:00Z').getUTCDay();return day===0?7:day}
export function formatDate(date){const [y,m,d]=date.split('-').map(Number);return y+'年'+m+'月'+d+'日'}
export function formatShort(date){const [,m,d]=date.split('-').map(Number);return m+'月'+d+'日'}
export function daysBetween(from,to){return Math.round((new Date(to+'T00:00:00Z')-new Date(from+'T00:00:00Z'))/86400000)}
export function isoWeekNumber(date){
 const day=new Date(date+'T00:00:00Z'),thursday=new Date(day);
 thursday.setUTCDate(thursday.getUTCDate()+3-((thursday.getUTCDay()+6)%7));
 const firstThursday=new Date(Date.UTC(thursday.getUTCFullYear(),0,4));
 firstThursday.setUTCDate(firstThursday.getUTCDate()+3-((firstThursday.getUTCDay()+6)%7));
 return 1+Math.round((thursday-firstThursday)/(7*86400000));
}
// 教学周：以管理员设置的学期开始日期为第 1 周第一天；未设置时退回 ISO 周次。
export function teachingWeek(date,termStart){
 if(!isDate(termStart))return null;
 const offset=daysBetween(termStart,date);
 if(offset<0)return null;
 return Math.floor(offset/7)+1;
}
export function termWeeks(termStart,count=20){
 if(!isDate(termStart))return [];
 const weeks=[];
 for(let index=0;index<count;index++){const start=addDays(termStart,index*7);weeks.push({number:index+1,start,end:addDays(start,6),parity:(index+1)%2===1?'odd':'even'})}
 return weeks;
}
export function weekInfo(date,termStart){
 const week=teachingWeek(date,termStart);
 if(week)return {number:week,parity:week%2===1?'odd':'even',source:'term'};
 const iso=isoWeekNumber(date);
 return {number:iso,parity:iso%2===1?'odd':'even',source:'iso'};
}
export const weekMatches=(weeks,parity)=>!weeks||weeks==='all'||weeks===parity;
export function dayInfo(date,holidays={}){
 const weekday=weekdayIndex(date),holiday=holidays[date];
 if(holiday){
  const makeup=!holiday.off,follow=makeup?(Number(holiday.follow)||0):0;
  return {date,weekday,weekdayText:weekdayNames[weekday-1],kind:makeup?'makeup':'holiday',name:holiday.name||'',label:makeup?'调休上班':'放假',school:makeup,follow,courseWeekday:makeup&&follow?follow:weekday,followText:makeup&&follow?weekdayNames[follow-1]:''};
 }
 if(weekday>=6)return {date,weekday,weekdayText:weekdayNames[weekday-1],kind:'weekend',name:'',label:'周末',school:false,follow:0,courseWeekday:weekday,followText:''};
 return {date,weekday,weekdayText:weekdayNames[weekday-1],kind:'workday',name:'',label:'上课',school:true,follow:0,courseWeekday:weekday,followText:''};
}
export function sortCourses(courses){return [...(courses||[])].sort((a,b)=>a.weekday-b.weekday||a.period-b.period||String(a.start||'').localeCompare(String(b.start||'')))}
export function planFor(date,holidays={},courses=[],options={}){
 const info=dayInfo(date,holidays),week=weekInfo(date,options.termStart);
 const list=sortCourses(courses).filter(c=>c.weekday===info.courseWeekday&&weekMatches(c.weeks,week.parity));
 const periodCount=list.reduce((sum,c)=>sum+Math.max(1,Number(c.span)||1),0);
 return {...info,weekNumber:week.number,weekParity:week.parity,weekSource:week.source,dateText:formatDate(date),shortText:formatShort(date),courses:info.school?list:[],courseCount:info.school?list.length:0,periodCount:info.school?periodCount:0,plannedCount:list.length};
}
export function periodText(course){const span=Math.max(1,Number(course.span)||1);return span>1?'第 '+course.period+'–'+(course.period+span-1)+' 节':'第 '+course.period+' 节'}
export const weeksText=course=>course.weeks==='odd'?'单周':course.weeks==='even'?'双周':'';
export function reminderTitle(plan,prefix='明天'){return prefix+' '+plan.dateText+' '+plan.weekdayText}
export function reminderDetail(plan){
 if(plan.kind==='holiday')return plan.name+'放假，没有课程。';
 if(plan.kind==='weekend')return '周末休息，没有课程。';
 const base=plan.kind==='makeup'?plan.name+'调休上班'+(plan.followText?'，按'+plan.followText+'课表上课':'，按课表上课'):'按课表上课';
 return plan.periodCount?base+'，共 '+plan.periodCount+' 节。':base+'，还没有排课。';
}
export function buildMonth(year,month,holidays={},events=[]){
 const days=[],first=weekdayIndex(year+'-'+String(month).padStart(2,'0')+'-01'),count=new Date(Date.UTC(year,month,0)).getUTCDate();
 for(let d=1;d<=count;d++){
  const date=year+'-'+String(month).padStart(2,'0')+'-'+String(d).padStart(2,'0'),info=dayInfo(date,holidays);
  days.push({...info,day:d,events:(events||[]).filter(event=>event.date===date).map(event=>({id:event.id,name:event.name,note:event.note||''}))});
 }
 return {year,month,firstWeekday:first,days};
}
export function monthHolidays(year,month,holidays={}){
 const prefix=year+'-'+String(month).padStart(2,'0')+'-';
 const dates=Object.keys(holidays).filter(date=>date.startsWith(prefix)).sort();
 const groups=[];
 for(const date of dates){const info=holidays[date],last=groups[groups.length-1];
  if(last&&last.name===info.name&&last.off===!!info.off&&addDays(last.end,1)===date)last.end=date;
  else groups.push({start:date,end:date,name:info.name,off:!!info.off});
 }
 return groups.map(g=>({...g,date:g.start,label:g.start===g.end?formatShort(g.start):formatShort(g.start)+' – '+formatShort(g.end),kind:g.off?'holiday':'makeup'}));
}
// 倒计时：法定节假日、调休与管理员自定义事件（开学/考试/运动会等）合并排序
export function upcoming(holidays={},events=[],fromDate,options={}){
 const range=Number(options.range)||14,limit=Number(options.limit)||3,items=[];
 for(let offset=0;offset<=range;offset++){
  const date=addDays(fromDate,offset),holiday=holidays[date];
  if(holiday)items.push({date,name:holiday.name,kind:holiday.off?'holiday':'makeup',daysAhead:offset,source:'holiday'});
  for(const event of (events||[]).filter(item=>item.date===date))items.push({date,name:event.name,kind:'event',daysAhead:offset,source:'event',note:event.note||''});
 }
 const groups=[];
 for(const item of items){const last=groups[groups.length-1];
  if(last&&last.name===item.name&&last.kind===item.kind&&addDays(last.end,1)===item.date)last.end=item.date;
  else groups.push({...item,end:item.date});
 }
 return groups.sort((a,b)=>a.date<b.date?-1:1).slice(0,limit).map(group=>{
  const days=daysBetween(group.date,group.end)+1,label=group.kind==='holiday'?'放假':group.kind==='makeup'?'调休上班':'活动';
  return {...group,days,label,dateText:formatDate(group.date),endText:formatDate(group.end),shortText:formatShort(group.date),weekdayText:weekdayNames[weekdayIndex(group.date)-1],range:group.date===group.end?formatShort(group.date):formatShort(group.date)+' – '+formatShort(group.end),daysText:days+' 天'};
 });
}
export const upcomingDays=(holidays,fromDate,range=14,limit=3)=>upcoming(holidays,[],fromDate,{range,limit});
export function upcomingText(item){
 const when=item.daysAhead===0?'今天':item.daysAhead===1?'明天':item.daysAhead+' 天后';
 const suffix=item.kind==='event'?(item.days>1?'，共 '+item.daysText:''):(item.days>1?'，共 '+item.daysText:'');
 return when+'（'+item.dateText+' '+item.weekdayText+'）· '+item.name+(item.kind==='event'?'':' '+item.label)+suffix;
}
