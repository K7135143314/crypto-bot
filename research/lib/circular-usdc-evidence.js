// Read-only, conservative same-asset USDC transfer-flow candidate detector.
// A round-trip *looking* receipt is not proof of arbitrage, execution feasibility,
// ownership, or profit. No wallets, signing, state changes, or trade signals.
import {TRANSFER_TOPIC, BASE_USDC} from './base-transfer-flows.js';

const A=/^0x[0-9a-f]{40}$/i;
const W=/^0x[0-9a-f]{64}$/i;
const lower=x=>String(x??'').toLowerCase();
const ZERO='0x'+'0'.repeat(40);
const asUsdc=raw=>{
  const n=BigInt(raw),v=n<0n?-n:n;
  return (n<0n?'-':'')+(v/1000000n).toString()+'.'+(v%1000000n).toString().padStart(6,'0');
};
function decodeTransfer(log){
  if(lower(log?.topics?.[0])!==TRANSFER_TOPIC) return null;
  if(!A.test(String(log.address??''))||log.topics?.length!==3||
    !W.test(String(log.topics[1]))||!W.test(String(log.topics[2]))||
    !W.test(String(log.data??''))) return {invalid:true,token:lower(log?.address)};
  return {token:lower(log.address),from:'0x'+log.topics[1].slice(-40).toLowerCase(),
    to:'0x'+log.topics[2].slice(-40).toLowerCase(),amount:BigInt(log.data)};
}
export function classifyCircularUsdcEvidence(receipt,swapTopics){
  const allowed=new Set(swapTopics.map(lower));
  const emitters=new Set((receipt?.logs||[])
    .filter(l=>A.test(String(l.address??''))&&allowed.has(lower(l.topics?.[0])))
    .map(l=>lower(l.address)));
  const status=receipt?.status;
  const byActor=new Map();
  let decodedTransfers=0,invalidUSDCLogs=0;
  for(const log of receipt?.logs||[]){
    const t=decodeTransfer(log);
    if(!t)continue;
    if(t.invalid){
      if(t.token===BASE_USDC)invalidUSDCLogs++;
      continue;
    }
    decodedTransfers++;
    for(const [actor,inbound] of [[t.from,false],[t.to,true]]){
      if(actor===ZERO)continue;
      let data=byActor.get(actor);
      if(!data){data={address:actor,usdcIncoming:0n,usdcOutgoing:0n,otherAssetNet:new Map()};byActor.set(actor,data);}
      if(t.token===BASE_USDC){
        if(inbound)data.usdcIncoming+=t.amount;
        else data.usdcOutgoing+=t.amount;
      }else data.otherAssetNet.set(t.token,(data.otherAssetNet.get(t.token)||0n)+(inbound?t.amount:-t.amount));
    }
  }
  const nonPoolActors=[...byActor.values()].filter(x=>!emitters.has(x.address));
  const roundTripActors=nonPoolActors.filter(x=>x.usdcIncoming>0n&&x.usdcOutgoing>0n)
    .map(x=>{
      const surplus=x.usdcIncoming-x.usdcOutgoing;
      const otherAssetDebit=[...x.otherAssetNet].filter(([,v])=>v<0n)
        .map(([token,raw])=>({token,raw:String(raw)}));
      return {
        address:x.address,
        role:x.address===lower(receipt?.from)?'TX_SENDER':
          x.address===lower(receipt?.to)?'TX_TARGET':'OTHER_ADDRESS',
        incomingUsdcRaw:String(x.usdcIncoming),outgoingUsdcRaw:String(x.usdcOutgoing),
        surplusUsdcRaw:String(surplus),surplusUsdcFormatted:asUsdc(surplus),
        otherAssetNetDebits:otherAssetDebit,
        strictCandidate:surplus>0n&&otherAssetDebit.length===0
      };
    });
  const strict=roundTripActors.filter(x=>x.strictCandidate);
  let classification='NO_CIRCULAR_USDC_TRANSFER_EVIDENCE';
  if(status!=='success')classification='FAILED_OR_UNKNOWN_RECEIPT';
  else if(invalidUSDCLogs>0)classification='INCOMPLETE_USDC_TRANSFER_EVIDENCE';
  else if(emitters.size<2)classification='INSUFFICIENT_DISTINCT_SWAP_EMITTERS';
  else if(strict.length)classification='POSSIBLE_CIRCULAR_USDC_TRANSFER_FLOW';
  return {
    classification,txHash:receipt?.transactionHash??null,blockNumber:receipt?.blockNumber?.toString()??null,
    swapEmitterCount:emitters.size,decodedErc20TransferCount:decodedTransfers,
    invalidUSDCTransferLogCount:invalidUSDCLogs,
    usdcRoundTripActorCount:roundTripActors.length,
    strictCashflowCandidates:classification==='POSSIBLE_CIRCULAR_USDC_TRANSFER_FLOW'?
      strict.slice(0,8):[],
    observedActorsWithBothUSDCFlows:roundTripActors.slice(0,8),
    actorResultsTruncated:roundTripActors.length>8,
    netProfitUsdc:null,actualArbitrageConfirmed:false,executionAuthorized:false,
    note:'The same non-pool address both sent and received USDC and retained a transfer-log surplus, with no observed net debit in other ERC20 assets. This is only a cash-flow lead: internal/native transfers, ownership, debts, flash loans, incentives, gas/MEV and complete route/factory proof are missing. The absence of leads does not rule out arbitrage.'
  };
}
