// Copyright 2026 Ecom Authors. MPL-2.0.
// Form composition only; native code remains authoritative for URL matching.
export function mergePastedRoutingUrls(existing, text) {
  const urls=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!urls.length)return existing;
  const conditions=existing.filter(c=>!(c.type==='pattern'&&c.scheme==='https'&&
    !c.host&&c.path==='/*'&&!c.includeSubdomains&&!(c.query?.length)));
  if(conditions.length+urls.length>50)throw new Error('ROUTING_CONDITION_LIMIT');
  for(const text of urls){
    let url;try{url=new URL(text)}catch{throw new Error('INVALID_ROUTING_URL')}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||text.length>8192)
      throw new Error('INVALID_ROUTING_URL');
    conditions.push({type:'exact',url:text});
  }
  return conditions;
}
