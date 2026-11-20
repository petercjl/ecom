// Offline contract acceptance using actual release manifests and updater source.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [bridgeInput,lumyneInput,outputInput]=process.argv.slice(2);
if(process.platform!=='darwin'||!bridgeInput||!lumyneInput||!outputInput)
  throw new Error('Usage: node ecom/test-macos-scope-migration.mjs BRIDGE_ARTIFACTS LUMYNE_ARTIFACTS NEW_OUTPUT');
const bridge=fs.realpathSync(bridgeInput),lumyne=fs.realpathSync(lumyneInput),output=path.resolve(outputInput);
if(fs.existsSync(output))throw new Error('Existing acceptance output preserved');
const run=(file,args,options={})=>{const r=spawnSync(file,args,{encoding:'utf8',...options});if(r.error||r.status!==0)throw r.error||new Error(r.stderr||r.stdout||'Scope acceptance failed');return r.stdout.trim();};
const read=dir=>JSON.parse(fs.readFileSync(path.join(dir,'npm/artifact.json')));
const old=JSON.parse(fs.readFileSync(path.join(root,'ecom/releases/macos-arm64/0.1.6.json')));
const manifests=[read(bridge),read(lumyne)];
for(const [index,dir] of [bridge,lumyne].entries()){
  const manifest=manifests[index];
  if(manifest.packageName!=='@'+(index?'lumyne':'petercjl')+'/ecom-macos-arm64'||!/^[a-f0-9]{40}$/.test(manifest.sourceRevision))throw new Error('Unexpected migration artifact');
  const info=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(dir,'dmg-root/Ecom.app/Contents/Info.plist')]));
  if(info.EcomUpdatePackage!==manifest.packageName||info.EcomReleaseVersion!==manifest.version||info.EcomSourceRevision!==manifest.sourceRevision||info.CFBundleIdentifier!=='app.ecom.browser')throw new Error('Packaged application identity differs');
}
fs.mkdirSync(output,{mode:0o700});
const xcode=process.env.DEVELOPER_DIR||fs.readdirSync('/Applications').filter(n=>/^Xcode.*\.app$/.test(n)).sort().reverse().map(n=>path.join('/Applications',n,'Contents/Developer')).find(p=>fs.existsSync(path.join(p,'usr/bin/xcodebuild')));
if(!xcode)throw new Error('Full Xcode is required');
for(const [index,revision] of [old.sourceRevision,manifests[1].sourceRevision].entries()){
  const source=run('git',['show',revision+':ecom/updater/EcomUpdater.swift'],{cwd:root});
  const entry='\n@main\nstruct Main {';
  if(source.split(entry).length!==2)throw new Error('Updater test entry boundary changed');
  const extra=index?'try require(knownInstalledPackage("@petercjl/ecom-macos-arm64") && knownInstalledPackage("@lumyne/ecom-macos-arm64") && !knownInstalledPackage("@other/ecom-macos-arm64"), "installed bridge identity")':'';
  const test=source.slice(0,source.indexOf(entry))+`
@main struct ScopeTest {
  static func main() throws {
    let accepted = try JSONDecoder().decode(Artifact.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
    let rejected = try JSONDecoder().decode(Artifact.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
    try accepted.validate(version: accepted.version)
    try require(accepted.packageName == CommandLine.arguments[3], "expected registry package")
    do { try rejected.validate(version: rejected.version); fatalError("accepted wrong download scope") } catch {}
    ${extra}
    print("scope contract passed")
  }
}
`;
  const file=path.join(output,'scope-'+index+'.swift'),binary=path.join(output,'scope-'+index);
  fs.writeFileSync(file,test,{flag:'wx'});
  run('xcrun',['swiftc','-swift-version','5','-O','-parse-as-library','-target','arm64-apple-macos13.0',file,'-o',binary],{env:{...process.env,DEVELOPER_DIR:xcode}});
  run(binary,[path.join(index?lumyne:bridge,'npm/artifact.json'),path.join(index?bridge:lumyne,'npm/artifact.json'),manifests[index].packageName]);
}
const report={ok:true,testKind:'offline-updater-contract',legacySource:old.sourceRevision,bridgeSource:manifests[0].sourceRevision,lumyneSource:manifests[1].sourceRevision,bridgeVersion:manifests[0].version,lumyneVersion:manifests[1].version,legacyAcceptsBridge:true,bridgeAcceptsLumyne:true,wrongScopeRejected:true,packagedIdentitiesVerified:true};
fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(report));
