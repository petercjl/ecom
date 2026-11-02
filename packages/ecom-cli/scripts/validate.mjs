import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,pkg,tree} from '../lib/common.mjs';
const caps=JSON.parse(fs.readFileSync(path.join(root,'capabilities.json'),'utf8'));
const skill=JSON.parse(fs.readFileSync(path.join(root,'skills/ecom-cli/package.json'),'utf8'));
assert.equal(caps.version,pkg.version);assert.equal(skill.version,pkg.version);
assert.equal(skill.name,pkg.name);assert.ok(fs.statSync(path.join(root,'skills/ecom-cli/SKILL.md')).size>100);
tree(path.join(root,'skills')); // Reject shared links before packing.
console.error('Version, Skill identity and physical resource checks passed: '+pkg.version);
