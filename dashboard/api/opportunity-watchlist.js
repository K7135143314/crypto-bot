import {buildOpportunityWatchlist} from '../lib/opportunity-watchlist.js';
const SOURCE='https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/verification.json';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 try{
  const source=await fetch(SOURCE,{cache:'no-store',headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!source.ok)throw Error('Saved verification history HTTP '+source.status);
  const history=await source.json();
  if(!Array.isArray(history?.runs))throw Error('Invalid centrally saved history');
  const report=buildOpportunityWatchlist(history,Date.now());
  res.status(200).json({ok:true,...report});
 }catch(error){
  res.status(502).json({ok:false,state:'SOURCE_ERROR',readOnly:true,executionAuthorized:false,
   error:String(error),items:[]});
 }
}
