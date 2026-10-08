import { mkdir, writeFile } from 'node:fs/promises';
import { runSixMarketVerifier } from './six-market-verifier.js';
const report=await runSixMarketVerifier();
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/six-market-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pinnedBlock:report.pinnedBlock,
 outcomes:report.results.map(x=>({market:x.market,status:x.status})),
 readOnly:report.readOnly,executionAuthorized:report.executionAuthorized},null,2));
