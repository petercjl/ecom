// Copyright 2026 Ecom Authors. MPL-2.0.
import './strings.m.js'
import {sendWithPromise} from 'chrome://resources/js/cr.js'
import {loadTimeData} from 'chrome://resources/js/load_time_data.js'
import {mergePastedRoutingUrls} from './routing-model.js'
const zh=loadTimeData.getString('locale').startsWith('zh')
const t=(a,b)=>zh?a:b, $=id=>document.getElementById('routing-'+id)
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
const labels={title:t('网址打开规则','URL opening rules'),intro:t('将指定网址交给指定账号容器打开，保留原页面与各自登录状态。','Open matching URLs in a chosen container while preserving the source page and separate sessions.'),add:t('添加规则','Add rule'),'global-label':t('启用网址打开规则','Enable URL opening rules'),refresh:t('刷新','Refresh'),'test-title':t('测试网址','Test a URL'),'test-label':t('输入网址','URL'),'test-submit':t('检查匹配','Check match'),'test-help':t('只检查已保存规则，不访问网站。关闭的规则也会展示匹配结果。','Checks saved rules locally without visiting the website. Disabled matching rules are also shown.'),'name-label':t('规则名称','Rule name'),'target-label':t('使用容器','Target container'),'target-help':t('在「使用容器」中选择链接跳转的目标容器。','Choose where matching links open under Target container.'),'enabled-label':t('开启这条规则','Enable this rule'),'conditions-title':t('匹配条件','Match conditions'),'conditions-help':t('任意一条条件命中即可；同一条中的域名、路径和参数需同时满足。路径可用 * 匹配多个字符。','Any condition may match; within one condition, host, path and query predicates must all match. Paths support * wildcards.'),'condition-add':t('添加匹配条件','Add condition'),'bulk-label':t('批量粘贴具体网址','Paste a list of exact URLs'),'bulk-add':t('加入网址列表','Add URLs'),cancel:t('取消','Cancel'),save:t('保存','Save')}
for(const [id,text]of Object.entries(labels))$(id).textContent=text
$('advanced-label').textContent=t('高级选项','Advanced options')
$('transform-label').textContent=t('跨容器打开时的网址处理','URL handling across containers')
const transformOptions=[['none',t('保留原网址','Keep original URL')],['taobao-tmall-product',t('淘宝／天猫商品详情：只保留商品 ID','Taobao/Tmall product details: keep only item ID')]]
for(const [value,label]of transformOptions){const option=node('option',label);option.value=value;$('transform').append(option)}
const errors={ROUTING_TRANSFORM_CONFLICT:t('整理后的网址命中了另一个容器，请检查规则优先顺序。','The prepared URL matches a different container. Review rule order.'),INVALID_ROUTING_PRODUCT_ID:t('商品链接需要一个有效的商品 ID。','The link needs one valid product ID.'),ROUTING_CHANGED:t('规则刚刚发生变化，请重新打开网址。','Rules changed during navigation. Open the URL again.'),ROUTING_REQUEST_TOO_LARGE:t('规则内容过长，请减少网址或条件数量。','This rule is too large. Use fewer URLs or conditions.'),ROUTING_CONFIGURATION_TOO_LARGE:t('规则总量过大，请精简后再保存。','The rule collection is too large. Reduce it before saving.'),TARGET_CONTAINER_REQUIRED:t('请先选择目标容器，再手动开启规则。','Select a container before enabling this rule.'),TARGET_CONTAINER_MISSING:t('目标容器已不存在，请重新选择。','The target container is missing. Choose another container.'),ROUTING_REVISION_CONFLICT:t('规则已在其他位置更新，请刷新后重新编辑。','Rules changed elsewhere. Refresh before editing again.'),CROSS_CONTAINER_FORM_BLOCKED:t('表单提交已停止跨容器跳转，请在目标容器打开页面后重新操作。','Cross-container form submission was stopped. Open the page in the target container and retry.'),ROUTING_LOOP:t('规则出现循环，请检查规则顺序和目标容器。','A routing loop was stopped. Review rule order and target containers.')}
const errorText=code=>errors[code]||t('请检查规则名称、网址、域名、路径及参数是否有效。','Check the rule name, URL, host, path and query fields.')+` (${code})`
let state,editingId=''
async function call(method,payload={}){
  const r=await sendWithPromise('ecomRoutingCommand',JSON.stringify({method,...payload}))
  if(!r.ok){
    const code=r.error?.code||'UNAVAILABLE'
    throw Object.assign(new Error(errorText(code)),{code})
  }
  return r
}
async function mutate(method,payload){const r=await call(method,{expectedRevision:state.configuration.revision,...payload});state=r;render();return r}
const targetName=id=>state?.containers.find(c=>c.id===id)?.name||t('尚未选择容器','No container selected')
function button(text,action){const b=node('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await action()}catch(e){$('message').textContent=e.message}finally{b.disabled=false}};return b}
function render(){
  $('global').checked=state.configuration.enabled
  const list=$('rules');list.replaceChildren()
  for(const [index,rule]of state.configuration.rules.entries()){
    const card=node('article');card.className='card'
    const head=node('div');head.className='rule-head';head.append(node('h2',rule.name))
    const badge=node('span',rule.enabled?t('已开启','Enabled'):t('已关闭','Disabled'));badge.className='badge'+(rule.enabled?' on':'');head.append(badge);card.append(head)
    card.append(node('p',t('使用容器：','Container: ')+(rule.targetState==='missing'?t('容器已删除','Container missing'):targetName(rule.containerId))))
    if(rule.urlTransform==='taobao-tmall-product')card.append(node('p',transformOptions[1][1]))
    for(const c of rule.conditions){const p=node('div',c.type==='exact'?c.url:`${c.scheme==='http+https'?'http(s)':c.scheme}://${c.includeSubdomains?'*.':''}${c.host}${c.path}`+(c.query?.length?' · '+c.query.map(q=>q.operator==='exists'?q.name+t(' 存在',' exists'):`${q.name}=${q.value}`).join(' & '):''));p.className='pattern-text';card.append(p)}
    const actions=node('div');actions.className='actions'
    actions.append(button(t('编辑','Edit'),()=>edit(rule)),button(t('复制','Duplicate'),()=>edit({...rule,id:'',enabled:false,name:rule.name+t(' · 副本',' · copy')})))
    const toggle=button(rule.enabled?t('关闭','Disable'):t('开启','Enable'),()=>mutate('routing.save',{rule:{...rule,enabled:!rule.enabled}}));toggle.disabled=!rule.enabled&&rule.targetState!=='available';actions.append(toggle)
    const move=delta=>{const ids=state.configuration.rules.map(r=>r.id);[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];return mutate('routing.reorder',{ruleIds:ids})}
    const up=button(t('上移','Move up'),()=>move(-1)),down=button(t('下移','Move down'),()=>move(1));up.disabled=index===0;down.disabled=index===state.configuration.rules.length-1;actions.append(up,down)
    actions.append(button(t('删除','Delete'),async()=>{if(confirm(t('删除这条规则？容器和账号数据会保留。','Delete this rule? Containers and account data will be preserved.')))await mutate('routing.delete',{ruleId:rule.id})}))
    card.append(actions)
    if(toggle.disabled){
      const hint=node('p',t('请先点击「编辑」，在「使用容器」中选择并保存链接跳转的目标容器，再开启规则。','To enable this rule, click Edit, choose a target container for matching links, and save.'))
      hint.id='routing-target-hint-'+index
      toggle.setAttribute('aria-describedby',hint.id)
      card.append(hint)
    }
    list.append(card)
  }
  if(!state.configuration.rules.length)list.append(node('p',t('暂无规则。点击“添加规则”开始设置。','No rules yet. Add a rule to get started.')))
}
function input(value='',placeholder=''){const n=node('input');n.value=value;n.placeholder=placeholder;return n}
function select(items,value){const n=node('select');for(const [v,label]of items){const o=node('option',label);o.value=v;n.append(o)}n.value=value;return n}
function field(parent,label,control){const wrap=node('label',label);wrap.append(control);parent.append(wrap);return control}
function addCondition(c={type:'pattern',scheme:'https',host:'',path:'/*',includeSubdomains:false,query:[]}){
  const box=node('section');box.className='condition'
  const mode=field(box,t('匹配方式','Match type'),select([['pattern',t('域名和路径','Host and path')],['exact',t('精确网址','Exact URL')]],c.type))
  const exact=node('div'),pattern=node('div');box.append(exact,pattern)
  const url=field(exact,t('完整网址','Full URL'),input(c.url||'','https://example.com/page'))
  exact.append(button(t('改为匹配同类网址','Match similar URLs'),()=>{const u=new URL(url.value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error(errorText('INVALID_ROUTING_URL'));mode.value='pattern';scheme.value=u.protocol.slice(0,-1);host.value=u.hostname;path.value=u.pathname;queries.replaceChildren();for(const name of new Set(u.searchParams.keys()))addQuery({name,operator:'exists'});refreshMode()}))
  const cols=node('div');cols.className='columns';pattern.append(cols)
  const scheme=field(cols,t('协议','Scheme'),select([['http+https','HTTP / HTTPS'],['https','HTTPS'],['http','HTTP']],c.scheme||'https'))
  const host=field(cols,t('域名','Host'),input(c.host||'','item.taobao.com'))
  const path=field(pattern,t('路径','Path'),input(c.path||'/*','/item.htm'))
  const sub=node('input');sub.type='checkbox';sub.checked=!!c.includeSubdomains;field(pattern,t('同时匹配子域名','Include subdomains'),sub)
  const queries=node('div');pattern.append(queries)
  function addQuery(q={name:'',operator:'exists',value:''}){const row=node('div');row.className='query';const name=input(q.name,t('参数名','Parameter'));name.setAttribute('aria-label',t('查询参数名','Query parameter name'));const op=select([['exists',t('存在且非空','Present and nonempty')],['equals',t('等于','Equals')]],q.operator);op.setAttribute('aria-label',t('参数条件','Query comparison'));const val=input(q.value||'',t('参数值','Value'));val.setAttribute('aria-label',t('查询参数值','Query value'));val.disabled=op.value==='exists';op.onchange=()=>{val.disabled=op.value==='exists'};row.append(name,op,val,button(t('移除','Remove'),()=>row.remove()));row.read=()=>({name:name.value,operator:op.value,...(op.value==='equals'?{value:val.value}:{})});queries.append(row)}
  for(const q of c.query||[])addQuery(q)
  pattern.append(button(t('添加参数条件','Add query predicate'),()=>addQuery()))
  const refreshMode=()=>{exact.hidden=mode.value!=='exact';pattern.hidden=mode.value!=='pattern'};mode.onchange=refreshMode;refreshMode()
  box.append(button(t('移除此条件','Remove condition'),()=>box.remove()))
  box.read=()=>mode.value==='exact'?{type:'exact',url:url.value}:{type:'pattern',scheme:scheme.value,host:host.value,path:path.value,includeSubdomains:sub.checked,query:[...queries.children].map(q=>q.read())}
  $('conditions').append(box)
}
function edit(rule){
  editingId=rule?.id||''
  $('edit-title').textContent=rule?t('编辑规则','Edit rule'):t('添加规则','Add rule')
  $('edit-error').textContent=''
  $('advanced').open=false
  $('bulk-options').open=false
  $('bulk').value=''
  $('rule-name').value=rule?.name||''
  $('rule-enabled').checked=!!rule?.enabled
  $('transform').value=rule?.urlTransform||'none'
  const target=$('target')
  const empty=node('option',t('请选择容器','Choose a container'))
  empty.value=''
  target.replaceChildren(empty)
  for(const container of state.containers){
    const option=node('option',container.name)
    option.value=container.id
    target.append(option)
  }
  target.value=rule?.containerId||''
  $('target-help').hidden=!!target.value
  $('conditions').replaceChildren()
  for(const condition of rule?.conditions||[undefined]) addCondition(condition)
  $('editor').showModal()
}
$('add').onclick=()=>edit()
$('target').onchange=()=>$('target-help').hidden=!!$('target').value
$('condition-add').onclick=()=>addCondition()
$('bulk-add').onclick=()=>{try{const conditions=mergePastedRoutingUrls([...$('conditions').children].map(c=>c.read()),$('bulk').value);$('conditions').replaceChildren();for(const c of conditions)addCondition(c);$('bulk').value='';$('edit-error').textContent=''}catch(e){$('edit-error').textContent=e.message==='ROUTING_CONDITION_LIMIT'?t('每条规则最多50个条件。','Up to 50 conditions per rule.'):errorText(e.message)}}
$('cancel').onclick=()=>$('editor').close()
$('edit-form').onsubmit=async e=>{
  e.preventDefault()
  $('save').disabled=true
  try{
    const rule={id:editingId,name:$('rule-name').value,containerId:$('target').value,enabled:$('rule-enabled').checked,urlTransform:$('transform').value,conditions:[...$('conditions').children].map(c=>c.read())}
    await mutate('routing.save',{rule})
    $('editor').close()
    $('message').textContent=t('已保存。','Saved.')
  }catch(err){
    $('edit-error').textContent=err.message
    if(['INVALID_ROUTING_RULE','INVALID_ROUTING_TRANSFORM','INVALID_ROUTING_CONDITION','INVALID_ROUTING_URL','INVALID_ROUTING_PATTERN','INVALID_ROUTING_QUERY'].includes(err.code)){
      $('advanced').open=true
      $('edit-error').scrollIntoView({block:'nearest'})
    }
  }finally{
    $('save').disabled=false
  }
}
$('global').onchange=async()=>{try{await mutate('routing.set-enabled',{enabled:$('global').checked})}catch(e){$('message').textContent=e.message;$('global').checked=state.configuration.enabled}}
$('test-form').onsubmit=async event=>{
  event.preventDefault()
  const out=$('test-result')
  try{
    const {resolution,matches}=await call('routing.test',{url:$('test-url').value})
    out.replaceChildren()
    if(!resolution.matched){
      out.append(node('p',t('没有启用的匹配规则，将沿用原容器。','No enabled rule matches. The original container will be used.')))
    }else if(!resolution.available||resolution.destinationError){
      out.append(node('p',errorText(resolution.available?resolution.destinationError:'TARGET_CONTAINER_MISSING')))
    }else{
      out.append(node('p',t('最终使用容器：','Selected container: ')+targetName(resolution.containerId)))
      if(resolution.destinationUrl){
        const preview=node('p',t('跨容器将打开：','Cross-container destination: ')+resolution.destinationUrl)
        preview.className='pattern-text'
        out.append(preview)
      }
    }
    for(const match of matches)out.append(node('p',match.name+' · '+(match.enabled?t('已开启','Enabled'):t('已关闭','Disabled'))+' · '+targetName(match.containerId)))
  }catch(error){
    out.textContent=error.message
  }
}
export async function refreshRoutingView(){try{state=await call('routing.list');render()}catch(e){$('message').textContent=e.message}}
$('refresh').onclick=refreshRoutingView
const initialError=new URLSearchParams(location.search).get('error');if(initialError&&errors[initialError])$('message').textContent=errors[initialError]
