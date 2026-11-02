import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {root,pkg} from '../lib/common.mjs';
for(const name of ['capabilities.json','skills/ecom-cli/package.json']) {
  const file=path.join(root,name), info=fs.lstatSync(file);
  if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe version metadata');
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  const backup=path.join(os.tmpdir(),'ecom-version-backup-'+crypto.randomUUID());fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
  value.version=pkg.version;
  fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
}
