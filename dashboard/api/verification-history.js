const SOURCE='https://raw.githubusercontent.com/K7135143314/crypto-bot/observer-data/data/verification.json';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 try {
  const upstream=await fetch(SOURCE,{cache:'no-store',headers:{accept:'application/json'}});
  if(!upstream.ok)throw Error('Verification history HTTP '+upstream.status);
  const data=await upstream.json();
  if(!Array.isArray(data.runs))throw Error('Invalid saved verification history');
  res.status(200).json({ok:true,...data,readOnly:true,executionAuthorized:false});
 }catch(error){res.status(502).json({ok:false,error:String(error)});}
}
