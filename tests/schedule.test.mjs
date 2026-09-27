import test from 'node:test';
import assert from 'node:assert/strict';
import {beijingDate,addDays,weekdayIndex,dayInfo,planFor,buildMonth,monthHolidays,reminderTitle,reminderDetail,isoWeekNumber,weekInfo,teachingWeek,termWeeks,periodText,weeksText,upcoming,upcomingDays,upcomingText} from '../src/shared/schedule.mjs';

const holidays={'2026-10-01':{name:'国庆节',off:true},'2026-10-02':{name:'国庆节',off:true},'2026-10-10':{name:'国庆节',off:false}};
const courses=[{id:'1',weekday:2,period:2,name:'数学',teacher:'王老师',room:'高一(1)班',start:'09:00',end:'09:45'},{id:'2',weekday:2,period:1,name:'语文'}];

test('按北京时间计算今天，日期加减跨月跨年',()=>{
 assert.equal(beijingDate(Date.UTC(2026,8,27,16,30)),'2026-09-28');
 assert.equal(beijingDate(Date.UTC(2026,8,27,15,30)),'2026-09-27');
 assert.equal(addDays('2026-09-30',1),'2026-10-01');
 assert.equal(addDays('2026-01-01',-1),'2025-12-31');
});

test('星期编号为 1（周一）到 7（周日）',()=>{
 assert.equal(weekdayIndex('2026-09-28'),1);
 assert.equal(weekdayIndex('2026-10-04'),7);
 assert.equal(weekdayIndex('2026-10-03'),6);
});

test('区分法定放假、调休上班、普通周末与工作日',()=>{
 const holiday=dayInfo('2026-10-01',holidays);
 assert.equal(holiday.kind,'holiday');assert.equal(holiday.name,'国庆节');assert.equal(holiday.label,'放假');assert.equal(holiday.school,false);
 const makeup=dayInfo('2026-10-10',holidays);
 assert.equal(makeup.kind,'makeup');assert.equal(makeup.label,'调休上班');assert.equal(makeup.school,true);
 assert.equal(dayInfo('2026-10-03',holidays).kind,'weekend');
 assert.equal(dayInfo('2026-09-29',{}).kind,'workday');
});

test('明天课程提醒必须带完整日期',()=>{
 const plan=planFor('2026-09-29',{},courses);
 assert.equal(plan.periodCount,2);
 assert.equal(plan.courses[0].name,'语文','按节次排序');
 assert.equal(reminderTitle(plan,'明天'),'明天 2026年9月29日 周二');
 assert.match(reminderDetail(plan),/共 2 节/);
 const holiday=planFor('2026-10-01',holidays,courses);
 assert.equal(holiday.courses.length,0);assert.equal(holiday.courseCount,0);
 assert.equal(reminderTitle(holiday,'明天'),'明天 2026年10月1日 周四');
 assert.match(reminderDetail(holiday),/国庆节放假/);
 assert.match(reminderDetail(planFor('2026-10-03',holidays,courses)),/周末休息/);
 assert.match(reminderDetail(planFor('2026-10-10',holidays,courses)),/调休上班/);
});

test('月历与本月节假日分组',()=>{
 const month=buildMonth(2026,10,holidays);
 assert.equal(month.days.length,31);assert.equal(month.firstWeekday,4);assert.equal(month.days[0].date,'2026-10-01');
 const groups=monthHolidays(2026,10,holidays);
 assert.equal(groups.length,2);
 assert.equal(groups[0].label,'10月1日 – 10月2日');assert.equal(groups[0].kind,'holiday');
 assert.equal(groups[1].label,'10月10日');assert.equal(groups[1].kind,'makeup');
});

