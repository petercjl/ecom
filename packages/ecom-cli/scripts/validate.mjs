import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {inventory,nativeRegistryHash} from '../lib/sycm.mjs';
import {root,pkg,tree} from '../lib/common.mjs';
const caps=JSON.parse(fs.readFileSync(path.join(root,'capabilities.json'),'utf8'));
const skill=JSON.parse(fs.readFileSync(path.join(root,'skills/ecom-cli/package.json'),'utf8'));
assert.equal(caps.version,pkg.version);assert.equal(skill.version,pkg.version);
assert.equal(skill.name,pkg.name);assert.ok(fs.statSync(path.join(root,'skills/ecom-cli/SKILL.md')).size>100);
tree(path.join(root,'skills')); // Reject shared links before packing.
console.error('Version, Skill identity and physical resource checks passed: '+pkg.version);

const vendor=path.join(root,'lib/sycm-vendor');
const provenance=JSON.parse(fs.readFileSync(path.join(vendor,'provenance.json'),'utf8'));
for(const [name,hash]of Object.entries(provenance.files)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(vendor,name))).digest('hex'),hash,'Pinned source changed without updating provenance');
}
assert.equal(inventory().operations.length,caps.businessIntegration.registeredReads);
assert.equal(nativeRegistryHash(),caps.businessIntegration.nativeRegistryHash);
assert.ok(inventory().operations.every(x=>x.sideEffect==='none'&&['GET','POST'].includes(x.method)));
console.error('Pinned business catalog and native identity checks passed: '+nativeRegistryHash());
