import {discover,callMailbox} from './browser.mjs';
import {fail} from './common.mjs';

// Validate the native boundary before using estimates or stable target IDs.
export function validateSnapshot(body) {
  if(body.snapshotVersion!==1||typeof body.snapshotId!=='string'||
      !['macos-physical-footprint','windows-private-bytes'].includes(body.metric)||
      !Array.isArray(body.tabs)||!Array.isArray(body.containers)||!Array.isArray(body.processes)||
      !body.totals||!body.policy||!Number.isFinite(body.sampledAtUnixMs))
    throw fail('PROTOCOL_MISMATCH','Invalid memory snapshot');
  const pids=new Set(),tabs=new Set();
  const measurement=x=>x===null||(Number.isFinite(x)&&x>=0);
  for(const t of body.tabs){
    if(!Number.isInteger(t.tabId)||tabs.has(t.tabId)||typeof t.containerId!=='string'||typeof t.pageVersion!=='string'||
        !measurement(t.estimatedMemoryBytes)||!Array.isArray(t.discardReasons)||!Array.isArray(t.freezeReasons)||!Array.isArray(t.connectedFreezeReasons))
      throw fail('PROTOCOL_MISMATCH','Invalid or duplicate memory tab');
    tabs.add(t.tabId);
  }
  for(const p of body.processes){
    if(!Number.isInteger(p.pid)||p.pid<=0||pids.has(p.pid)||!measurement(p.memoryBytes)||!measurement(p.residentBytes)||
        !Array.isArray(p.tabIds)||new Set(p.tabIds).size!==p.tabIds.length||p.tabIds.some(id=>!tabs.has(id)))
      throw fail('PROTOCOL_MISMATCH','Invalid or duplicate memory process');
    pids.add(p.pid);
  }
  const total=body.processes.reduce((n,p)=>n+(p.memoryBytes??0),0);
  if(!['memoryBytes','residentBytes','attributedBytes','unattributedBytes'].every(k=>Number.isFinite(body.totals[k])&&body.totals[k]>=0)||Math.abs(total-body.totals.memoryBytes)>1||
      Math.abs(body.totals.attributedBytes+body.totals.unattributedBytes-total)>1)
    throw fail('PROTOCOL_MISMATCH','Memory totals do not reconcile');
  return body;
}
export async function readMemory(options={}) {
  const connection=discover(options);
  return readMemoryInConnection(connection);
}
export async function readMemoryInConnection(connection) {
  if(connection.endpoint.memorySnapshotProtocol!==1)
    throw fail('BROWSER_UPGRADE_REQUIRED','This Ecom build does not advertise memory snapshots');
  const body=validateSnapshot(await callMailbox(connection,{method:'memory.snapshot'},15000));
  return {...body,instance:{id:connection.endpoint.instanceId,pid:connection.endpoint.pid,channel:connection.channel}};
}
