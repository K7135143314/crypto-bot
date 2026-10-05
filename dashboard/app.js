const sizes=[100,250,500,1000,2500,5000,10000];
const points=[];
const maxPoints=120;
const refreshMs=20000;
let seconds=20;
let busy=false;

const $=(id)=>document.getElementById(id);
const money=(v,d=4)=>{const n=Number(v);return (n<0?'-$':'$')+Math.abs(n).toFixed(d)};
const setText=(id,v)=>{const el=$(id);if(el)el.textContent=v};

function canvasSetup(id){
  const canvas=$(id);
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(1,rect.width*dpr);
  canvas.height=Math.max(1,rect.height*dpr);
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  return {ctx,w:rect.width,h:rect.height,padL:52,padR:18,padT:22,padB:34};
}

function drawGrid(ctx,w,h,padL,padR,padT,padB){
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#173448';
  ctx.lineWidth=1;
  for(let i=0;i<5;i++){
    const y=padT+i*(h-padT-padB)/4;
    ctx.beginPath();
    ctx.moveTo(padL,y);
    ctx.lineTo(w-padR,y);
    ctx.stroke();
  }
}

function timeLabel(t){
  return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

function drawProfit(){
  const s=canvasSetup('profitChart');
  drawGrid(s.ctx,s.w,s.h,s.padL,s.padR,s.padT,s.padB);
  if(points.length<2){
    s.ctx.fillStyle='#8eabc0';
    s.ctx.font='13px Arial';
    s.ctx.fillText('Profit line will build as new scans arrive…',s.padL,48);
    return;
  }
  const nets=points.map((p)=>p.net);
  let min=Math.min(...nets,0);
  let max=Math.max(...nets,0);
  const margin=Math.max(.05,(max-min)*.15);
  min-=margin;
  max+=margin;
  const x=(i)=>s.padL+i/(points.length-1)*(s.w-s.padL-s.padR);
  const y=(v)=>s.h-s.padB-(v-min)/(max-min)*(s.h-s.padT-s.padB);
  const zero=y(0);
  s.ctx.save();
  s.ctx.setLineDash([6,5]);
  s.ctx.strokeStyle='#b8c1c8';
  s.ctx.lineWidth=1.3;
  s.ctx.beginPath();
  s.ctx.moveTo(s.padL,zero);
  s.ctx.lineTo(s.w-s.padR,zero);
  s.ctx.stroke();
  s.ctx.restore();
  s.ctx.fillStyle='#9fb1be';
  s.ctx.font='11px Arial';
  s.ctx.fillText('$0.00',6,zero+4);
  s.ctx.strokeStyle='#258cff';
  s.ctx.lineWidth=3;
  s.ctx.beginPath();
  points.forEach((p,i)=>{if(i===0)s.ctx.moveTo(x(i),y(p.net));else s.ctx.lineTo(x(i),y(p.net));});
  s.ctx.stroke();
  points.forEach((p,i)=>{
    if(p.net>=0){
      s.ctx.fillStyle='#20d990';
      s.ctx.beginPath();
      s.ctx.arc(x(i),y(p.net),4,0,Math.PI*2);
      s.ctx.fill();
    }
  });
  const last=points[points.length-1];
  s.ctx.fillStyle=last.net>=0?'#20d990':'#258cff';
  s.ctx.beginPath();
  s.ctx.arc(x(points.length-1),y(last.net),5,0,Math.PI*2);
  s.ctx.fill();
  s.ctx.fillStyle='#8eabc0';
  s.ctx.fillText(timeLabel(points[0].t),s.padL,s.h-10);
  const rt=timeLabel(last.t);
  s.ctx.fillText(rt,s.w-s.padR-s.ctx.measureText(rt).width,s.h-10);
}

function drawPrice(){
  const s=canvasSetup('priceChart');
  drawGrid(s.ctx,s.w,s.h,s.padL,s.padR,s.padT,s.padB);
  if(points.length<2){
    s.ctx.fillStyle='#8eabc0';
    s.ctx.font='13px Arial';
    s.ctx.fillText('WETH price line will build as new scans arrive…',s.padL,48);
    return;
  }
  const prices=points.map((p)=>p.price);
  let min=Math.min(...prices);
  let max=Math.max(...prices);
  const margin=Math.max(1,(max-min)*.18);
  min-=margin;
  max+=margin;
  const x=(i)=>s.padL+i/(points.length-1)*(s.w-s.padL-s.padR);
  const y=(v)=>s.h-s.padB-(v-min)/(max-min)*(s.h-s.padT-s.padB);
  s.ctx.strokeStyle='#20d990';
  s.ctx.lineWidth=2.5;
  s.ctx.beginPath();
  points.forEach((p,i)=>{if(i===0)s.ctx.moveTo(x(i),y(p.price));else s.ctx.lineTo(x(i),y(p.price));});
  s.ctx.stroke();
  const last=points[points.length-1];
  s.ctx.fillStyle='#20d990';
  s.ctx.beginPath();
  s.ctx.arc(x(points.length-1),y(last.price),4.5,0,Math.PI*2);
  s.ctx.fill();
  s.ctx.fillStyle='#8eabc0';
  s.ctx.font='11px Arial';
  s.ctx.fillText(timeLabel(points[0].t),s.padL,s.h-10);
  const rt=timeLabel(last.t);
  s.ctx.fillText(rt,s.w-s.padR-s.ctx.measureText(rt).width,s.h-10);
}

function drawCharts(){
  drawProfit();
  drawPrice();
}

function renderMatrix(scan){
  const m=$('matrix');
  m.innerHTML='<div class="mlabel">Route</div>'+sizes.map((size)=>'<div class="mhead">$'+size.toLocaleString()+'</div>').join('');
  for(const route of ['Aerodrome → Uniswap v3','Uniswap v3 → Aerodrome']){
    m.insertAdjacentHTML('beforeend','<div class="mlabel">'+route.replace(' v3','')+'</div>');
    for(const size of sizes){
      const row=scan.rows.find((x)=>x.route===route&&x.startUsdc===size);
      const value=row?row.estimatedNetUsdc:null;
      const cls=value>=0?'pos':value>=-1?'near':'neg';
      m.insertAdjacentHTML('beforeend','<div class="cell '+cls+'">'+(row?money(value,3):'—')+'</div>');
    }
  }
}

async function refresh(){
  if(busy)return;
  busy=true;
  $('scanBtn').disabled=true;
  $('scanBtn').textContent='Scanning…';
  try{
    const response=await fetch('/api/scan?t='+Date.now(),{cache:'no-store'});
    const scan=await response.json();
    if(!response.ok||!scan.ok)throw new Error(scan.error||'Live scan failed');

    $('error').style.display='none';
    setText('block','Block '+scan.blockNumber);
    setText('candidates',scan.candidateCount);
    setText('matrixCount',scan.matrixComplete+'/14');
    setText('premium',scan.flashLoanPremiumBps+' bps');
    setText('premiumPct','('+(scan.flashLoanPremiumBps/100).toFixed(2)+'%)');
    setText('gas',scan.gasPriceGwei.toFixed(4)+' gwei');
    setText('bestRoute',scan.best.route);
    setText('bestSize','$'+scan.best.startUsdc.toLocaleString());
    setText('bestNet',money(scan.best.estimatedNetUsdc,6));
    $('bestNet').className=scan.best.estimatedNetUsdc>=0?'green':'red';
    setText('decision',scan.best.decision);
    $('decision').className='pill '+(scan.best.decision==='CANDIDATE'?'candidate':'reject');
    setText('wethPrice','$'+scan.wethReferencePrice.toFixed(2));
    $('candidateAlert').className='candidateAlert'+(scan.candidateCount>0?' show':'');

    points.push({t:Date.now(),net:scan.best.estimatedNetUsdc,price:scan.wethReferencePrice});
    if(points.length>maxPoints)points.shift();

    const prev=points[points.length-2];
    const cur=points[points.length-1];
    if(prev){
      const netChange=cur.net-prev.net;
      $('delta').className='delta '+(netChange>=0?'good':'bad');
      setText('delta',(netChange>=0?'▲ ':'▼ ')+money(Math.abs(netChange),4)+' since prior refresh');
      const priceChange=cur.price-prev.price;
      $('priceMove').className='delta '+(priceChange>=0?'good':'bad');
      setText('priceMove',(priceChange>=0?'▲ ':'▼ ')+'$'+Math.abs(priceChange).toFixed(2)+' since prior refresh');
    }

    const prices=points.map((p)=>p.price);
    setText('priceRange','Session range: $'+Math.min(...prices).toFixed(2)+' – $'+Math.max(...prices).toFixed(2));
    setText('obs','Observations: '+points.length);
    renderMatrix(scan);
    drawCharts();

    const ts=new Date(scan.generatedAt).toLocaleTimeString();
    $('feed').innerHTML=
      '<p><time>'+ts+'</time>14-route live scan complete</p>'+
      '<p><time>'+ts+'</time>candidate count: '+scan.candidateCount+'</p>'+
      '<p><time>'+ts+'</time>no wallet / no signing / no transaction</p>';
    seconds=20;
  }catch(error){
    $('error').style.display='block';
    $('error').textContent='Live scan error: '+(error instanceof Error?error.message:String(error));
  }finally{
    busy=false;
    $('scanBtn').disabled=false;
    $('scanBtn').textContent='Scan now';
  }
}

$('scanBtn').addEventListener('click',refresh);
window.addEventListener('resize',drawCharts);
refresh();
setInterval(refresh,refreshMs);
setInterval(()=>{
  seconds=seconds<=1?20:seconds-1;
  setText('countdown','Refresh in '+seconds+'s');
},1000);
