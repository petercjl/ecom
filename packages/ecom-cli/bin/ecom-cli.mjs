#!/usr/bin/env node
import {main} from '../lib/cli.mjs';
try {
  const result = await main(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ok:false,error:{code:error.code || 'CLI_ERROR',message:error.code ? error.message : 'Operation failed; inspect doctor and operation status',executed:error.executed ?? false,...(error.operationId ? {operationId:error.operationId} : {}),...(error.httpStatus!==undefined?{httpStatus:error.httpStatus}:{}),...(error.recovery ? {recovery:error.recovery} : {})}}) + '\n');
  process.exitCode = error.code === 'INVALID_ARGUMENT' ? 2 : 1;
}
