import {fail} from '../common.mjs';
import {discover, readMailbox, resolveContainer, callMailbox, instanceOf} from '../browser/session.mjs';
import {loginLabels, secureField, isDocument, canClick, named, descend, uniqueButton} from './accessibility.mjs';

const backendTitle = /^(?:天猫商家中心|天猫(?:国际)?商家工作台|淘宝卖家中心|千牛卖家中心|千牛工作台|Taobao Seller Center|Tmall Merchant Center)(?:\s*[-·|—].*)?$/i;

export function qianniuDesktopState(documents, pageNodes, address, insecure) {
  const loginRegions = pageNodes.filter(node =>
    (isDocument(node) || node.role === 'form') && (named(node, loginLabels) ||
      node.role === 'form' && [...descend(node)].some(secureField)));
  const pressable = loginRegions.flatMap(region => [...descend(region)].filter(node =>
    canClick(node) && named(node, loginLabels)));
  if (loginRegions.length || address?.hostname === 'loginmyseller.taobao.com') {
    const button = uniqueButton(pressable, 'LOGIN_BUTTON_AMBIGUOUS', 'The login region has more than one enabled Login button.');
    return {status: 'login-pending', button: address?.protocol === 'https:' && !insecure ? button : null};
  }
  if (address?.hostname === 'myseller.taobao.com' && address.protocol === 'https:' && !insecure &&
      backendTitle.test(documents[0].name ?? '')) {
    return {status: 'backend-page', host: address.hostname};
  }
  return {status: 'unconfirmed'};
}

export async function qianniuLoginStep(action, options) {
  const connection=discover(options);
  const listed=await readMailbox(connection);
  const container=resolveContainer(listed.containers,options.container);
  const body=await callMailbox(connection,{method:'shops.'+action,containerId:container.id,
    ...(action==='open'?{service:'qianniu'}:{})});
  const statuses={
    open:['started'],
    'login-status':['page-unavailable','loading','login-page','backend-page','ambiguous'],
    'submit-login':['wrong-page','manual-verification-required','password-form-unavailable',
      'credentials-not-filled','already-submitted','clicked'],
  };
  const status=action==='open'?body.navigation:body.status;
  if(body.containerId!==container.id||!statuses[action].includes(status)||
      (action==='open'&&(body.service!=='qianniu'||body.requestedUrl!=='https://myseller.taobao.com/'))) {
    throw fail('PROTOCOL_MISMATCH','Unexpected Qianniu response',{operationId:body.operationId,executed:'unknown'});
  }
  return {ok:true,schemaVersion:1,operationId:body.operationId,instance:instanceOf(connection),
    container,service:'qianniu',status};
}
