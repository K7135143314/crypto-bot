import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Reconciliation } from './head-reconcile.js';
export type Evidence={version:1;sequence:number;previousDigest:string;recordedAt:string;
  observedAt:string;reconciliation:Reconciliation;digest:string};
const digest=(x:string)=>createHash('sha256').update(x).digest('hex');
export function verifyEvidence(records:readonly Evidence[]):boolean{
 let prev='GENESIS';
 for(let i=0;i<records.length;i++){
  const {digest:actual,...rest}=records[i]!;
  if(rest.sequence!==i+1||rest.previousDigest!==prev||actual!==digest(JSON.stringify(rest)))return false;
  prev=actual;
 }
 return true;
}
export class EvidenceWriter{
 private records:Evidence[]=[];
 private constructor(private readonly path:string){}
 static async open(path:string){
  const writer=new EvidenceWriter(path);
  let content='';
  try{content=await readFile(path,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
  const lines=content.split('\n').filter(Boolean);
  try{writer.records=lines.map(line=>JSON.parse(line) as Evidence)}catch{throw Error('Evidence log contains corrupt JSON')}
  if(!verifyEvidence(writer.records))throw Error('Evidence digest chain invalid; refuse append');
  return writer;
 }
 async append(value:{observedAt:string;reconciliation:Reconciliation},now=new Date().toISOString()){
  if(!Number.isFinite(Date.parse(value.observedAt))||!Number.isFinite(Date.parse(now)))throw Error('Invalid evidence timestamp');
  const previousDigest=this.records.at(-1)?.digest??'GENESIS';
  const plain={version:1 as const,sequence:this.records.length+1,previousDigest,recordedAt:now,
   observedAt:value.observedAt,reconciliation:value.reconciliation};
  const item:Evidence={...plain,digest:digest(JSON.stringify(plain))};
  await mkdir(dirname(this.path),{recursive:true});
  const f=await open(this.path,'a');
  try{await f.writeFile(JSON.stringify(item)+'\n');await f.sync()}finally{await f.close()}
  this.records.push(item);
  return item;
 }
 get count(){return this.records.length}
}
