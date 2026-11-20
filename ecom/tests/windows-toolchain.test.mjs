import test from 'node:test';
import assert from 'node:assert/strict';
import {windowsBuildEnvironment} from '../build-windows.mjs';

const installations=[{installationVersion:'18.11.0',installationPath:'C:\\VS\\2026'},
  {installationVersion:'17.10.0',installationPath:'D:\\VS\\2022'}];
const options={exists:()=>true,run:()=>({status:0,stdout:JSON.stringify(installations)})};
test('Windows build discovers a supported non-default C++ toolchain without mutating caller environment',()=>{
  const input={CL:'/O2'},env=windowsBuildEnvironment(input,options);
  assert.equal(env.vs2026_install,installations[0].installationPath);
  assert.equal(env.GYP_MSVS_OVERRIDE_PATH,installations[0].installationPath);
  assert.equal(env.DEPOT_TOOLS_WIN_TOOLCHAIN,'0');
  assert.equal(env.CL,'/O2 /utf-8');
  assert.deepEqual(input,{CL:'/O2'});
});
test('Windows build preserves explicit toolchain selection',()=>{
  const env=windowsBuildEnvironment({vs2022_install:'custom'}, {run:()=>assert.fail('discovery must not replace explicit selection')});
  assert.equal(env.vs2022_install,'custom');
  assert.equal(env.vs2026_install,undefined);
  const selected=windowsBuildEnvironment({GYP_MSVS_OVERRIDE_PATH:'d:/VS/2022'},options);
  assert.equal(selected.vs2022_install,installations[1].installationPath);
  assert.equal(selected.GYP_MSVS_OVERRIDE_PATH,'d:/VS/2022');
});
test('Windows build reports missing or conflicting toolchains instead of switching the target',()=>{
  assert.throws(()=>windowsBuildEnvironment({}, {exists:()=>false}),/Install Visual Studio/);
  assert.throws(()=>windowsBuildEnvironment({GYP_MSVS_OVERRIDE_PATH:'X:/custom'}, options),/matches the selected/);
});
