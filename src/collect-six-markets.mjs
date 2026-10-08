import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { scanSixMarkets } from '../dashboard/lib/market-watch.js';
import { mergeMarketHistory } from '../dashboard/lib/market-history.js';
const [previousPath = 'artifacts/central/markets.json', outputPath = 'artifacts/central/markets.next.json'] = process.argv.slice(2);
const previous = JSON.parse(await readFile(previousPath,'utf8'));
const report = await scanSixMarkets();
if (report.markets.every((m) => m.sourceCoverage === 'SOURCE_ERROR')) {
  throw new Error('All six markets unavailable; do not publish a failed scan as a valid observation');
}
const next = mergeMarketHistory(previous, report);
await mkdir(dirname(outputPath), { recursive:true });
await writeFile(outputPath, JSON.stringify(next,null,2)+'\n','utf8');
console.log('Six-market history saved: '+next.runs.length+' runs; current coverage: '+
 report.markets.map((m)=>m.market+'='+m.sourceCoverage).join(', '));
