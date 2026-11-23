import { formatClock as fmt, dateKey, getStudySkyLevel } from './core/date-time.js';
import { storage } from './data/storage.js';
import { getRemainingSeconds } from './core/timer.js';
import { normalizeTimerSettings, validateBackupPayload, CURRENT_BACKUP_VERSION } from './data/schema.js';
import { createStudyStatsStore } from './data/stats-store.js';
import { mountHourglass } from './features/hourglass.js';
import { createTimerController } from './features/timer-controller.js';
import { mountStudyRoom } from './features/study-room.js';
import { createStudyViews } from './views/study-views.js';
import { createAmbientSoundController } from './features/ambient-sound.js';
import { createNotificationController } from './features/notification-controller.js';
import { createCompletionSoundController } from './features/completion-sound.js';
import { createAppearanceController } from './features/appearance-controller.js';
import { createRecoveryController } from './features/recovery-controller.js';
import { createBackupImportController } from './features/backup-import-controller.js';
const $=id=>document.getElementById(id);
const studyViews=createStudyViews();
let durations={focus:25,short:5,long:15},mode='focus',remaining=1500,total=1500,running=false,deadline=0,completed=0,minutes=0,finished=false,history={},legacyHistory={},records=[],selectedCalendarDate=dateKey(new Date()),dailyGoal=60,weeklyGoal=300,statsStore=null,calendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1),appReady=false,timerController=null;
const labels={focus:'集中する時間',short:'短い休憩',long:'長い休憩'},hints={focus:'ひとつのことに集中しよう。',short:'少し頭を休めよう。',long:'ゆっくり休んで次のセットに備えよう。'},circ=2*Math.PI*88;
function cycle(){return Math.max(2,Math.min(8,+$('cycleDuration').value||4))}
function updateAutoBackupStatus(){
 const latest=storage.getJSON('focus-auto-backup',null),previous=storage.getJSON('focus-auto-backup-previous',null);
 const label=value=>Number.isFinite(Number(value?.savedAt))?new Date(Number(value.savedAt)).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'未作成';
 const status=$('autoBackupStatus');if(status)status.textContent='最新：'+label(latest)+' · ひとつ前：'+label(previous)+'（この端末内）';
 const latestButton=$('restoreLatestAutoBackup'),previousButton=$('restorePreviousAutoBackup');
 if(latestButton)latestButton.disabled=!latest?.stats;
 if(previousButton)previousButton.disabled=!previous?.stats;
}
function syncStatsState(state){completed=state.completed;minutes=state.minutes;history=state.history;legacyHistory=state.legacyHistory;records=state.records;dailyGoal=state.dailyGoal;weeklyGoal=state.weeklyGoal;updateAutoBackupStatus()}
function updateStudySky(){
 // Use lifetime study minutes so the room's progress remains after a new day begins.
 const level=getStudySkyLevel(minutes);
 const view=$('studyRoomView');
 if(!view)return;
 view.classList.remove('sky-level-0','sky-level-1','sky-level-2','sky-level-3','sky-level-4');
 view.classList.add('sky-level-'+level);
 const labels=['今夜の星空','星屑が少し増えた','天の川が姿を見せた','流れ星が通り始めた','流星群の夜'];
 const label=$('skyProgressLabel');if(label)label.textContent=labels[level];
}
function updateChart(){updateStudySky();studyViews.renderWeekly({history})}
function setChillMode(enabled){
 const active=!!enabled,view=$('studyRoomView'),button=$('chillModeToggle'),note=$('chillModeNote');
 view.classList.toggle('chill-mode',active);
 button.setAttribute('aria-pressed',String(active));
 button.textContent=active?'☾ チル中':'☾ チル';
 button.setAttribute('aria-label',active?'チルモードを終了する':'チルモードを開始する');
 if(note)note.hidden=!active;
 // Never start audio automatically. If the user already enabled ambience, soften it smoothly.
 const master=Number($('soundVolume').value)/100;
 ambientSound.setVolume(master*(active?0.72:1),1.8);
}