test('单双周：设置学期开始后按教学周，未设置时退回自然周',()=>{
 assert.equal(isoWeekNumber('2026-09-28'),40);
 assert.deepEqual(weekInfo('2026-09-28'),{number:40,parity:'even',source:'iso'});
 assert.equal(teachingWeek('2026-09-01','2026-09-01'),1);
 assert.equal(teachingWeek('2026-09-08','2026-09-01'),2);
 assert.equal(teachingWeek('2026-08-31','2026-09-01'),null,'学期开始前没有教学周');
 assert.deepEqual(weekInfo('2026-09-30','2026-09-01'),{number:5,parity:'odd',source:'term'});
 const weeks=termWeeks('2026-09-01',3);
 assert.deepEqual(weeks.map(w=>w.number+':'+w.parity),['1:odd','2:even','3:odd']);
 assert.equal(weeks[1].start,'2026-09-08');assert.equal(weeks[1].end,'2026-09-14');
 const list=[{id:'a',weekday:3,period:1,name:'单周课',weeks:'odd'},{id:'b',weekday:3,period:2,name:'双周课',weeks:'even'},{id:'c',weekday:3,period:3,name:'每周课',weeks:'all'}];
 const term=planFor('2026-09-30',{},list,{termStart:'2026-09-01'});
 assert.deepEqual(term.courses.map(c=>c.name),['单周课','每周课'],'教学周第 5 周为单周');
 assert.equal(term.weekNumber,5);assert.equal(term.weekSource,'term');
 const natural=planFor('2026-09-30',{},list);
 assert.equal(natural.weekSource,'iso');
 assert.deepEqual(natural.courses.map(c=>c.name),['双周课','每周课']);
 assert.equal(weeksText({weeks:'odd'}),'单周');assert.equal(weeksText({weeks:'all'}),'');
});

test('自定义事件（运动会/考试）与节假日一起进入倒计时',()=>{
 const events=[{date:'2026-10-15',name:'运动会',note:''},{date:'2026-11-05',name:'期中考试',note:''}];
 const list=upcoming(holidays,events,'2026-09-28',{range:20,limit:3});
 assert.equal(list.length,3);
 assert.equal(list[0].kind,'holiday');assert.equal(list[0].name,'国庆节');
 assert.equal(list[1].kind,'makeup');
 assert.equal(list[2].kind,'event');assert.equal(list[2].name,'运动会');assert.equal(list[2].label,'活动');
 assert.equal(upcomingText(list[2]),'17 天后（2026年10月15日 周四）· 运动会');
 assert.equal(upcoming(holidays,events,'2026-09-28',{range:45,limit:8}).length,4);
 assert.equal(upcoming(holidays,events,'2026-09-28',{range:20,limit:2}).length,2,'按条数上限截断');
});

test('连堂按节数统计并给出节次区间',()=>{
 const list=[{id:'a',weekday:2,period:1,span:2,name:'数学',weeks:'all'},{id:'b',weekday:2,period:3,span:1,name:'体育',weeks:'all'}];
 const plan=planFor('2026-09-29',{},list);
 assert.equal(plan.courseCount,2,'两门课');
 assert.equal(plan.periodCount,3,'共占三节');
 assert.equal(periodText(list[0]),'第 1–2 节');
 assert.equal(periodText(list[1]),'第 3 节');
});

test('调休上班日按指定星期的课表上课',()=>{
 const map={'2026-10-10':{name:'国庆节',off:false,follow:1}};
 const plan=planFor('2026-10-10',map,[{id:'a',weekday:1,period:1,span:1,weeks:'all',name:'语文'},{id:'b',weekday:6,period:1,span:1,weeks:'all',name:'周六课'}]);
 assert.equal(plan.kind,'makeup');assert.equal(plan.follow,1);assert.equal(plan.followText,'周一');
 assert.deepEqual(plan.courses.map(c=>c.name),['语文']);
 assert.equal(reminderTitle(plan,'明天'),'明天 2026年10月10日 周六');
 assert.match(reminderDetail(plan),/按周一课表上课，共 1 节/);
 const plain=planFor('2026-10-10',{'2026-10-10':{name:'国庆节',off:false}},[]);
 assert.match(reminderDetail(plain),/调休上班，按课表上课/);
});

test('临近节假日提醒带倒计时与区间',()=>{
 const upcoming=upcomingDays(holidays,'2026-09-28',14,3);
 assert.equal(upcoming.length,2);
 assert.equal(upcoming[0].name,'国庆节');assert.equal(upcoming[0].kind,'holiday');
 assert.equal(upcoming[0].daysAhead,3);assert.equal(upcoming[0].days,2);
 assert.equal(upcomingText(upcoming[0]),'3 天后（2026年10月1日 周四）· 国庆节 放假，共 2 天');
 assert.equal(upcoming[1].kind,'makeup');assert.equal(upcoming[1].daysAhead,12);
 assert.equal(upcomingDays({},'2026-09-28').length,0);
});
