import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(path.join(tmpdir(),'gemba-regression-'));
import { mockPlugin } from './mockPlugin.mjs';

try {
 await build({ entryPoints:['tests/regression.test.tsx'],outfile:path.join(directory,'test.cjs'),bundle:true,platform:'node',format:'cjs',packages:'bundle',define:{'import.meta.env.DEV':'false'},plugins:[mockPlugin],logLevel:'warning' });
 const result=spawnSync(process.execPath,['--test','--test-reporter=spec',path.join(directory,'test.cjs')],{stdio:'inherit'});
 process.exitCode=result.status ?? 1;
} finally { await rm(directory,{recursive:true,force:true}); }