function update(){
 $('clock').textContent=fmt(remaining);$('modeLabel').textContent=labels[mode];$('hint').textContent=hints[mode];
 $('status').textContent=running?'● FOCUSING':finished?'● COMPLETED':'● READY';
 const ratio=total?remaining/total:0;$('timerPanel').classList.toggle('timer-near-end',ratio<=.15);$('timerPanel').classList.toggle('timer-midpoint',ratio<=.5&&ratio>.15);
 $('start').textContent=running?'Ⅱ 一時停止':'▶ スタート';
 $('progress').style.strokeDasharray=circ;$('progress').style.strokeDashoffset=circ*(1-remaining/total);
 $('sessions').textContent=completed;$('minutes').textContent=minutes;studyViews.renderAchievements(minutes);$('round').textContent=(completed%cycle()+1)+'/'+cycle();
 $('setLabel').textContent=(completed%cycle())+' / '+cycle()+' セッション';
 [...$('dots').children].forEach((d,i)=>d.classList.toggle('done',i<completed%cycle()));
 document.title=fmt(remaining)+' | FOCUS';
 updateMiniTimer();
 document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
}
function updateMiniTimer(){
 const panel=$('miniTimer');
 if(!panel)return;
 const currentPage=document.querySelector('.page:not([hidden])')?.id||'timerPage';
 const visible=currentPage!=='timerPage'&&(running||remaining!==total);
 panel.hidden=!visible;
 if(!visible)return;
 $('miniTimerClock').textContent=fmt(remaining);
 $('miniTimerMode').textContent=labels[mode];
 $('miniTimerToggle').textContent=running?'Ⅱ 一時停止':'▶ 再開';
 $('miniTimerToggle').setAttribute('aria-label',running?'タイマーを一時停止':'タイマーを再開');
}

let batteryInfo=null;
function updateLandscapeBattery(){
 const target=$('landscapeBattery');
 if(!target)return;
 if(!batteryInfo){
  target.textContent='BATTERY · N/A';
  target.title='このブラウザでは充電情報を取得できません';
  target.dataset.charging='unknown';
  return;
 }
 const level=Math.max(0,Math.min(100,Math.round(batteryInfo.level*100)));
 target.textContent=(batteryInfo.charging?'⚡ ':'')+'BATTERY · '+level+'%';
 target.title=batteryInfo.charging?'充電中':'バッテリー残量';
 target.dataset.charging=String(batteryInfo.charging);
}
function updateLandscapeStatus(){
 const panel=$('landscapeSystemStatus');
 if(!panel)return;
 const landscape=window.matchMedia?window.matchMedia('(orientation: landscape)').matches:window.innerWidth>window.innerHeight;
 const visible=document.body.classList.contains('timer-large-mode')&&landscape;
 panel.hidden=!visible;
 if(visible){
  $('landscapeClock').textContent=new Intl.DateTimeFormat('ja-JP',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
 }
}
if(typeof navigator.getBattery==='function'){
 navigator.getBattery().then(battery=>{
  batteryInfo=battery;
  ['chargingchange','levelchange'].forEach(eventName=>battery.addEventListener(eventName,updateLandscapeBattery));
  updateLandscapeBattery();
 }).catch(updateLandscapeBattery);
}else updateLandscapeBattery();
const landscapeClockInterval=window.setInterval(updateLandscapeStatus,1000);
window.addEventListener('resize',updateLandscapeStatus);
window.addEventListener('orientationchange',updateLandscapeStatus);
let notificationsEnabled=false;
const notificationController=createNotificationController({
 root:document,
 storage,
 getNotificationApi:()=>window.Notification,
 getServiceWorkerContainer:()=>('serviceWorker' in navigator ? navigator.serviceWorker : null),
 onMessage:message=>{$('toast').textContent=message},
 onStateChange:enabled=>{notificationsEnabled=enabled}
});
function notify(title){notificationController.notify(title)}
const completionSoundController=createCompletionSoundController({target:document});
function playCompletionSound(){completionSoundController.play()}
$('start').onclick=()=>{if(running){timerController.pause();return}if(finished){$('toast').textContent='次のモードを選んでスタートしよう。';return}timerController.start()};
function setLargeMode(enabled){
 document.body.classList.toggle('timer-large-mode',enabled);
 $('largeToggle').setAttribute('aria-pressed',String(enabled));
 $('largeToggle').textContent=enabled?'⤢ 通常表示':'⛶ 大画面';
 updateLandscapeStatus();
 // Lock landscape where the browser supports it; iOS Safari may require manual rotation.
 const orientation=window.screen?.orientation;
 if(enabled&&orientation&&typeof orientation.lock==='function')orientation.lock('landscape').catch(()=>{});
 if(!enabled&&orientation&&typeof orientation.unlock==='function'){try{orientation.unlock()}catch(e){}}
}
$('largeToggle').onclick=()=>setLargeMode(!document.body.classList.contains('timer-large-mode'));
$('miniTimerToggle').onclick=()=>{if(running)timerController.pause();else if(!finished)timerController.start();else timerController.start()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('timer-large-mode'))setLargeMode(false)});
$('reset').onclick=()=>{if(running&&!confirm('進行中のタイマーをリセットする？'))return;timerController.reset();$('toast').textContent='タイマーをリセットしたよ。'};
$('skip').onclick=()=>{if(running&&!confirm('タイマーを停止して次の時間に切り替える？'))return;timerController.skip();$('toast').textContent='次の時間に切り替えたよ。'};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(running&&!confirm('タイマーを停止してモードを切り替える？'))return;timerController.setMode(b.dataset.mode)});
$('apply').onclick=()=>{if((running||remaining!==total)&&!confirm('タイマーの設定を変更すると、現在のセッションは最初からになるよ。変更してもいい？'))return;let vals={focus:+$('focusDuration').value,short:+$('shortDuration').value,long:+$('longDuration').value,cycle:+$('cycleDuration').value};if(vals.focus<1||vals.focus>120||vals.short<1||vals.short>60||vals.long<1||vals.long>90||vals.cycle<2||vals.cycle>8||Object.values(vals).some(v=>!Number.isInteger(v))){$('toast').textContent='設定値を範囲内の整数で入力してね。';return}if(!storage.setJSON('focus-timer-settings',vals)){$('toast').textContent='タイマー設定を保存できなかったよ。端末の空き容量やブラウザの状態を確認してね。';return}timerController.setDurations({focus:vals.focus,short:vals.short,long:vals.long});$('toast').textContent='タイマー設定を保存したよ。'};

