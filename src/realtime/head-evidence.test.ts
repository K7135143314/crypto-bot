import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EvidenceWriter, verifyEvidence, type Evidence } from './head-evidence.js';
test('append, reopen and reject modified research evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'base-evidence-'));
 const path=join(dir,'audit.jsonl');
 const r={verdict:'RPC_UNAVAILABLE' as const,observed:null,providerCount:2,checkedProviders:0,
 usableForTrading:false as const,reason:'No available responses'};
 try{
  const w=await EvidenceWriter.open(path);
  const one=await w.append({observedAt:'2026-10-14T00:00:00Z',reconciliation:r});
  const two=await w.append({observedAt:'2026-10-14T00:00:01Z',reconciliation:r});
  assert.equal(one.sequence,1);assert.equal(two.previousDigest,one.digest);
  const reopened=await EvidenceWriter.open(path);assert.equal(reopened.count,2);
  const raw=await readFile(path,'utf8');
  const parsed=raw.trim().split('\n').map(v=>JSON.parse(v) as Evidence);
  assert.equal(verifyEvidence(parsed),true);
  parsed[0]!.reconciliation.reason='tampered';
  await writeFile(path,parsed.map(v=>JSON.stringify(v)).join('\n')+'\n');
  await assert.rejects(EvidenceWriter.open(path),/invalid/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
