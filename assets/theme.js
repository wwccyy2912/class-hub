/* 外观与偏好设置：首屏前应用主题，并管理播放/显示开关（保存在本地） */
(function(){
 var THEME_KEY='class-hub-theme',PREF_KEY='class-hub-prefs',ORDER=['auto','light','dark'],LABELS={auto:'跟随系统',light:'浅色',dark:'深色'};
 var DEFAULTS={autoplay:true,autonext:true,hints:true,net:'auto'},NET_CHOICES=['auto','lite','balanced','quality'];
 var root=document.documentElement;
 var media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
 function preference(){try{var value=localStorage.getItem(THEME_KEY);return ORDER.indexOf(value)>=0?value:'auto'}catch(error){return 'auto'}}
 function prefs(){var stored={};try{stored=JSON.parse(localStorage.getItem(PREF_KEY)||'{}')||{}}catch(error){stored={}}
  var merged={};for(var key in DEFAULTS){var fallback=DEFAULTS[key],value=stored[key];merged[key]=typeof fallback==='boolean'?(typeof value==='boolean'?value:fallback):(typeof value==='string'&&value?value:fallback)}return merged}
 function paintTheme(mode){
  if(media)root.setAttribute('data-system',media.matches?'dark':'light');
  if(mode==='auto')root.removeAttribute('data-theme');else root.setAttribute('data-theme',mode);
  root.setAttribute('data-theme-mode',mode);
  document.querySelectorAll('[data-theme-choice]').forEach(function(button){button.classList.toggle('active',button.dataset.themeChoice===mode)});
 }
 function netChoice(){var value=prefs().net;return NET_CHOICES.indexOf(value)>=0?value:'auto'}
 function paintPrefs(){
  var current=prefs();
  document.querySelectorAll('[data-pref]').forEach(function(button){button.setAttribute('aria-checked',current[button.dataset.pref]?'true':'false')});
  var picked=netChoice();
  document.querySelectorAll('[data-net-choice]').forEach(function(button){button.classList.toggle('active',button.dataset.netChoice===picked)});
 }
 function setTheme(mode){try{localStorage.setItem(THEME_KEY,mode)}catch(error){}paintTheme(mode);broadcast()}
 function setPref(key,value){var next=prefs();next[key]=typeof value==='boolean'?value:String(value);try{localStorage.setItem(PREF_KEY,JSON.stringify(next))}catch(error){}paintPrefs();broadcast()}
 function broadcast(){window.dispatchEvent(new CustomEvent('classhub:prefs',{detail:{theme:preference(),prefs:prefs()}}))}
 paintTheme(preference());paintPrefs();
 if(media){var onChange=function(){paintTheme(preference())};if(media.addEventListener)media.addEventListener('change',onChange);else if(media.addListener)media.addListener(onChange)}
 function closePanels(){document.querySelectorAll('.panel-drop.open').forEach(function(panel){panel.classList.remove('open')});document.querySelectorAll('[aria-controls$="Panel"]').forEach(function(button){button.setAttribute('aria-expanded','false')})}
 function wire(){
  var toggle=document.getElementById('prefsToggle'),panel=document.getElementById('prefsPanel');
  if(toggle&&panel&&!toggle.dataset.wired){
   toggle.dataset.wired='1';
   toggle.addEventListener('click',function(event){event.stopPropagation();var open=panel.classList.toggle('open');toggle.setAttribute('aria-expanded',open?'true':'false');if(open)paintPrefs()});
   panel.addEventListener('click',function(event){event.stopPropagation()});
  }
  var scope=document.getElementById('prefsPanel')||document;
  scope.addEventListener('click',function(event){
   var choice=event.target.closest?event.target.closest('[data-theme-choice]'):null;
   if(choice){setTheme(choice.dataset.themeChoice);return}
   var netButton=event.target.closest?event.target.closest('[data-net-choice]'):null;
   if(netButton){setPref('net',netButton.dataset.netChoice);return}
   var toggleSwitch=event.target.closest?event.target.closest('[data-pref]'):null;
   if(toggleSwitch){setPref(toggleSwitch.dataset.pref,toggleSwitch.getAttribute('aria-checked')!=='true')}
  });
  document.addEventListener('click',closePanels);
  document.addEventListener('keydown',function(event){if(event.key==='Escape')closePanels()});
  paintTheme(preference());paintPrefs();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
 window.__classHubPrefs={get:function(key){return prefs()[key]},set:setPref,all:prefs,theme:preference,setTheme:setTheme,netChoice:netChoice};
})();