document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{if(b.dataset.page==='settingsPage'){document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==b.dataset.page);document.querySelectorAll('.tab[data-page]').forEach(t=>t.removeAttribute('aria-current'));updateMiniTimer();return}setStudyRoomMode(b.dataset.page==='studyRoomPage');document.querySelectorAll('.page').forEach(p=>p.hidden=p.id!==b.dataset.page);document.querySelectorAll('.tab[data-page]').forEach(t=>{const active=t===b;t.classList.toggle('active',active);if(active)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current')});if(b.dataset.page==='overviewPage')renderAllRecords();if(b.dataset.page==='calendarPage')renderCalendar();if(b.dataset.page==='analyticsPage')renderAnalytics();if(b.dataset.page==='studyRoomPage'){studyRoom.onEnter();studyRoom.loadWeather()}updateMiniTimer()});
const hourglass = mountHourglass({ getRemainingSeconds });
const studyRoom = mountStudyRoom({ updateSky: updateStudySky, storage });
 $('chillModeToggle').addEventListener('click',()=>setChillMode(!$('studyRoomView').classList.contains('chill-mode')));
 $('chillAuto').checked=storage.getText('focus-chill-auto','true')!=='false';
 $('chillAuto').addEventListener('change',()=>{if(!storage.setText('focus-chill-auto',String($('chillAuto').checked))){$('chillAuto').checked=!$('chillAuto').checked;$('toast').textContent='チルモードの設定を保存できなかったよ。';return}$('toast').textContent=$('chillAuto').checked?'休憩開始時にチルモードへ切り替えるよ。':'自動切り替えをオフにしたよ。'});
$('roomClockFormat').value=storage.getText('focus-room-clock-format','24');
$('roomShowDate').checked=storage.getText('focus-room-show-date','true')!=='false';
$('roomClockFormat').addEventListener('change',()=>{if(!studyRoom.setClockFormat($('roomClockFormat').value))$('toast').textContent='時計の設定を保存できなかったよ。'});
$('roomShowDate').addEventListener('change',()=>{if(!studyRoom.setShowDate($('roomShowDate').checked))$('toast').textContent='日付の設定を保存できなかったよ。'});
function refreshAfterReturn(){if(running)timerController.tick();hourglass.tick();timerController.setVisible(true);hourglass.setVisible(true);studyRoom.onVisible()}
document.addEventListener('visibilitychange',()=>{document.body.classList.toggle('app-document-hidden',document.hidden);if(document.hidden){timerController.setVisible(false);hourglass.setVisible(false)}else refreshAfterReturn()});
// iOS Safari may restore a page from the back-forward cache without a full reload.
window.addEventListener('pageshow',event=>{if(event.persisted)refreshAfterReturn()});
function setStudyRoomMode(enabled){
 document.body.classList.toggle('study-room-fullscreen',enabled);
 if(enabled&&screen.orientation&&typeof screen.orientation.lock==='function'){screen.orientation.lock('landscape').catch(()=>{})}
 if(!enabled&&screen.orientation&&typeof screen.orientation.unlock==='function'){try{screen.orientation.unlock()}catch(e){}}
}
$('roomExit').addEventListener('click',()=>setStudyRoomMode(false));
const savedQuietText=storage.getText('focus-room-quiet-text')==='true';$('studyRoomView').classList.toggle('room-quiet-text',savedQuietText);$('roomTextToggle').setAttribute('aria-pressed',String(savedQuietText));$('roomTextToggle').addEventListener('click',()=>{const view=$('studyRoomView'),hidden=!view.classList.contains('room-quiet-text'),button=$('roomTextToggle');if(!storage.setText('focus-room-quiet-text',String(hidden))){$('toast').textContent='表示設定を保存できなかったよ。';return}view.classList.toggle('room-quiet-text',hidden);button.setAttribute('aria-pressed',String(hidden));button.setAttribute('aria-label',hidden?'文字情報を表示する':'文字情報を隠す');button.title=hidden?'文字情報を表示する':'文字情報を隠す'});


const appearanceController=createAppearanceController({root:document,storage,onMessage:message=>{$('toast').textContent=message}});
appearanceController.initialize();
try{const ts=normalizeTimerSettings(storage.getJSON('focus-timer-settings',null));if(ts){durations={focus:ts.focus,short:ts.short,long:ts.long};$('focusDuration').value=ts.focus;$('shortDuration').value=ts.short;$('longDuration').value=ts.long;$('cycleDuration').value=ts.cycle;storage.setJSON('focus-timer-settings',ts)}}catch(e){}
const autoContinueEnabled=storage.getText('focus-auto-continue','false')==='true';
$('autoContinue').checked=autoContinueEnabled;
function syncTimerState(state){durations=state.durations;mode=state.mode;remaining=state.remaining;total=state.total;running=state.running;deadline=state.deadline;finished=state.finished;update()}
timerController=createTimerController({durations,autoContinue:autoContinueEnabled,getCycleLength:cycle,getCompletedSessions:()=>completed,store:storage,onChange:syncTimerState,onFocusComplete({actualSeconds=durations.focus*60}={}){const actualMinutes=Math.floor(Math.max(0,Number(actualSeconds)||0)/60);const record=actualMinutes>=1?{id:String(Date.now())+'-'+Math.random().toString(36).slice(2,7),timestamp:Date.now(),date:dateKey(new Date()),minutes:Math.min(120,actualMinutes),note:'',intention:$('sessionIntention').value.trim()}:null;const saved=record?statsStore.addSession(record):true;if(saved&&record)updateChart();if($('chillAuto').checked)setChillMode(true);notify('集中セッション完了！休憩を始めよう。');if(!saved)$('toast').textContent='集中記録を保存できなかったよ。端末の空き容量を確認してね。';playCompletionSound();if(appReady){$('reflection').value='';$('sessionIntention').value='';$('reflectionPrompt').textContent='今のセッションで気づいたことを残してみよう。';renderAllRecords();$('reflectionPanel').open=true;$('reflectionPanel').scrollIntoView({behavior:'smooth',block:'nearest'})}},onBreakComplete(){setChillMode(false);notify('休憩終了！お疲れさま。');playCompletionSound()}});
({durations,mode,remaining,total,running,deadline,finished}=timerController.getState());
$('autoContinue').addEventListener('change',()=>{
 const enabled=$('autoContinue').checked;
 if(!storage.setText('focus-auto-continue',String(enabled))){
  $('autoContinue').checked=!enabled;
  $('toast').textContent='自動連続設定を保存できなかったよ。';
  return;
 }
 timerController.setAutoContinue(enabled);
 $('toast').textContent=enabled?'休憩終了後に次の集中を自動開始するよ。':'休憩終了後は待機する設定にしたよ。';
});


statsStore=createStudyStatsStore({storage,onChange:syncStatsState});
const recoveryController=createRecoveryController({
 root:$('recoveryList'),storage,statsStore,
 onMessage:message=>{$('toast').textContent=message},
 onRestored:()=>{$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords()},
 confirmAction:message=>confirm(message),
 documentRef:document,URLApi:URL,BlobCtor:Blob
});
const statsLoad=statsStore.load();if(statsLoad.message)$('toast').textContent=statsLoad.message;statsStore.createAutoBackup({onlyIfMissing:true});updateAutoBackupStatus();
function restoreAutoBackup(key){
 const backup=storage.getJSON(key,null);if(!backup?.stats){$('toast').textContent='復元できる自動バックアップが見つからないよ。';return}
 if(!confirm('自動バックアップから学習記録を復元する？現在の記録は復旧用に保護されるよ。'))return;
 const result=statsStore.replaceStats(backup.stats,{backupKey:'focus-pre-auto-restore',backupPayload:statsStore.exportStats()});
 if(!result.ok){$('toast').textContent='自動バックアップを復元できなかったよ。';return}
 $('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords();$('toast').textContent='自動バックアップから復元したよ。';
}
$('restoreLatestAutoBackup').onclick=()=>restoreAutoBackup('focus-auto-backup');
$('restorePreviousAutoBackup').onclick=()=>restoreAutoBackup('focus-auto-backup-previous');
timerController.restore();

$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;
$('saveGoals').onclick=()=>{const d=Number($('dailyGoal').value),w=Number($('weeklyGoal').value);if(!Number.isInteger(d)||!Number.isInteger(w)||d<0||w<0||d>1440||w>10080){$('toast').textContent='目標は範囲内の整数で入力してね。';return}if(!statsStore.setGoals(d,w)){$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;$('toast').textContent='目標を保存できなかったよ。端末の空き容量を確認してね。';return}renderGoals();$('toast').textContent='目標を保存したよ。'};
function renderGoals(){studyViews.renderGoals({history,dailyGoal,weeklyGoal})}
function renderCalendar(){
 $('calendarYear').value=calendarCursor.getFullYear();$('calendarMonth').value=String(calendarCursor.getMonth()+1);
 studyViews.renderCalendar({history,cursor:calendarCursor,selectedDate:selectedCalendarDate});
 if(selectedCalendarDate)renderCalendarDayDetails();
}
function renderCalendarDayDetails(){
 studyViews.renderDayDetails({date:selectedCalendarDate,records,legacyMinutes:legacyHistory[selectedCalendarDate]||0});
}
function moveCalendarTo(year,month){
 if(!Number.isInteger(year)||year<1970||year>2100||!Number.isInteger(month)||month< -1||month>12){$('toast').textContent='年は1970〜2100年、月は1〜12月で指定してね。';return}
 const target=new Date(year,month,1);
 if(target.getFullYear()<1970||target.getFullYear()>2100){$('toast').textContent='表示できるのは1970〜2100年だよ。';return}
 calendarCursor=target;selectedCalendarDate=dateKey(calendarCursor);renderCalendar();
}
$('monthPrev').onclick=()=>moveCalendarTo(calendarCursor.getFullYear(),calendarCursor.getMonth()-1);
$('monthNext').onclick=()=>moveCalendarTo(calendarCursor.getFullYear(),calendarCursor.getMonth()+1);
$('calendarGo').onclick=()=>moveCalendarTo(Number($('calendarYear').value),Number($('calendarMonth').value)-1);
$('calendarYear').addEventListener('keydown',e=>{if(e.key==='Enter')$('calendarGo').click()});
$('calendarToday').onclick=()=>{const now=new Date();moveCalendarTo(now.getFullYear(),now.getMonth());selectedCalendarDate=dateKey(now);renderCalendar()};
$('calendarGrid').addEventListener('click',e=>{
 const day=e.target.closest('[data-calendar-date]');if(!day)return;
 selectedCalendarDate=day.dataset.calendarDate;renderCalendar();
 $('calendarDayDisclosure').open=true;
 $('calendarDayPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
});
$('calendarDayDetails').addEventListener('click',e=>{
 const save=e.target.closest('[data-day-save]');
 const del=e.target.closest('[data-day-delete]');
 const legacySave=e.target.closest('[data-legacy-save]');
 const add=e.target.closest('[data-day-add]');
 if(save){
  const card=save.closest('[data-day-record]');if(!card)return;
  const id=card.dataset.dayRecord,time=card.querySelector('[data-day-time]').value;
  const minutesValue=Number(card.querySelector('[data-day-minutes]').value);
  const note=card.querySelector('[data-day-note]').value;
  if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time)||!Number.isInteger(minutesValue)||minutesValue<1||minutesValue>120){$('toast').textContent='時刻と集中時間を正しく入力してね。';return}
  const [hour,minute]=time.split(':').map(Number),date=new Date(selectedCalendarDate+'T12:00:00');
  date.setHours(hour,minute,0,0);
  if(!statsStore.updateRecord(id,{timestamp:date.getTime(),date:selectedCalendarDate,minutes:minutesValue,note})){ $('toast').textContent='記録を更新できなかったよ。';return}
  $('toast').textContent='学習記録を更新したよ。';renderAllRecords();return;
 }
 if(del){
  const id=del.dataset.dayDelete;
  if(!confirm('この学習記録を削除する？'))return;
  if(!statsStore.deleteRecord(id)){$('toast').textContent='記録を削除できなかったよ。';return}
  $('toast').textContent='学習記録を削除したよ。';renderAllRecords();return;
 }
 if(legacySave){
  const value=Number($('calendarDayDetails').querySelector('[data-legacy-minutes]').value);
  if(!Number.isInteger(value)||value<0||value>1440){$('toast').textContent='0〜1440分の整数で入力してね。';return}
  if(!statsStore.setLegacyDayMinutes(selectedCalendarDate,value)){$('toast').textContent='過去の記録を更新できなかったよ。';return}
  $('toast').textContent='過去の学習時間を更新したよ。';renderAllRecords();return;
 }
 if(add){
  const time=$('calendarDayDetails').querySelector('[data-new-day-time]').value,minutesValue=Number($('calendarDayDetails').querySelector('[data-new-day-minutes]').value),note=$('calendarDayDetails').querySelector('[data-new-day-note]').value;
  if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time)||!Number.isInteger(minutesValue)||minutesValue<1||minutesValue>120){$('toast').textContent='時刻と集中時間を正しく入力してね。';return}
  const [hour,minute]=time.split(':').map(Number),date=new Date(selectedCalendarDate+'T12:00:00');date.setHours(hour,minute,0,0);
  const record={id:String(Date.now())+'-'+Math.random().toString(36).slice(2,7),timestamp:date.getTime(),date:selectedCalendarDate,minutes:minutesValue,note,intention:''};
  if(!statsStore.addSession(record)){$('toast').textContent='学習記録を追加できなかったよ。';return}
  $('toast').textContent='学習記録を追加したよ。';renderAllRecords();
 }
});
function renderHistory(){studyViews.renderHistory({records,query:$('historySearch')?.value||'',reflectionOnly:$('reflectionOnly')?.checked||false,period:$('historyPeriod')?.value||'all'})}
$('historyList').onclick=e=>{const del=e.target.closest('[data-record-delete]'),edit=e.target.closest('[data-record-edit]');if(del){const id=del.dataset.recordDelete,r=records.find(x=>x.id===id);if(!r||!confirm('この学習記録を削除する？'))return;if(!statsStore.deleteRecord(id)){$('toast').textContent='学習記録を削除できなかったよ。';return}renderAllRecords()}else if(edit){const r=records.find(x=>x.id===edit.dataset.recordEdit);if(!r)return;const n=Number(prompt('このセッションの集中時間（分）',String(r.minutes)));if(!Number.isInteger(n)||n<1||n>120)return;if(!statsStore.updateRecord(r.id,{minutes:n})){$('toast').textContent='学習記録を更新できなかったよ。';return}renderAllRecords()}};
let analyticsRange='day';
function renderAnalytics(){studyViews.renderAnalytics({history,range:analyticsRange})}
document.querySelectorAll('[data-analytics-range]').forEach(b=>b.addEventListener('click',()=>{analyticsRange=b.dataset.analyticsRange;document.querySelectorAll('[data-analytics-range]').forEach(t=>{const active=t===b;t.classList.toggle('selected',active);t.setAttribute('aria-pressed',String(active))});renderAnalytics()}));
$('historySearch').addEventListener('input',renderHistory);$('reflectionOnly').addEventListener('change',renderHistory);$('historyPeriod').addEventListener('change',renderHistory);
function renderAllRecords(){update();updateChart();renderGoals();renderCalendar();renderHistory();renderAnalytics()}
function saveReflection(){const r=[...records].sort((a,b)=>b.timestamp-a.timestamp)[0];if(!r){$('toast').textContent='先に集中セッションを完了してね。';return}if(!statsStore.updateRecord(r.id,{note:$('reflection').value.trim()})){$('toast').textContent='振り返りを保存できなかったよ。';return}renderHistory();$('toast').textContent='振り返りを保存したよ。'}
$('saveReflection').onclick=saveReflection;

