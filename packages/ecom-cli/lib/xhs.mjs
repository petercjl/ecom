import crypto from 'node:crypto';
import {fail} from './common.mjs';
import {discover,inspectInConnection,callMailbox} from './browser.mjs';

export function validateSearchResult(body, keyword) {
  if(body?.success!==true||body.transport!=='background-page-dom'||body.keyword!==keyword||body.data?.keyword!==keyword||body.data?.state!=='ready'||!Array.isArray(body.data.items)||!body.data.items.length||body.data.items.length>20)
    throw fail('XHS_SEARCH_REJECTED','Xiaohongshu did not return the requested search list',{executed:true});
  const seen=new Set();
  const items=body.data.items.map(item=>{
    if(!item||typeof item.id!=='string'||!/^[a-f0-9]{24}$/.test(item.id)||seen.has(item.id)||typeof item.title!=='string'||item.title.length>500||typeof item.author!=='string'||item.author.length>100||typeof item.likes!=='string'||item.likes.length>30||item.url!=='https://www.xiaohongshu.com/explore/'+item.id)
      throw fail('PROTOCOL_MISMATCH','Invalid Xiaohongshu note projection',{executed:true});
    seen.add(item.id);
    return {id:item.id,title:item.title,author:item.author,likes:item.likes,url:item.url};
  });
  return {transport:body.transport,pageClosed:body.pageClosed===true,keyword,count:items.length,items};
}
export async function searchXhs(options, dependencies={}) {
  const keyword=options.keyword?.trim();
  if(!options.container||!keyword||Buffer.byteLength(keyword)>180||options.via!=='page')
    throw fail('INVALID_ARGUMENT','Specify --container, --keyword and --via page');
  const connect=dependencies.discover??discover;
  const inspect=dependencies.inspect??inspectInConnection;
  const call=dependencies.call??callMailbox;
  const connection=connect(options);
  if(connection.endpoint.xhsPageSearchProtocol!==1)
    throw fail('BROWSER_UPGRADE_REQUIRED','This search requires a compatible Ecom Dev with xhsPageSearchProtocol 1');
  const {container}=await inspect(connection,options.container);
  if(container.platform!=='xiaohongshu')throw fail('XHS_CONTAINER_REQUIRED','Select a Xiaohongshu account container');
  const searchId=((BigInt(Date.now())<<64n)+BigInt(crypto.randomInt(2147483647))).toString(36).toUpperCase();
  const result=await call(connection,{method:'business.read',operation:'xhs.search-page',containerId:container.id,params:{keyword,search_id:searchId}},30000);
  if(result.containerId!==container.id||result.businessOperation!=='xhs.search-page')
    throw fail('PROTOCOL_MISMATCH','Search response does not match the pinned container',{executed:'unknown',operationId:result.operationId});
  return {ok:true,schemaVersion:1,operationId:result.operationId,
    instance:{id:connection.endpoint.instanceId,channel:connection.channel},
    container:{id:container.id,name:container.name},...validateSearchResult(result.data,keyword)};
}
