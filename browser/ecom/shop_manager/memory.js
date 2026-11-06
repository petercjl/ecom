// Copyright 2026 Ecom Authors. MPL-2.0.
import './strings.m.js'
import {sendWithPromise} from 'chrome://resources/js/cr.js'
import {loadTimeData} from 'chrome://resources/js/load_time_data.js'

const zh = loadTimeData.getString('locale').startsWith('zh')
document.documentElement.lang = zh ? 'zh-CN' : 'en'
const t = (cn, en) => zh ? cn : en
const $ = id => document.getElementById(id)
const labels = {
  back: t('返回账号管理', 'Back to accounts'), title: t('内存与标签页', 'Memory and tabs'),
  intro: t('查看整个浏览器的内存、各账号的页面开销，以及标签保持运行的原因。', 'Inspect browser memory, account page costs and reasons tabs remain active.'),
  refresh: t('刷新快照', 'Refresh snapshot'), 'containers-title': t('容器与账号', 'Containers and accounts'),
  'tabs-title': t('标签页与休眠条件', 'Tabs and sleep eligibility'), 'processes-title': t('进程明细', 'Process details'),
  explanation: t('标签与容器内存是按关联进程分摊的估算，并非 JS 堆或可以立即释放的大小。共享内存只计一次；主进程、GPU 和未归因部分保留在公共开销中。', 'Tab and container memory is an estimated share of associated processes, not JS heap size or reclaimable bytes. Processes are counted once; browser, GPU and unattributed costs remain separate.'),
  'auto-title':t('自动休眠','Automatic sleep'), 'auto-enabled-label':t('启用后台标签自动休眠','Automatically sleep idle background tabs'),
  'auto-idle-label':t('闲置时间（分钟）','Idle time (minutes)'), 'auto-save':t('保存自动休眠设置','Save automatic sleep settings'),
  'auto-help':t('每 30 秒检查一次，每次最多休眠一页。正在取数、编辑表单、播放音视频、上传或共享设备的页面保持运行。恢复后重新计算闲置时间；可为持续工作页面开启“保持运行”。','Checks every 30 seconds and sleeps at most one tab per scan. Tasks, edited forms, media playback, uploads and shared devices stay active. The idle clock restarts after wake; use Keep running for ongoing work.'),
  limits: t('休眠释放页面运行状态，恢复时在原容器重新加载，持久会话保留。已接入的原生页面任务自动受保护；其他 Agent 取数或无法识别的业务状态，请先开启该页“保持运行”，结束后释放。该单页保护持续到关闭标签或浏览器重启。', 'Sleep releases page runtime state and reloads it in the original persistent container. Integrated native page tasks are automatically protected. Enable Keep running before other Agent page tasks or unknown business activity, then release it after completion. Per-tab protection lasts until tab close or browser restart.'),
}
for (const [key,value] of Object.entries(labels)) $(key).textContent = value
document.title = `Ecom · ${labels.title}`
const discardZh = ['不是标签页','已经卸载','已尝试卸载','尚无主框架','页面可见','正在播放声音','最近播放过声音','最近使用过','画中画','PDF 页面','不支持的页面类型','地址无效','保持活动设置或策略','通知权限已开启','扩展保护','正在采集视频','正在采集音频','正在投屏','正在共享窗口','正在共享屏幕','蓝牙连接','USB 连接','窗口选中的标签','固定标签','开发者工具已打开','后台标题或图标活动','表单交互','存在用户编辑','助手正在引用','独立网页应用']
const freezeZh = ['页面可见','最近使用过','正在播放声音','最近播放过声音','网站选择保持运行','持有 Web Lock','持有 IndexedDB 锁','持有阻塞 IndexedDB 锁','USB 连接','蓝牙连接','HID 设备连接','串口连接','正在采集视频','正在采集音频','正在投屏','正在共享窗口','正在共享屏幕','WebRTC 活动','正在加载','通知权限已开启','保持活动设置或策略','最近最常使用','浏览器内置页面']
const bytes = value => typeof value === 'number' ? `${(value / 1048576).toFixed(1)} MiB` : t('不可用', 'Unavailable')
const node = (tag, text) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n}
function head(id, cells) {const tr=node('tr');for(const c of cells)tr.append(node('th',c));$(id).replaceChildren(tr)}
head('containers-head', [t('容器','Container'),t('标签数','Tabs'),t('估算内存','Estimated memory'),t('有估算的标签','Measured tabs')])
head('tabs-head', [t('标签／来源','Tab / origin'),t('容器','Container'),t('估算内存','Estimated memory'),t('进程','Processes'),t('冻结条件','Freeze eligibility'),t('自动休眠／保持运行','Automatic sleep / keep running'),t('手动休眠／恢复','Manual sleep / wake')])
head('processes-head', ['PID',t('类型','Type'),t('内存','Memory'),t('驻留内存','Resident'),t('关联标签 ID','Associated tab IDs'),t('Worker／归属','Workers / attribution')])
function row(cells) {const tr=node('tr');for(const c of cells){const td=node('td');td.append(c instanceof Node ? c : node('span',c));tr.append(td)}return tr}
function reasons(tab, freeze) {
  const div=node('div');div.className='reasons'
  const state=tab[freeze?'canFreeze':'canDiscard']
  div.append(node('b',state==='yes'?t('内核条件允许','Engine permits'):state==='no'?t('保持运行','Keep active'):state==='varies'?t('视冻结类型而定','Depends on freezing type'):t('判定不可用','Unavailable')))
  const list=tab[freeze?'freezeReasons':'discardReasons']
  for(const reason of list)div.append(node('small',zh?(freeze?freezeZh:discardZh)[reason.code]??reason.message:reason.message))
  if(freeze)for(const reason of tab.connectedFreezeReasons)div.append(node('small',t('关联页面：','Connected page: ')+(zh?freezeZh[reason.code]??reason.message:reason.message)))
  return div
}
const mvpZh={UNAVAILABLE:'原生状态不可用',NOT_WEB_PAGE:'内置页面保持运行',LOADING:'页面正在加载',UPLOADING:'正在上传',TASK_IN_PROGRESS:'原生页面任务正在执行',NATIVE_PROTECTION:'内核保护',KEEP_AWAKE:'已开启保持运行',BACKGROUND_MEDIA:'后台播放或暂挂播放，返回页面暂停后可释放',VIDEO_PLAYING:'正在播放视频（含静音）',MEDIA_PLAYING:'正在播放音视频',BEFORE_UNLOAD:'页面设有离开确认，保护未保存内容'}
function manualReason(reason) {
  if(!zh)return reason.message
  if(reason.source==='mvp')return mvpZh[reason.code]??reason.message
  return (reason.source==='discard'?discardZh:freezeZh)[reason.code]??reason.message
}
const autoZh={DISABLED:'自动休眠已关闭',PAUSED:'自动休眠已暂停，请检查状态',IDLE_WINDOW:'等待闲置时间',NOT_RUNNING:'已卸载或原生状态不可用'}
function automaticCell(tab) {
  const div=node('div'), a=tab.automatic
  if(!a){div.append(node('small',t('需要更新浏览器','Browser upgrade required')));return div}
  div.append(node('b',a.eligible?t('等待下一轮休眠','Waiting for next scan'):t('保持运行或等待','Protected or waiting')))
  div.append(node('small',t('后台闲置：','Background idle: ')+Math.floor(a.idleSeconds)+t(' 秒',' sec')))
  for(const r of a.reasons??[])div.append(node('small',r.source==='auto'?(zh?autoZh[r.code]??r.code:r.code):manualReason(r)))
  const label=node('label'), toggle=node('input');toggle.type='checkbox';toggle.checked=a.keepAwake;toggle.disabled=actionPending
  toggle.addEventListener('change',()=>protect(tab,toggle.checked))
  label.append(toggle,node('span',t('保持运行','Keep running')));div.append(label)
  return div
}
async function protect(tab,keepAwake) {
  if(actionPending)return
  actionPending=true
  try {
    const result=await sendWithPromise('ecomMemoryCommand',JSON.stringify({method:'tabs.protect',tabId:tab.tabId,containerId:tab.containerId,expectedPageVersion:tab.pageVersion,keepAwake}))
    if(!result.ok)throw new Error(result.error?.code??'ACTION_FAILED')
    actionPending=false;await refresh()
  }catch(error){$('status').textContent=t('保护设置未完成：','Protection update incomplete: ')+error.message}
  finally{actionPending=false}
}
async function saveAutomatic() {
  if(actionPending)return
  const minutes=Number($('auto-idle').value)
  if(!Number.isInteger(minutes)||minutes<1||minutes>1440){$('auto-state').textContent=t('请输入 1–1440 分钟','Enter 1–1440 minutes');return}
  actionPending=true;$('auto-save').disabled=true
  try {
    const result=await sendWithPromise('ecomMemoryCommand',JSON.stringify({method:'memory.auto.set',enabled:$('auto-enabled').checked,idleSeconds:minutes*60}))
    if(!result.ok)throw new Error(result.error?.code??'ACTION_FAILED')
    actionPending=false;await refresh()
  }catch(error){$('auto-state').textContent=t('设置未完成：','Settings update incomplete: ')+error.message}
  finally{actionPending=false;$('auto-save').disabled=false}
}
let actionPending=false
function actionCell(tab) {
  const div=node('div'), wake=tab.state==='discarded'
  const button=node('button',wake?t('恢复','Wake'):t('休眠','Sleep'))
  button.disabled=actionPending||(!wake&&tab.manualDiscard?.eligible!==true)
  button.addEventListener('click',()=>act(tab,wake?'wake':'discard'))
  div.append(button)
  if(!wake)for(const r of tab.manualDiscard?.reasons??[])div.append(node('small',manualReason(r)))
  return div
}
async function act(tab,action) {
  if(actionPending)return
  if(action==='discard'&&!window.confirm(t(`休眠「${tab.title}」？页面将释放运行状态，再次打开时重新加载。`, `Put “${tab.title}” to sleep? Its runtime state will be released and reloaded when reopened.`)))return
  actionPending=true;$('refresh').disabled=true
  const operationId=crypto.randomUUID()
  try {
    const result=await sendWithPromise('ecomMemoryCommand',JSON.stringify({method:'tabs.'+action,operationId,tabId:tab.tabId,containerId:tab.containerId,expectedPageVersion:tab.pageVersion}))
    if(!result.ok)throw new Error(result.error?.code??'ACTION_FAILED')
    actionPending=false
    await refresh()
    $('status').textContent+=' · '+t('操作：','Action: ')+result.status+' · '+operationId
  }catch(error){$('status').className='error';$('status').textContent=t('操作未完成：','Action not completed: ')+error.message+' · '+operationId}
  finally{actionPending=false;$('refresh').disabled=false}
}
function render(s) {
  const totals=s.totals
  const a=s.automatic
  if(a){
    $('auto-enabled').checked=a.enabled;$('auto-idle').value=String(a.idleSeconds/60)
    $('auto-save').disabled=a.managed;$('auto-enabled').disabled=a.managed;$('auto-idle').disabled=a.managed
    $('auto-state').textContent=(a.enabled?t('已开启','Enabled'):t('已关闭','Disabled'))+' · '+t('本次运行自动休眠：','Automatically slept this run: ')+a.discardCount+' · '+t('检查次数：','Scans: ')+a.scanCount+(a.pausedReason?' · '+t('已暂停：','Paused: ')+a.pausedReason:'')+(a.managed?' · '+t('由策略管理','Managed by policy'):'')
  }
  $('summary').replaceChildren(...[
    [t('实例内存','Instance memory'),bytes(totals.memoryBytes)],
    [t('网页归因估算','Attributed page estimate'),bytes(totals.attributedBytes)],
    [t('公共与未归因','Shared / unattributed'),bytes(totals.unattributedBytes)],
    [t('标签／进程','Tabs / processes'),`${s.tabs.length} / ${s.processes.length}`],
  ].map(([label,value])=>{const card=node('div');card.className='card';card.append(node('span',label),node('b',value));return card}))
  $('policy').textContent=t('内存指标：','Metric: ')+s.metric+' · '+t('内存节省：','Memory Saver: ')+(s.policy.memorySaverActive?t('开启','On'):t('关闭','Off'))+' · '+t('冻结偏好：','Freezing preference: ')+(s.policy.freezingEnabledPreference?t('开启','On'):t('关闭','Off'))
  const names=new Map(s.containers.map(c=>[c.containerId,c.containerId?c.name:t('默认会话','Default session')]))
  $('containers').replaceChildren(...s.containers.map(c=>row([names.get(c.containerId),c.tabCount,bytes(c.estimatedMemoryBytes),`${c.measuredTabCount} / ${c.tabCount}`])))
  const processList=id=>s.processes.filter(p=>p.tabIds.includes(id)).map(p=>p.pid).join(', ')||'—'
  $('tabs').replaceChildren(...s.tabs.map(tab=>{
    const states={running:t('运行中','Running'),frozen:t('已冻结','Frozen'),discarded:t('已卸载','Discarded'),unloaded:t('未加载','Unloaded'),unavailable:t('不可用','Unavailable')}
    const title=node('div');title.append(node('b',tab.title||t('无标题','Untitled')),node('small',`#${tab.tabId} · ${tab.origin}`),node('small',t('窗口 ','Window ')+tab.windowId+(tab.selected?t(' · 已选中',' · selected'):'')+' · '+states[tab.state]))
    return row([title,names.get(tab.containerId)??tab.containerId,bytes(tab.estimatedMemoryBytes),processList(tab.tabId),reasons(tab,true),automaticCell(tab),actionCell(tab)])
  }))
  $('processes').replaceChildren(...s.processes.map(p=>row([p.pid,`${p.kind} ${p.name}`,bytes(p.memoryBytes),bytes(p.residentBytes),p.tabIds.join(', ')||'—',`${p.workerCount} · ${p.hasUnmappedClients?t('含未映射页面','includes unmapped pages'):t('已知关联','known associations')}`])))
  $('status').textContent=`${t('采样时间','Sampled')} ${new Date(s.sampledAtUnixMs).toLocaleString()} · ${t('采样耗时','Sampling')} ${s.measurementDurationMs.toFixed(1)} ms · ${totals.complete?t('进程采样完整','Process sampling complete'):t('部分进程指标不可用，总量为已测部分','Some processes unavailable; total is measured subset')}`
}
async function refresh() {
  $('refresh').disabled=true;$('status').className='';$('status').textContent=t('正在采集…','Sampling…')
  try {const s=await sendWithPromise('ecomMemorySnapshot');if(!s.ok)throw new Error(s.error?.code??'MEMORY_UNAVAILABLE');render(s)}
  catch(error){$('status').className='error';$('status').textContent=t('读取失败：','Read failed: ')+error.message}
  finally{$('refresh').disabled=false}
}
$('refresh').addEventListener('click',refresh)
$('auto-save').addEventListener('click',saveAutomatic)
refresh()