$('clear').onclick=()=>{if(!confirm('今日の詳細な学習記録を消去する？累計の集中時間と達成状況は残るよ。'))return;if(!statsStore.clearDayRecords(dateKey(new Date()))) {$('toast').textContent='今日の記録を消去できなかったよ。';return}timerController.reset();$('toast').textContent='今日の詳細な記録を消去したよ。累計時間は保持されているよ。';renderAllRecords();};


const soundLevelDefaults={rain:38,wind:24,noise:12};
const soundLevels={...soundLevelDefaults,...(storage.getJSON('focus-sound-levels',{})||{})};
for(const kind of Object.keys(soundLevelDefaults)){const value=Number(soundLevels[kind]);soundLevels[kind]=Number.isFinite(value)?Math.max(0,Math.min(100,Math.round(value))):soundLevelDefaults[kind];$('soundVolume-'+kind).value=soundLevels[kind]}
const ambientSound = createAmbientSoundController({
 root: document,
 getAudioContextConstructor: () => window.AudioContext || window.webkitAudioContext,
 getVolume: () => Number($('soundVolume').value) / 100,
 getLayerVolume: kind => Number(soundLevels[kind]) / 100,
 getExistingAudioContext: () => audioContext,
 onContextCreated: context => { audioContext = context; },
 onUnsupported: () => { $('toast').textContent='このブラウザでは環境音を再生できないようだよ。'; }
});
document.querySelectorAll('[data-sound]').forEach(b=>b.onclick=()=>ambientSound.toggle(b.dataset.sound));
document.querySelectorAll('[data-sound-preset]').forEach(b=>b.onclick=()=>ambientSound.setPreset(b.dataset.soundPreset));
$('soundVolume').oninput=()=>ambientSound.setVolume(Number($('soundVolume').value)/100*($('studyRoomView').classList.contains('chill-mode')?0.72:1),1.8);
for(const kind of Object.keys(soundLevelDefaults)){$('soundVolume-'+kind).oninput=()=>{soundLevels[kind]=Number($('soundVolume-'+kind).value);ambientSound.setLayerVolume(kind,soundLevels[kind]/100);if(!storage.setJSON('focus-sound-levels',soundLevels))$('toast').textContent='音量設定を保存できなかったよ。'}}
function buildBackupPayload(){return {app:'FOCUS',version:CURRENT_BACKUP_VERSION,exportedAt:new Date().toISOString(),stats:statsStore.exportStats(),timerSettings:normalizeTimerSettings(storage.getJSON('focus-timer-settings',null)),appearance:storage.getJSON('focus-appearance',null),mark:storage.getText('focus-mark')||'dot',homeIcon:storage.getText('focus-home-icon')||'planet',notificationsEnabled,quietText:storage.getText('focus-room-quiet-text')==='true'}}
function downloadBackup(payload,filename){const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('exportData').onclick=()=>{downloadBackup(buildBackupPayload(),'focus-backup-'+dateKey(new Date())+'.json');$('toast').textContent='バックアップを書き出したよ。'};
const importController=createBackupImportController({
 input:$('importData'),storage,statsStore,validate:validateBackupPayload,
 buildCurrentBackup:()=>buildBackupPayload(),
 captureSettings:()=>Object.fromEntries(['focus-timer-settings','focus-appearance','focus-mark','focus-home-icon','focus-notifications','focus-room-quiet-text'].map(key=>[key,storage.getText(key,null)])),
 confirmAction:message=>confirm(message),
 applySettings:obj=>{
  const writes=[];
  if(obj.timerSettings)writes.push(storage.setJSON('focus-timer-settings',obj.timerSettings));
  if(obj.appearance&&obj.appearance.theme)writes.push(storage.setJSON('focus-appearance',{theme:obj.appearance.theme}));
  if(obj.mark)writes.push(storage.setText('focus-mark',obj.mark));
   if(obj.homeIcon)writes.push(storage.setText('focus-home-icon',obj.homeIcon));
  if(typeof obj.notificationsEnabled==='boolean')writes.push(storage.setText('focus-notifications',String(obj.notificationsEnabled)));
  if(typeof obj.quietText==='boolean')writes.push(storage.setText('focus-room-quiet-text',String(obj.quietText)));
  if(writes.some(ok=>!ok))return false;
  if(obj.appearance&&obj.appearance.theme)appearanceController.setTheme(obj.appearance.theme,{persist:false});
  if(obj.mark)appearanceController.setMark(obj.mark,{persist:false});
   if(obj.homeIcon)appearanceController.setHomeIcon(obj.homeIcon,{persist:false});
  if(typeof obj.notificationsEnabled==='boolean')notificationController.setEnabled(obj.notificationsEnabled,{persist:false});
  if(typeof obj.quietText==='boolean'){$('studyRoomView').classList.toggle('room-quiet-text',obj.quietText);$('roomTextToggle').setAttribute('aria-pressed',String(obj.quietText))}
  return true;
 },
 rollbackSettings:previous=>{
  let ok=true;
  for(const [key,value] of Object.entries(previous)){
   const saved=value===null?storage.removeText(key):storage.setText(key,value);
   if(!saved)ok=false;
  }
  let appearance=null;
  try{appearance=previous['focus-appearance']===null?null:JSON.parse(previous['focus-appearance'])}catch{}
  appearanceController.setTheme(appearance?.theme||'green',{persist:false});
  appearanceController.setMark(previous['focus-mark']||'dot',{persist:false});
  appearanceController.setHomeIcon(previous['focus-home-icon']||'planet',{persist:false});
  notificationController.setEnabled(previous['focus-notifications']==='true',{persist:false});
  const quiet=previous['focus-room-quiet-text']==='true';
  $('studyRoomView').classList.toggle('room-quiet-text',quiet);
  $('roomTextToggle').setAttribute('aria-pressed',String(quiet));
  return ok;
 },
 onRefresh:()=>{$('dailyGoal').value=dailyGoal;$('weeklyGoal').value=weeklyGoal;renderAllRecords();recoveryController.render()},
 onMessage:message=>{$('toast').textContent=message}
});

if('serviceWorker'in navigator){let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing){refreshing=true;window.location.reload();}});window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>{}));}
$('calendarPage').appendChild($('calendarPanel'));$('analyticsPage').appendChild($('analyticsPanel'));
update();updateChart();appReady=true;recoveryController.render();
let appDisposed=false;
window.addEventListener('pagehide',event=>{
 timerController.persistCurrent();
 // Keep controllers alive when Safari stores this document in the BFCache.
 if(event.persisted||appDisposed)return;
 appDisposed=true;
 window.clearInterval(landscapeClockInterval);
 window.removeEventListener('resize',updateLandscapeStatus);
 window.removeEventListener('orientationchange',updateLandscapeStatus);
 if(batteryInfo){['chargingchange','levelchange'].forEach(eventName=>batteryInfo.removeEventListener(eventName,updateLandscapeBattery));}
 timerController.destroy();
 hourglass.destroy();
 studyRoom.destroy();
 ambientSound.destroy();
 notificationController.destroy();
 appearanceController.destroy();
 recoveryController.destroy();
 importController.destroy();
});

