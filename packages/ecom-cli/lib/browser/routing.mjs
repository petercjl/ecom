import {fail} from '../common.mjs';
import {discover,callMailbox} from './session.mjs';

const actions=['set-transform','set-container','enable','disable','list','inspect','save','delete','reorder','test','set-enabled'];
const patchActions=['set-container','enable','disable','set-transform'];
const transforms=['none','taobao-tmall-product'];
const mutation=[...patchActions,'save','delete','reorder','set-enabled'];
function json(text){try{if(typeof text!=='string'||Buffer.byteLength(text)>20000)throw Error();return JSON.parse(text)}catch{throw fail('INVALID_ARGUMENT','Specify bounded valid JSON');}}
export function routingPayload(action,options={}) {
  if(!actions.includes(action))throw fail('INVALID_ARGUMENT','Unknown routing command');
  const payload={method:'routing.'+(action==='inspect'?'list':action)};
  if(mutation.includes(action)){
    const revision=Number(options['expected-revision']);
    if(!/^(0|[1-9][0-9]*)$/.test(options['expected-revision']??'')||!Number.isSafeInteger(revision)||revision>2147483646)
      throw fail('INVALID_ARGUMENT','Specify --expected-revision from routing list');
    payload.expectedRevision=revision;
  }
  if(['inspect','delete',...patchActions].includes(action)){
    if(typeof options['rule-id']!=='string'||!options['rule-id']||options['rule-id'].length>128)
      throw fail('INVALID_ARGUMENT','Specify --rule-id');
    payload.ruleId=options['rule-id'];
  }
  if(action==='set-container'&&(typeof options.container!=='string'||!options.container.trim()||options.container.length>200))throw fail('INVALID_ARGUMENT','Specify an existing persistent --container ID or unique exact name');
  if(action==='set-transform'&&!transforms.includes(options.transform))throw fail('INVALID_ARGUMENT','Specify --transform none|taobao-tmall-product');
  if(action==='save'){
    const rule=json(options['rule-json']);
    if(!rule||Array.isArray(rule)||typeof rule!=='object'||typeof rule.name!=='string'||!rule.name.trim()||
      typeof rule.enabled!=='boolean'||typeof rule.containerId!=='string'||!Array.isArray(rule.conditions)||
      !rule.conditions.length||rule.conditions.length>50||(rule.enabled&&!rule.containerId)||
      ('urlTransform' in rule&&!transforms.includes(rule.urlTransform)))
      throw fail('INVALID_ARGUMENT','Provide a rule with name, enabled, containerId and 1..50 conditions; choose a container before enabling');
    payload.rule=rule;
  }
  if(action==='reorder'){
    const ids=json(options['rule-ids-json']);
    if(!Array.isArray(ids)||ids.length>100||ids.some(x=>typeof x!=='string'||!x||x.length>128)||new Set(ids).size!==ids.length)
      throw fail('INVALID_ARGUMENT','Specify every rule ID exactly once in --rule-ids-json');
    payload.ruleIds=ids;
  }
  if(action==='set-enabled'){
    if(!['on','off'].includes(options.enabled))throw fail('INVALID_ARGUMENT','Specify --enabled on|off');
    payload.enabled=options.enabled==='on';
  }
  if(action==='test'){
    let url;try{url=new URL(options.url)}catch{throw fail('INVALID_ARGUMENT','Specify --url HTTP(S) URL');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>8192)
      throw fail('INVALID_ARGUMENT','Routing tests accept HTTP(S) URLs without credentials');
    payload.url=url.href;
  }
  return payload;
}
export function validateRoutingState(body) {
  const config=body?.configuration;
  if(body?.protocolVersion!==1||!config||typeof config.enabled!=='boolean'||!Number.isInteger(config.revision)||config.revision<0||
    !Array.isArray(config.rules)||!Array.isArray(body.containers))throw fail('PROTOCOL_MISMATCH','Invalid URL routing state',{executed:'unknown'});
  const containerIds=new Set();
  for(const c of body.containers){
    if(typeof c?.id!=='string'||!c.id||containerIds.has(c.id)||typeof c.name!=='string')throw fail('PROTOCOL_MISMATCH','Invalid routing container choices',{executed:'unknown'});
    containerIds.add(c.id);
  }
  const ids=new Set();
  for(const rule of config.rules){
    if(typeof rule.id!=='string'||!rule.id||ids.has(rule.id)||typeof rule.name!=='string'||typeof rule.enabled!=='boolean'||
      typeof rule.containerId!=='string'||!Array.isArray(rule.conditions)||!['unassigned','available','missing'].includes(rule.targetState))
      throw fail('PROTOCOL_MISMATCH','Invalid URL routing rule',{executed:'unknown'});
    ids.add(rule.id);
  }
  return body;
}
export async function routingInConnection(connection,action,options={}) {
  const payload=routingPayload(action,options);
  if(connection.endpoint.urlRoutingProtocol!==1)throw fail('BROWSER_UPGRADE_REQUIRED','URL routing requires a compatible Ecom build');
  let effectivePayload=payload;
  const requiresTransform=action==='set-transform'||payload.rule?.urlTransform!==undefined;
  if(patchActions.includes(action)||requiresTransform){
    const current=validateRoutingState(await callMailbox(connection,{method:'routing.list'},15000));
    if(current.configuration.revision!==payload.expectedRevision)throw fail('ROUTING_REVISION_CONFLICT','Rules changed; reread routing list before editing',{executed:false});
    if(requiresTransform&&current.urlTransformProtocol!==1)throw fail('BROWSER_UPGRADE_REQUIRED','URL transformation requires a compatible Ecom build');
    if(patchActions.includes(action)){
      const rule=current.configuration.rules.find(r=>r.id===payload.ruleId);
      if(!rule)throw fail('ROUTING_RULE_NOT_FOUND','No rule matches the requested ID');
      const next={...rule};delete next.targetState;
      if(action==='set-container'){
        const exact=current.containers.find(c=>c.id===options.container);
        const matches=exact?[exact]:current.containers.filter(c=>c.name===options.container);
        if(!matches.length)throw fail('CONTAINER_NOT_FOUND','No persistent container matches the requested target');
        if(matches.length!==1)throw fail('CONTAINER_AMBIGUOUS','Use a stable container ID to select one target');
        next.containerId=matches[0].id;
      }else if(action==='set-transform')next.urlTransform=options.transform;
      else next.enabled=action==='enable';
      if(next.enabled&&!next.containerId)throw fail('TARGET_CONTAINER_REQUIRED','Select a container before enabling this rule');
      effectivePayload={method:'routing.save',expectedRevision:payload.expectedRevision,rule:next};
    }
  }
  const body=validateRoutingState(await callMailbox(connection,effectivePayload,15000));
  if(mutation.includes(action)&&(body.executed!==true||body.configuration.revision!==payload.expectedRevision+1))
    throw fail('PROTOCOL_MISMATCH','Routing revision does not match the requested change',{executed:'unknown',operationId:body.operationId});
  if(requiresTransform){
    const id=payload.ruleId||payload.rule?.id||body.ruleId;
    if(body.configuration.rules.find(x=>x.id===id)?.urlTransform!==effectivePayload.rule.urlTransform)
      throw fail('PROTOCOL_MISMATCH','Browser did not confirm the requested URL transformation',{executed:'unknown',operationId:body.operationId});
  }
  if(action==='test'&&(!Array.isArray(body.matches)||typeof body.resolution?.matched!=='boolean'||body.networkRequests!==0))
    throw fail('PROTOCOL_MISMATCH','Invalid local URL routing test',{executed:'unknown'});
  if(action==='inspect'){
    const rule=body.configuration.rules.find(x=>x.id===payload.ruleId);
    if(!rule)throw fail('ROUTING_RULE_NOT_FOUND','No rule matches the requested ID');
    body.rule=rule;
  }
  return {...body,instance:{id:connection.endpoint.instanceId,pid:connection.endpoint.pid,channel:connection.channel}};
}
export function routingCommand(action,options){routingPayload(action,options);return routingInConnection(discover(options),action,options);}
