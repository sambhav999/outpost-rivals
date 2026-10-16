(()=>{
'use strict';
document.body.classList.toggle('embedded',new URLSearchParams(location.search).has('embedded'));
/* ================= basics ================= */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const hash2=(x,y)=>{let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296};
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t)};
const hexRgb=h=>{const n=parseInt(h.slice(1),16);return[n>>16,n>>8&255,n&255]};
const rgbHex=(r,g,b)=>'#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
const shade=(h,a)=>rgbHex(...hexRgb(h).map(v=>Math.round(a<0?v*(1+a):v+(255-v)*a)));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let R=Math.random;
const pick=(arr,r=R)=>arr[(r()*arr.length)|0];
function lattice(cell,rng,size=80){
  const gw=Math.ceil(size/cell)+3,g=new Float32Array(gw*gw);for(let i=0;i<g.length;i++)g[i]=rng();
  return (x,y)=>{const fx=Math.max(0,x)/cell,fy=Math.max(0,y)/cell,ix=fx|0,iy=fy|0;let u=fx-ix,v=fy-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);
    const a=g[iy*gw+ix],b=g[iy*gw+ix+1],c=g[(iy+1)*gw+ix],d=g[(iy+1)*gw+ix+1];return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v};
}

/* ================= world constants ================= */
const MW=64,MH=64,N=MW*MH;
const OX=MH*16+24,OY=56;
const WORLD_W=(MW+MH)*16+48,WORLD_H=(MW+MH)*8+120;
const isoX=(x,y)=>OX+(x-y)*16, isoY=(x,y)=>OY+(x+y)*8;
const G={GRASS:0,DIRT:1,SAND:2,WATER:3,ROCK:4,PLAZA:5,PATH:6};
const DAY=150, SIM_DT=0.05;
const TEAMS=[
  {name:'Emberhold',color:'#dc5a40',roof:'#c2412b',dark:'#6f2316'},
  {name:'Tidewatch',color:'#4a95da',roof:'#2f6db0',dark:'#1a3a64'},
  {name:'Sunreach', color:'#e3b43e',roof:'#b98a24',dark:'#634810'},
];
const MT={
  slime:{hp:28,dmg:4,spd:1.1,cd:1.25,aggro:3.5,px:6,xp:6,label:'SLIME'},
  wolf:{hp:46,dmg:7,spd:2.4,cd:1.0,aggro:6,px:12,xp:10,label:'WOLF'},
  golem:{hp:150,dmg:15,spd:0.8,cd:1.8,aggro:4,px:55,xp:40,label:'GOLEM'},
  wraith:{hp:55,dmg:9,spd:1.9,cd:1.1,aggro:7,px:20,xp:16,label:'WRAITH'},
};
const PROJ={
  tower:{name:'watchtower',wood:60,stone:70,food:0,work:24},
  forge:{name:'forge upgrade',wood:30,stone:70,food:0,work:18},
  hall:{name:'hall upgrade',wood:70,stone:20,food:40,work:22},
};
const ROLES=['gatherer','builder','guard','raider','scout'];
const GOALS=[
  {k:'mkills',n:15,t:'Slay 15 monsters'},{k:'golem',n:2,t:'Bring down 2 golems'},{k:'deliver',n:120,t:'Haul 120 resources home'},
  {k:'duels',n:3,t:'Win 3 duels'},{k:'capture',n:1,t:'Capture an enemy flag'},{k:'build',n:2,t:'Finish 2 building projects'},
  {k:'pxearn',n:400,t:'Earn 400 PX'},{k:'help',n:4,t:'Come to the aid of 4 allies'},{k:'rift',n:1,t:'Seal a rift'},
];

/* ================= state ================= */
let tiles,bridge,block,forest,wdepth,FN,FN2;
let bases,agents,monsters,resources,statics,projs,floaters,graves,feed,smokes,sparkles;
let rift,riftT,spawnT,time,day,season,daily,banner,headline,seasonEnd,uidN;
let watched=null,follow=true,director=true,lastDirect=-99,speed=2,paused=false,tab='mind',feedOpen=false;
let linkedCaptain=null;
const ZOOMS=[1,1.5,2,3,4];let zi=2;
const cam={x:0,y:0};
let terrainC=null,miniBase=null;

/* ================= sprite toolkit ================= */
function inPoly(x,y,p){let s=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)s=!s}return s}
function spr(w,h,fn){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  const P={g,w,h,
    px(x,y,col){if(x<0||y<0||x>=w||y>=h)return;g.fillStyle=col;g.fillRect(x|0,y|0,1,1)},
    rect(x,y,ww,hh,col){g.fillStyle=col;g.fillRect(Math.round(x),Math.round(y),Math.round(ww),Math.round(hh))},
    poly(p,col){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(const[a,b]of p){x0=Math.min(x0,a);x1=Math.max(x1,a);y0=Math.min(y0,b);y1=Math.max(y1,b)}
      g.fillStyle=col;for(let y=Math.floor(y0);y<=Math.ceil(y1);y++)for(let x=Math.floor(x0);x<=Math.ceil(x1);x++)if(inPoly(x+.5,y+.5,p))g.fillRect(x,y,1,1)},
    line(x0,y0,x1,y1,col){g.fillStyle=col;x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
      const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy;
      for(let k=0;k<400;k++){g.fillRect(x0,y0,1,1);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}},
    disc(cx,cy,r,col){g.fillStyle=col;for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++){const dx=x+.5-cx,dy=y+.5-cy;if(dx*dx+dy*dy<=r*r)g.fillRect(x,y,1,1)}},
  };
  fn(P);return c;
}
function blob(P,circles,ramp,o={}){
  const{w,h,g}=P;const m=new Uint8Array(w*h),nx=new Float32Array(w*h),ny=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let best=-1e9,bc=null;for(const c of circles){const d=Math.hypot((x+.5-c[0])/(c[3]||1),y+.5-c[1]);const dep=c[2]-d;if(dep>best){best=dep;bc=c}}
    if(best>=0){const i=y*w+x;m[i]=1;nx[i]=(x+.5-bc[0])/bc[2];ny[i]=(y+.5-bc[1])/bc[2]}}
  const seed=o.seed||0,lx=-0.55,ly=-0.83;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!m[i])continue;
    const edge=x===0||y===0||x===w-1||y===h-1||!m[i-1]||!m[i+1]||!m[i-w]||!m[i+w];
    if(edge&&o.outline){g.fillStyle=o.outline;g.fillRect(x,y,1,1);continue}
    const dot=nx[i]*lx+ny[i]*ly;let k=Math.floor((dot*0.5+0.5)*ramp.length+(hash2(x+seed*37,y+seed*11)-0.5)*(o.noise??1));
    g.fillStyle=ramp[clamp(k,0,ramp.length-1)];g.fillRect(x,y,1,1)}
  return m;
}
function outlineCanvas(c,col){
  const g=c.getContext('2d'),W=c.width,H=c.height,d=g.getImageData(0,0,W,H),a=d.data,pts=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y*W+x)*4;if(a[i+3]>0)continue;
    if((x>0&&a[i-4+3]>0)||(x<W-1&&a[i+4+3]>0)||(y>0&&a[i-W*4+3]>0)||(y<H-1&&a[i+W*4+3]>0))pts.push(x,y)}
  g.fillStyle=col;for(let k=0;k<pts.length;k+=2)g.fillRect(pts[k],pts[k+1],1,1);return c;
}
const SP={};
function buildSprites(){
  const sr=mulberry32(777);
  // pines
  SP.pine=[];
  const pinePals=[['#1b3826','#2a5634','#3b743b','#5a9348'],['#173424','#24503a','#33704a','#4d8d5b'],['#1e3923','#2e5c2f','#427836','#62964a']];
  for(let v=0;v<5;v++){
    const pal=pinePals[v%3],layers=3+(v%3),H=12+layers*6,W=26,cx=13;
    const c=spr(W,H,P=>{
      P.rect(cx-1,H-7,3,7,'#4b3121');P.rect(cx+1,H-7,1,7,'#36231a');
      for(let L=layers-1;L>=0;L--){const top=1+L*6,bot=top+9,hw=2.6+L*2.3+(sr()-0.5);
        for(let y=top;y<=bot;y++){const fr=(y-top)/(bot-top),wv=Math.max(.6,hw*fr+.6);
          for(let x=Math.floor(cx-wv);x<=Math.ceil(cx+wv);x++){const d=(x+.5-cx)/wv;if(Math.abs(d)>1)continue;
            if(y===bot&&(x+L+v)%2===0&&Math.abs(d)>0.2)continue;
            let col=pal[2];if(Math.abs(d)>0.8||y===bot)col=pal[0];else if(d<-0.25&&hash2(x*3+v,y*7)>0.25)col=pal[3];else if(d>0.35)col=pal[1];
            P.px(x,y,col)}}}
      P.px(cx,0,pal[3]);
    });
    SP.pine.push({c,ax:13,ay:H-2});
  }
  // round trees (oak + birch)
  SP.round=[];
  for(let v=0;v<6;v++){
    const birch=v>=3,W=30,H=36;
    const ramp=birch?['#3d6a2a','#538a33','#6ba63f','#88bf4f','#a6d466']:['#284b23','#386a2e','#4f8a39','#69a546','#87bf56'];
    const c=spr(W,H,P=>{
      const tc=birch?'#e6e0d2':'#5a3a22';P.rect(13,19,4,15,tc);P.rect(16,19,1,15,birch?'#b9b2a4':'#3e2716');
      if(birch)for(let y=21;y<33;y+=3)P.rect(13+(y%2),y,2,1,'#2e2a26');
      P.rect(12,33,6,1,'#3e2716');
      const cs=[[15,13,9.5]];for(let k=0;k<4;k++){const a=sr()*6.28;cs.push([15+Math.cos(a)*6,13+Math.sin(a)*4.5,4+sr()*2.5])}
      blob(P,cs,ramp,{outline:'#1d361a',noise:1.4,seed:v+3});
      for(let k=0;k<8;k++){const a=sr()*6.28,r=sr()*6;P.px(13+Math.cos(a)*r-2,10+Math.sin(a)*r-2,ramp[4])}
    });
    SP.round.push({c,ax:15,ay:33});
  }
  SP.cactus=[0,1].map(v=>({ax:6,ay:17,c:spr(13,19,P=>{
    const g1='#5d9b45',g2='#3e7533',g3='#86c25d',o='#24451f';
    P.rect(5,3,3,15,g1);P.rect(7,3,1,15,g2);P.rect(5,3,1,14,g3);
    P.rect(2,7+v,2,5,g1);P.rect(2,11+v,3,1,g1);P.rect(9,5,2,6-v,g1);P.rect(8,10-v,2,1,g1);
    outlineCanvas(P.g.canvas,o);P.px(6,2,'#e98ab0');
  })}));
  SP.bush=[0,1].map(full=>({ax:7,ay:9,c:spr(15,11,P=>{
    blob(P,[[7.5,6.5,5,1.3],[4.5,7,3.5],[10.5,7,3.5]],['#2f5a28','#3f7532','#55913c','#6dab48'],{outline:'#1d361a',seed:5});
    if(full)for(const[x,y]of[[4,5],[8,4],[10,7],[6,8],[11,4]])P.px(x,y,'#d63d4c');
  })}));
  SP.boulder=[0,1,2].map(v=>({ax:9,ay:11,c:spr(18,13,P=>{
    const cs=v===0?[[9,7,6.5,1.25]]:v===1?[[7,8,5],[12,7,4.5]]:[[9,8,6,1.4],[6,6,3.5]];
    blob(P,cs,['#4c4744','#655f5a','#7f7872','#9a928a','#b2aaa1'],{outline:'#2b2725',seed:v+20});
    P.px(6,4,'#6c8f45');P.px(7,4,'#6c8f45');
  })}));
  SP.stump={ax:5,ay:5,c:spr(11,8,P=>{P.rect(2,2,7,4,'#5a3a22');P.rect(2,1,7,2,'#a57b4c');P.px(5,1,'#7a5530');P.rect(1,5,9,1,'#3e2716')})};
  // cliff blocks
  SP.cliff=[0,1,2,3].map(v=>spr(34,31,P=>{
    const T=[[17,0],[33,8],[17,16],[1,8]],L=[[1,8],[17,16],[17,29],[1,21]],Rr=[[17,16],[33,8],[33,21],[17,29]];
    const fill=(poly,ramp,s)=>{for(let y=0;y<31;y++)for(let x=0;x<34;x++)if(inPoly(x+.5,y+.5,poly)){const h=hash2(x+v*50+s,y*3+s);P.px(x,y,ramp[Math.min(ramp.length-1,(h*ramp.length)|0)])}};
    fill(L,['#6f6761','#776f68','#655e58'],1);fill(Rr,['#57504b','#5e5751','#4e4843'],2);fill(T,['#9a9189','#a39a91','#8f8780','#aea59b'],3);
    for(const z of[17,22,26]){P.line(1,z,17,z+8,'#5d5650');P.line(17,z+8,33,z,'#46403c')}
    P.line(1,8,17,16,'#b8afa5');P.line(17,16,33,8,'#7a726b');
    for(let k=0;k<6;k++){const x=4+((hash2(v,k)*24)|0),y=Math.round(8-Math.abs(x-17)*0.5)+((hash2(k,v)*3)|0);P.px(x,y,'#6f9a45');P.px(x+1,y,'#86b052')}
    P.line(17,1,17,15,'#91887f');
  }));
  // wall block
  SP.wall=spr(34,28,P=>{
    const ox=17,oy=11,h=10,Q=(x,y,z)=>[ox+(x-y)*16,oy+(x+y)*8-z];
    P.poly([Q(0,1,0),Q(1,1,0),Q(1,1,h),Q(0,1,h)],'#8f877e');P.poly([Q(1,1,0),Q(1,0,0),Q(1,0,h),Q(1,1,h)],'#6b655e');
    P.poly([Q(0,0,h),Q(1,0,h),Q(1,1,h),Q(0,1,h)],'#b5ada3');
    for(const z of[3,6]){P.line(...Q(0,1,z),...Q(1,1,z),'#766f68');P.line(...Q(1,1,z),...Q(1,0,z),'#57524c')}
    for(let k=1;k<4;k++){const t=k/4;P.line(...Q(t,1,(k%2)*3),...Q(t,1,(k%2)*3+3),'#766f68');P.line(...Q(1,1-t,((k+1)%2)*3),...Q(1,1-t,((k+1)%2)*3+3),'#57524c')}
    P.line(...Q(0,1,h),...Q(1,1,h),'#cfc7bc');
  });
  SP.lamp=spr(8,22,P=>{P.rect(3,6,2,15,'#3c3430');P.rect(1,2,6,5,'#2a2420');P.rect(2,3,4,3,'#ffcf6a');P.rect(2,1,4,1,'#2a2420');P.rect(2,20,4,1,'#2a2420')});
  SP.grave=spr(9,12,P=>{P.rect(2,2,5,9,'#8a837b');P.rect(2,2,5,1,'#b2aaa0');P.rect(6,3,1,8,'#625c56');P.rect(3,5,3,1,'#5a544e');P.rect(4,4,1,3,'#5a544e');P.rect(0,10,9,2,'#4a3a2a')});
  SP.logs=spr(9,6,P=>{P.rect(0,1,9,2,'#7a5530');P.rect(0,3,9,2,'#5a3a22');P.rect(0,1,2,2,'#c09060');P.rect(0,3,2,2,'#a57b4c')});
  SP.stone=spr(7,6,P=>{blob(P,[[3.5,3.5,3]],['#5e5853','#7f7872','#a29a91'],{outline:'#2b2725'})});
  SP.food=spr(7,6,P=>{blob(P,[[3.5,3.5,3]],['#8a2a33','#c83d4c','#e8707c'],{outline:'#3a1418'})});
  SP.campfire=[0,1,2].map(f=>spr(18,18,P=>{
    for(const[x,y]of[[2,14],[5,15],[9,16],[13,15],[15,13],[12,12],[5,12]])P.rect(x,y,2,2,'#7f7872');
    P.line(4,15,13,12,'#5a3a22');P.line(4,12,13,15,'#6b4a2e');
    const hs=[[6,7],[8,4],[10,6],[12,8]];hs.forEach(([x,ht],k)=>{const hh=ht-((f+k)%3);P.rect(x-1,13-hh,2,hh,'#e8662c');P.rect(x-1,13-hh+2,2,Math.max(1,hh-3),'#ffb347')});
    P.rect(8,9-f%2,2,3,'#ffe28a');
  }));
  SP.coin=spr(5,5,P=>{P.rect(1,0,3,5,'#e9b04b');P.rect(0,1,5,3,'#e9b04b');P.rect(1,1,2,2,'#fff1b8');P.rect(3,3,1,1,'#a67a24')});
  SP.arrow=spr(5,1,P=>{P.rect(0,0,4,1,'#5a3a22');P.px(4,0,'#d8dde2')});
  SP.scaffold=spr(36,44,P=>{
    const ox=18,oy=28,h=24,Q=(x,y,z)=>[ox+(x-y)*16,oy+(x+y)*8-z],wd='#9a7146',dk='#6b4a2e';
    for(const[x,y]of[[0,0],[1,0],[1,1],[0,1]])P.line(...Q(x,y,0),...Q(x,y,h),x+y===2?wd:dk);
    for(const z of[0,12,24]){P.line(...Q(0,1,z),...Q(1,1,z),wd);P.line(...Q(1,1,z),...Q(1,0,z),dk);P.line(...Q(0,0,z),...Q(1,0,z),dk);P.line(...Q(0,0,z),...Q(0,1,z),dk)}
    P.line(...Q(0,1,0),...Q(1,1,12),wd);P.line(...Q(1,1,0),...Q(1,0,12),dk);
    P.poly([Q(0.15,1.0,6),Q(0.9,1.0,6),Q(0.9,1.0,9),Q(0.15,1.0,9)],'#b2aaa0');
  });
  // rift frames
  SP.rift=[0,1,2,3].map(f=>spr(30,36,P=>{
    for(let y=0;y<36;y++)for(let x=0;x<30;x++){const dx=(x+.5-15)/10,dy=(y+.5-18)/16,d=Math.hypot(dx,dy);if(d>1)continue;
      const a=Math.atan2(dy,dx)+f*0.8+d*4,s=Math.sin(a*3);let col=d>0.86?'#b28cff':d>0.7?'#7c4ad6':s>0.3?'#5a2fa8':s>-0.2?'#3a1b78':'#24104e';
      if(d<0.25)col='#0e0620';P.px(x,y,col)}
  }));
}
/* flags and team pieces, cached per team */
const teamSprites=[];
function buildTeamSprites(){
  TEAMS.forEach((T,ti)=>{
    const S={};
    S.flag=[0,1].map(f=>spr(18,32,P=>{
      P.rect(2,2,2,28,'#6b5640');P.rect(3,2,1,28,'#4c3c2c');P.rect(1,29,5,2,'#6f6861');P.rect(2,0,2,2,'#e9b04b');
      for(let x=0;x<11;x++){const off=Math.round(Math.sin(x*0.7+f*2.2)*1.1);for(let y=0;y<7;y++){P.px(4+x,3+y+off,y===0?shade(T.color,0.25):y>=5?shade(T.color,-0.25):T.color)}}
      P.rect(8,5+Math.round(Math.sin(2.8+f*2.2)),2,2,'#f3ead8');
    }));
    S.tower=spr(28,52,P=>{
      const top=12,bot=44,cx=13.5,rx=9;
      const ramp=['#d4c3a4','#c4b292','#ae9c7e','#958467','#7b6c54'];
      for(let x=Math.floor(cx-rx);x<Math.ceil(cx+rx);x++){const nxp=(x+.5-cx)/rx;const t=clamp((nxp+0.7)/1.7,0,0.999);const col=ramp[(t*ramp.length)|0];
        const yb=bot+Math.round(Math.sqrt(Math.max(0,1-nxp*nxp))*3);for(let y=top;y<=yb;y++){let c=col;if((y-top)%5===0)c=shade(col,-0.18);else if(((x+(((y-top)/5)|0)*3)%6)===0)c=shade(col,-0.14);P.px(x,y,c)}}
      for(let x=Math.floor(cx-rx);x<Math.ceil(cx+rx);x++){const nxp=(x+.5-cx)/rx,e=Math.round(Math.sqrt(Math.max(0,1-nxp*nxp))*3);for(let y=top-e;y<=top+e;y++)P.px(x,y,y===top-e?'#e6d8bd':'#cbbb9c')}
      for(let k=0;k<6;k++){const x=Math.round(cx-rx+1+k*3.2);P.rect(x,top-6,2,4,k%2?'#b8a688':'#d6c6a8')}
      P.rect(10,18,7,11,T.color);P.rect(10,18,7,1,shade(T.color,0.3));P.rect(16,18,1,11,shade(T.color,-0.3));P.px(10,29,'rgba(0,0,0,0)');P.rect(12,21,3,3,shade(T.color,0.5));
      P.rect(10,29,2,1,T.color);P.rect(15,29,2,1,T.color);
      P.rect(13,33,2,5,'#2a2420');P.rect(13,4,1,4,'#4c3c2c');P.rect(12,3,3,2,'#ffcf6a');
    });
    S.hall=[1,2,3].map(lv=>spr(80,72,P=>{
      const ox=40,oy=36,h=20+(lv-1)*3,rh=16,Q=(x,y,z)=>[ox+(x-y)*16,oy+(x+y)*8-z];
      const wl='#e7d5ae',wr='#c3ad86',tm='#6b4a2e',roof=T.roof;
      P.poly([Q(0,2,0),Q(2,2,0),Q(2,2,h),Q(0,2,h)],wl);P.poly([Q(2,2,0),Q(2,0,0),Q(2,0,h),Q(2,2,h)],wr);
      for(const t of[0,1,2]){P.line(...Q(t,2,0),...Q(t,2,h),tm);P.line(...Q(2,t,0),...Q(2,t,h),shade(tm,-0.2))}
      P.line(...Q(0,2,1),...Q(2,2,1),tm);P.line(...Q(2,2,1),...Q(2,0,1),shade(tm,-0.2));
      P.line(...Q(0,2,h-1),...Q(2,2,h-1),tm);P.line(...Q(2,2,h-1),...Q(2,0,h-1),shade(tm,-0.2));
      P.poly([Q(.82,2,0),Q(1.18,2,0),Q(1.18,2,12),Q(.82,2,12)],'#4a3020');P.poly([Q(.88,2,0),Q(1.12,2,0),Q(1.12,2,10),Q(.88,2,10)],'#2a1a10');
      const win=(a,b,face)=>{const pts=face==='L'?[Q(a,2,8),Q(b,2,8),Q(b,2,14),Q(a,2,14)]:[Q(2,a,8),Q(2,b,8),Q(2,b,14),Q(2,a,14)];P.poly(pts,'#3a2618');const sh=face==='L'?[Q(a+.04,2,9),Q(b-.04,2,9),Q(b-.04,2,13),Q(a+.04,2,13)]:[Q(2,a+.04,9),Q(2,b-.04,9),Q(2,b-.04,13),Q(2,a+.04,13)];P.poly(sh,'#ffcf6a')};
      win(.28,.58,'L');win(1.42,1.72,'L');win(.7,1.3,'R');
      P.poly([Q(2,0,h),Q(2,2,h),Q(2,1,h+rh)],'#cdb791');P.line(...Q(2,1,h+rh),...Q(2,1,h),tm);
      P.poly([Q(-.18,-.14,h-1),Q(2.18,-.14,h-1),Q(2.18,1,h+rh),Q(-.18,1,h+rh)],shade(roof,-0.35));
      P.poly([Q(-.18,1,h+rh),Q(2.18,1,h+rh),Q(2.18,2.14,h-1),Q(-.18,2.14,h-1)],roof);
      for(let k=1;k<5;k++){const fr=k/5,y=1+1.14*fr,z=h+rh-(rh+1)*fr;P.line(...Q(-.18,y,z),...Q(2.18,y,z),shade(roof,-0.22))}
      for(let k=1;k<9;k++){const t=-.18+k*0.29;P.line(...Q(t,1,h+rh),...Q(t,1.2,h+rh-3),shade(roof,-0.12))}
      P.line(...Q(-.18,1,h+rh),...Q(2.18,1,h+rh),shade(roof,0.3));
      P.line(...Q(2.18,1,h+rh),...Q(2.18,2.14,h-1),shade(roof,-0.4));P.line(...Q(-.18,1,h+rh),...Q(-.18,2.14,h-1),shade(roof,0.12));
      const[cxp,cyp]=Q(1.45,.55,h+rh-1);P.rect(cxp-2,cyp-9,5,10,'#8a5a40');P.rect(cxp-2,cyp-9,5,2,'#4a2e22');P.rect(cxp+2,cyp-7,1,8,'#6a4230');
      if(lv>=2){const[bx,by]=Q(.15,2,h+2);P.rect(bx-1,by-2,4,8,T.color);P.rect(bx-1,by-2,4,1,shade(T.color,.3))}
      if(lv>=3){const[bx,by]=Q(1.85,2,h+2);P.rect(bx-2,by-2,4,8,T.color);P.rect(bx-2,by-2,4,1,shade(T.color,.3))}
    }));
    S.forge=spr(40,48,P=>{
      const ox=20,oy=30,h=15,Q=(x,y,z)=>[ox+(x-y)*16,oy+(x+y)*8-z];
      P.poly([Q(0,1,0),Q(1,1,0),Q(1,1,h),Q(0,1,h)],'#615a55');P.poly([Q(1,1,0),Q(1,0,0),Q(1,0,h),Q(1,1,h)],'#47413d');
      P.poly([Q(-.08,-.08,h),Q(1.08,-.08,h),Q(1.08,1.08,h),Q(-.08,1.08,h)],'#3b3633');P.poly([Q(.05,.05,h+2),Q(.95,.05,h+2),Q(.95,.95,h+2),Q(.05,.95,h+2)],'#4e4844');
      for(const z of[4,8,12])P.line(...Q(0,1,z),...Q(1,1,z),'#544e49');
      P.poly([Q(.3,1,0),Q(.7,1,0),Q(.7,1,9),Q(.3,1,9)],'#2a1810');P.poly([Q(.36,1,0),Q(.64,1,0),Q(.64,1,7),Q(.36,1,7)],'#ff8a2a');P.poly([Q(.42,1,0),Q(.58,1,0),Q(.58,1,4),Q(.42,1,4)],'#ffd36b');
      const[cxp,cyp]=Q(.7,.3,h+2);P.rect(cxp-2,cyp-12,5,12,'#6e6560');P.rect(cxp-2,cyp-12,5,2,'#2a2420');P.rect(cxp+2,cyp-10,1,10,'#4a433f');
      P.rect(...Q(1,1,0).map((v,i)=>v+(i?-6:2)),6,3,'#3a3a40');P.rect(Q(1,1,0)[0]+3,Q(1,1,0)[1]-3,2,3,'#2a2a30');
      P.rect(Q(0,1,h)[0]+3,Q(0,1,h)[1]+1,6,3,T.color);
    });
    teamSprites[ti]=S;
  });
}
/* characters */
const SKINS=['#f1c9a2','#e0aa7d','#c68b5e','#9c6440','#71462a'];
const HAIRS=['#2a1d16','#5e3a1e','#a8742e','#d9c9a4','#8c2c1c','#3b3a52','#e6e2da','#c0562a'];
function makeChar(a,frame){
  const T=TEAMS[a.team],L=a.look,tc=T.color,td=shade(tc,-0.3),tl=shade(tc,0.25);
  const c=spr(22,24,P=>{
    if(a.captain){P.rect(6,10,10,9,T.dark);P.rect(7,18,8,1,shade(T.dark,-0.3))}
    const atk=frame==='atk';
    // legs
    const pants='#3d302a',boot=a.equip.boots>=2?'#8d959c':'#2a1f1c';
    if(frame==='walk'){P.rect(8,16,2,4,pants);P.rect(8,20,2,1,boot);P.rect(12,16,2,5,pants);P.rect(12,21,2,1,boot);P.rect(9,16,4,1,pants)}
    else{P.rect(8,16,2,5,pants);P.rect(8,21,2,1,boot);P.rect(12,16,2,5,pants);P.rect(12,21,2,1,boot)}
    // torso
    P.rect(7,10,8,6,tc);P.rect(7,10,1,6,tl);P.rect(14,10,1,6,td);P.rect(7,15,8,1,'#3b2a1e');P.px(10,15,'#d9b44a');
    if(a.equip.plate>=1){P.rect(8,10,6,3,'#a9b0b6');P.rect(8,10,6,1,'#d3d8dc');P.rect(13,10,1,3,'#7f878e')}
    // arms
    P.rect(6,10,1,5,tc);P.px(6,15,L.skin);
    if(atk){P.rect(15,10,2,1,tc);P.rect(16,10,1,1,L.skin)}else{P.rect(15,10,1,5,td);P.px(15,15,L.skin)}
    // head
    P.rect(10,9,2,1,shade(L.skin,-0.2));
    P.rect(8,3,6,6,L.skin);P.rect(13,3,1,6,shade(L.skin,-0.18));P.px(9,6,'#1a1412');P.px(12,6,'#1a1412');
    if(L.beard)P.rect(9,7,4,2,L.hair);
    const helm=a.equip.plate>=2;
    if(helm){P.rect(8,2,6,3,'#9aa1a7');P.rect(8,2,6,1,'#cfd4d8');P.rect(13,2,1,3,'#6e757b');P.px(10,1,tc);P.px(11,1,tc)}
    else switch(L.style){
      case 0:P.rect(8,2,6,2,L.hair);P.px(8,4,L.hair);P.px(13,4,L.hair);break;
      case 1:P.rect(8,2,6,2,L.hair);P.rect(7,3,1,6,L.hair);P.rect(14,3,1,6,L.hair);P.px(8,4,L.hair);break;
      case 2:P.rect(10,0,2,4,L.hair);P.rect(8,3,6,1,shade(L.hair,-0.2));break;
      case 3:P.rect(8,3,6,1,shade(L.skin,-0.1));P.px(9,3,shade(L.skin,0.3));break;
      case 4:P.rect(7,2,8,2,T.dark);P.rect(7,3,1,7,T.dark);P.rect(14,3,1,7,T.dark);P.rect(8,2,6,1,shade(T.dark,0.2));break;
    }
    // weapon by role
    const wood='#7a5530',steel='#dfe4e8',steel2='#9aa1a7';
    if(a.carry||a.role==='gatherer'){ if(atk){P.rect(15,11,5,1,wood);P.rect(19,9,2,3,steel2)}else{P.rect(16,7,1,8,wood);P.rect(17,7,2,3,steel2);P.px(15,8,steel2)} }
    else if(a.role==='builder'){ if(atk){P.rect(15,11,5,1,wood);P.rect(19,9,2,4,steel2)}else{P.rect(16,8,1,8,wood);P.rect(15,7,3,2,steel2)} }
    else if(a.role==='guard'){P.rect(3,11,3,5,T.dark);P.rect(3,11,3,1,'#c9a85a');P.px(4,13,'#c9a85a');
      if(atk){P.rect(15,11,6,1,wood);P.rect(20,10,2,3,steel)}else{P.rect(16,0,1,17,wood);P.rect(16,0,1,2,steel);P.px(15,1,steel);P.px(17,1,steel)} }
    else if(a.role==='scout'){ if(atk){P.rect(16,7,1,8,wood);P.px(17,6,wood);P.px(17,15,wood);P.rect(15,11,6,1,'#d8d0c0')}else{for(const[x,y]of[[17,6],[17,7],[18,8],[18,9],[18,10],[18,11],[18,12],[17,13],[17,14]])P.px(x,y,wood);P.rect(16,6,1,9,'#d8d0c0')} }
    else { if(atk){P.rect(15,10,6,1,steel);P.px(21,10,steel);P.rect(15,11,1,1,'#9b7b3d')}else{P.rect(16,4,1,9,steel);P.px(16,3,steel);P.rect(15,13,3,1,'#9b7b3d');P.px(16,14,'#5a3a22')}
      if(a.equip.sword>=3&&!atk)P.px(16,6,'#ffe9a8'); }
  });
  return outlineCanvas(c,'#1a1412');
}
function charSprites(a){a.spr={idle:makeChar(a,'idle'),walk:makeChar(a,'walk'),atk:makeChar(a,'atk')}}
function makePortrait(a){
  const T=TEAMS[a.team],L=a.look;
  const fig=spr(24,24,P=>{
    blob(P,[[12,26,10,1.25]],[shade(T.color,-0.35),shade(T.color,-0.15),T.color,shade(T.color,0.2)],{noise:0.4,seed:a.id});
    P.rect(10,14,4,5,shade(L.skin,-0.22));
    blob(P,[[12,10.5,6.3,0.88]],[shade(L.skin,-0.3),shade(L.skin,-0.12),L.skin,shade(L.skin,0.12)],{noise:0.3,seed:a.id+9});
    const hair=L.hair;
    if(a.equip.plate>=2){for(let y=3;y<=8;y++)for(let x=6;x<=18;x++){const dx=(x+.5-12)/6.6,dy=(y+.5-9.5)/6.6;if(dx*dx+dy*dy<=1)P.px(x,y,y===3||y===4?'#cfd4d8':'#9aa1a7')}P.rect(11,3,2,2,T.color)}
    else switch(L.style){
      case 0:for(let y=3;y<=7;y++)for(let x=6;x<=18;x++){const dx=(x+.5-12)/6.6,dy=(y+.5-9.8)/6.8;if(dx*dx+dy*dy<=1)P.px(x,y,hash2(x,y)>0.8?shade(hair,0.2):hair)}break;
      case 1:for(let y=3;y<=17;y++)for(let x=5;x<=19;x++){const dx=(x+.5-12)/7,dy=(y+.5-9.8)/7.2;const inside=dx*dx+dy*dy<=1;if(inside&&(y<=7||x<=7||x>=17))P.px(x,y,hash2(x,y)>0.8?shade(hair,0.2):hair)}break;
      case 2:P.rect(11,1,3,7,hair);P.rect(12,1,1,7,shade(hair,0.25));break;
      case 3:P.px(9,5,shade(L.skin,0.35));P.px(10,5,shade(L.skin,0.35));break;
      case 4:for(let y=2;y<=19;y++)for(let x=3;x<=21;x++){const dx=(x+.5-12)/8.5,dy=(y+.5-11)/9;const o=dx*dx+dy*dy<=1;const fx=(x+.5-12)/5,fy=(y+.5-11.5)/6;const face=fx*fx+fy*fy<=1;if(o&&!face)P.px(x,y,y<6?shade(T.dark,0.15):T.dark)}break;
    }
    P.rect(8,10,3,1,shade(hair,-0.1));P.rect(13,10,3,1,shade(hair,-0.1));
    P.px(9,11,'#1a1412');P.px(14,11,'#1a1412');P.px(10,11,'#f3ead8');P.px(15,11,'#f3ead8');
    P.rect(12,12,1,2,shade(L.skin,-0.25));P.rect(11,15,3,1,'#7a3a2a');
    if(L.beard)for(let y=13;y<=17;y++)for(let x=7;x<=17;x++){const dx=(x+.5-12)/5.2,dy=(y+.5-13)/4.6;if(dx*dx+dy*dy<=1&&!(y===15&&x>=11&&x<=13))P.px(x,y,hair)}
    if(a.captain){P.rect(18,2,4,1,'#e9b04b');P.px(18,1,'#e9b04b');P.px(20,1,'#e9b04b');P.px(21,1,'#e9b04b')}
  });
  outlineCanvas(fig,'#14100e');
  const c=spr(24,24,P=>{P.rect(0,0,24,24,shade(T.dark,-0.35));for(let y=0;y<24;y++)for(let x=0;x<24;x++)if((x+y)%6===0)P.px(x,y,shade(T.dark,-0.15));P.g.drawImage(fig,0,0)});
  a.portraitC=c;a.portrait=c.toDataURL();a.pHelm=a.equip.plate>=2;
}
const monsterSprites={};
function buildMonsters(){
  const sl=(ramp,o,squash,eye)=>spr(16,13,P=>{blob(P,[[8,squash?8.5:7.5,squash?6.8:6,squash?1.45:1.15]],ramp,{outline:o,seed:3});P.px(5,squash?8:7,'#f2f2f2');P.px(10,squash?8:7,eye);P.px(6,squash?8:7,eye);P.px(11,squash?8:7,'#f2f2f2');P.px(5,squash?6:4,'#ffffff')});
  monsterSprites.slime=[sl(['#3b7a2c','#56a33c','#77c552','#a2df78'],'#1f3d18',0,'#14220f'),sl(['#3b7a2c','#56a33c','#77c552','#a2df78'],'#1f3d18',1,'#14220f')];
  monsterSprites.rslime=[sl(['#4a2a86','#6a3fb8','#8f62e0','#b896f2'],'#1e1038',0,'#ffd36b'),sl(['#4a2a86','#6a3fb8','#8f62e0','#b896f2'],'#1e1038',1,'#ffd36b')];
  const wolf=f=>{const c=spr(22,15,P=>{
    const g1='#6c6866',g2='#8c8783',g3='#aaa49e',g0='#4b4846';
    const legs=f?[[6,10],[8,11],[13,11],[15,10]]:[[5,11],[8,10],[13,10],[16,11]];
    for(const[x,y]of legs)P.rect(x,y,2,13-y+(y===10?1:0),g0);
    blob(P,[[10.5,8,5.8,1.7]],[g0,g1,g2,g3],{seed:7});
    blob(P,[[16.5,6,3.4]],[g1,g2,g3],{seed:8});P.rect(18,6,3,2,g2);P.px(20,7,'#2a2826');P.rect(15,2,2,2,g1);P.px(16,2,g3);
    P.rect(2,5,3,2,g1);P.px(1,4,g2);P.px(17,5,'#ff5a3a');
  });return outlineCanvas(c,'#1c1a19')};
  monsterSprites.wolf=[wolf(0),wolf(1)];
  const golem=f=>{const c=spr(26,30,P=>{
    const ramp=['#4f4943','#6a625a','#857b70','#a0958a'];
    P.rect(8,21,4,8-f,'#5a524b');P.rect(14,21,4,7+f,'#5a524b');
    blob(P,[[13,15,8,1.1]],ramp,{seed:31});blob(P,[[4.5,15+f,3.6]],ramp,{seed:32});blob(P,[[21.5,16-f,3.6]],ramp,{seed:33});blob(P,[[13,6,4.6,1.1]],ramp,{seed:34});
    P.rect(10,6,2,1,'#ffae3c');P.rect(15,6,2,1,'#ffae3c');P.rect(12,13,3,3,'#ff8a2a');P.px(13,14,'#ffe08a');
    for(const[x,y]of[[8,9],[9,9],[17,10],[6,13],[19,12],[13,2]])P.px(x,y,'#6d9445');
  });return outlineCanvas(c,'#221e1b')};
  monsterSprites.golem=[golem(0),golem(1)];
  const wraith=f=>{const c=spr(18,24,P=>{
    for(let y=4;y<23;y++){const wv=3+Math.min(5,(y-4)*0.45);for(let x=Math.floor(9-wv);x<=Math.ceil(9+wv);x++){if(y>18&&(x+y+f)%3===0)continue;const d=(x+.5-9)/wv;P.px(x,y,d<-0.4?'#5a4688':d>0.4?'#2a1f45':'#3d2e66')}}
    blob(P,[[9,6,4.6]],['#2a1f45','#3d2e66','#5a4688'],{seed:41});P.rect(7,5,4,4,'#0e0a18');P.px(7,6,'#c9a8ff');P.px(10,6,'#c9a8ff');
  });return outlineCanvas(c,'#120c20')};
  monsterSprites.wraith=[wraith(0),wraith(1)];
}

/* ================= world generation ================= */
function astar(sx,sy,tx,ty,passFn,costFn,limit){
  if(sx===tx&&sy===ty)return[];
  const g=new Float32Array(N).fill(1e9),came=new Int32Array(N).fill(-1),closed=new Uint8Array(N);
  const hf=[],hn=[];const push=(f,n)=>{hf.push(f);hn.push(n);let i=hf.length-1;while(i>0){const p=(i-1)>>1;if(hf[p]<=hf[i])break;[hf[p],hf[i]]=[hf[i],hf[p]];[hn[p],hn[i]]=[hn[i],hn[p]];i=p}};
  const pop=()=>{const n=hn[0];const lf=hf.pop(),ln=hn.pop();if(hf.length){hf[0]=lf;hn[0]=ln;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<hf.length&&hf[l]<hf[m])m=l;if(r<hf.length&&hf[r]<hf[m])m=r;if(m===i)break;[hf[m],hf[i]]=[hf[i],hf[m]];[hn[m],hn[i]]=[hn[i],hn[m]];i=m}}return n};
  const s=sy*MW+sx,t=ty*MW+tx,H=i=>{const dx=Math.abs(i%MW-tx),dy=Math.abs(((i/MW)|0)-ty);return(Math.max(dx,dy)+0.414*Math.min(dx,dy))*0.8};
  g[s]=0;push(H(s),s);let n=0;
  while(hf.length){const c=pop();if(c===t)break;if(closed[c])continue;closed[c]=1;if(++n>limit)return null;
    const cx=c%MW,cy=(c/MW)|0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=MW||ny>=MH)continue;
      if(!passFn(nx,ny))continue;if(dx&&dy&&(!passFn(cx+dx,cy)||!passFn(cx,cy+dy)))continue;
      const ni=ny*MW+nx;if(closed[ni])continue;const ng=g[c]+(dx&&dy?1.414:1)*costFn(nx,ny);if(ng<g[ni]){g[ni]=ng;came[ni]=c;push(ng+H(ni),ni)}}}
  if(came[t]<0)return null;
  const path=[];let c=t;while(c!==s){path.push([c%MW,(c/MW)|0]);c=came[c];if(c<0)return null}
  return path.reverse();
}
function passable(x,y){if(x<0||y<0||x>=MW||y>=MH)return false;const i=y*MW+x;if(block[i])return false;const t=tiles[i];return t!==G.WATER&&t!==G.ROCK}
const walkCost=(x,y)=>tiles[y*MW+x]===G.PATH||tiles[y*MW+x]===G.PLAZA?0.8:1;
function nearestPassable(x,y,r=3){if(passable(x,y))return[x,y];let best=null,bd=1e9;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(passable(x+dx,y+dy)){const d=dx*dx+dy*dy;if(d<bd){bd=d;best=[x+dx,y+dy]}}return best}
function findPath(sx,sy,tx,ty,limit=4000){
  const st=nearestPassable(sx,sy,2),tg=nearestPassable(tx,ty,2);if(!st||!tg)return null;
  const p=astar(st[0],st[1],tg[0],tg[1],passable,walkCost,limit);if(!p)return null;
  if(st[0]!==sx||st[1]!==sy)p.unshift(st);return p;
}

function genWorld(sd){
  R=mulberry32(sd);uidN=1;
  const L=c=>lattice(c,R);
  const e1=L(13),e2=L(6),e3=L(2.6),m1=L(11),m2=L(4.5),k1=L(5),d1=L(4),f1=L(7),f2=L(2.6),p1=L(3.5);
  FN=L(1.3);FN2=L(0.55);
  tiles=new Uint8Array(N);bridge=new Uint8Array(N);block=new Uint8Array(N);forest=new Float32Array(N);wdepth=new Uint8Array(N);
  const spots=[[15,19],[47,16],[33,47]].map(([x,y])=>[x+((R()*5)|0)-2,y+((R()*5)|0)-2]);
  const nearB=(x,y)=>{let n=99;for(const[bx,by]of spots)n=Math.min(n,Math.hypot(x-bx,y-by));return n};
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
    const i=y*MW+x;let e=0.55*e1(x,y)+0.3*e2(x,y)+0.15*e3(x,y);
    const dc=Math.max(Math.abs(x-31.5),Math.abs(y-31.5))/32,dr=Math.hypot(x-31.5,y-31.5)/32;
    e=e+0.1-smooth(0.6,1.0,0.5*dc+0.5*dr)*0.8;
    const m=0.65*m1(x,y)+0.35*m2(x,y);
    let t=G.GRASS;
    if(e<0.3)t=G.WATER;else if(k1(x,y)>0.72&&e>0.42)t=G.ROCK;else if(m<0.33)t=G.SAND;else if(d1(x,y)>0.72)t=G.DIRT;
    const nb=nearB(x,y);if(nb<8.5&&(t===G.WATER||t===G.ROCK))t=nb<7?G.GRASS:t===G.ROCK?G.GRASS:t;if(nb<5.5)t=G.PLAZA;
    tiles[i]=t;forest[i]=0.6*f1(x,y)+0.4*f2(x,y)+(m-0.5)*0.3;
  }
  // rivers
  for(let r=0;r<2;r++){
    let x=20+R()*24,y=20+R()*24,a=R()*6.28;
    for(let s=0;s<90;s++){
      const ix=x|0,iy=y|0;if(ix<1||iy<1||ix>=MW-1||iy>=MH-1)break;
      if(nearB(ix,iy)>8){tiles[iy*MW+ix]=G.WATER;if(s%3)tiles[iy*MW+Math.min(MW-1,ix+1)]=G.WATER}
      a+=(p1(x,y)-0.5)*0.9;x+=Math.cos(a)*0.8;y+=Math.sin(a)*0.8;
      if(s>12&&tiles[iy*MW+ix]===G.WATER&&wDist(ix,iy)>3)break;
    }
  }
  function wDist(x,y){let c=0;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<MW&&Y<MH&&tiles[Y*MW+X]===G.WATER)c++}return c>40?4:0}
  // beaches
  const t2=tiles.slice();
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const i=y*MW+x;if(t2[i]!==G.GRASS&&t2[i]!==G.DIRT)continue;let w=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<MW&&Y<MH&&t2[Y*MW+X]===G.WATER)w++}if(w>=2&&forest[i]<0.6)tiles[i]=G.SAND}
  // bases
  bases=spots.map(([cx,cy],i)=>({i,...TEAMS[i],cx,cy,res:{wood:30,stone:30,food:30},captures:0,forge:1,hall:1,towers:[],slots:[[cx-3,cy+3],[cx+3,cy-3],[cx+3,cy+3],[cx-3,cy-3]],project:null,capT:R()*2,plan:'',target:(i+1)%3,allies:new Set(),need:'wood',
    flag:{team:i,hx:cx+1.5,hy:cy+1.5,x:cx+1.5,y:cy+1.5,carrier:null,dropped:false,dropT:0},gates:[[cx,cy+5],[cx+5,cy],[cx,cy-5],[cx-5,cy]]}));
  // paths: each base to hub
  const hub=[Math.round(spots.reduce((s,p)=>s+p[0],0)/3),Math.round(spots.reduce((s,p)=>s+p[1],0)/3)];
  const genPass=(x,y)=>true,genCost=(x,y)=>{const t=tiles[y*MW+x];return t===G.WATER?6:t===G.ROCK?9:t===G.PATH?0.5:1};
  for(const b of bases){
    const g=b.gates.slice().sort((p,q)=>Math.hypot(p[0]-hub[0],p[1]-hub[1])-Math.hypot(q[0]-hub[0],q[1]-hub[1]))[0];
    const p=astar(g[0],g[1],hub[0],hub[1],genPass,genCost,20000)||[];
    for(const[x,y]of p.concat([g])){const i=y*MW+x;if(tiles[i]===G.PLAZA)continue;if(tiles[i]===G.WATER)bridge[i]=1;tiles[i]=G.PATH}
  }
  // water depth
  const q=[];for(let i=0;i<N;i++){if(tiles[i]!==G.WATER){wdepth[i]=0}else wdepth[i]=9}
  for(let i=0;i<N;i++)if(tiles[i]===G.WATER){const x=i%MW,y=(i/MW)|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<MW&&Y<MH&&tiles[Y*MW+X]!==G.WATER){wdepth[i]=1;q.push(i);break}}}
  for(let h=0;h<q.length;h++){const i=q[h],x=i%MW,y=(i/MW)|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=MW||Y>=MH)continue;const j=Y*MW+X;if(tiles[j]===G.WATER&&wdepth[j]>wdepth[i]+1){wdepth[j]=wdepth[i]+1;q.push(j)}}}

  // statics
  statics=[];resources=[];
  const addStatic=(o)=>{statics.push(o);return o};
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(tiles[y*MW+x]===G.ROCK)addStatic({c:SP.cliff[(hash2(x,y)*4)|0],dx:isoX(x,y)-17,dy:isoY(x,y)-12,key:x+y+1,w:34,h:31});
  for(const b of bases){
    const{cx,cy}=b;
    for(let y=cy-6;y<=cy+6;y++)for(let x=cx-6;x<=cx+6;x++){
      const d=Math.hypot(x-cx,y-cy);if(d<4.5||d>=5.5)continue;if(Math.abs(x-cx)<=1||Math.abs(y-cy)<=1)continue;
      block[y*MW+x]=1;addStatic({c:SP.wall,dx:isoX(x,y)-17,dy:isoY(x,y)-11,key:x+y+1,w:34,h:28});
    }
    for(const[x,y]of[[cx-2,cy-2],[cx-1,cy-2],[cx-2,cy-1],[cx-1,cy-1],[cx+2,cy-2]])block[y*MW+x]=1;
    b.hallObj=addStatic({team:b.i,kind:'hall',dx:isoX(cx-2,cy-2)-40,dy:isoY(cx-2,cy-2)-36,key:cx-1+cy-1+0.6,w:80,h:72,get c(){return teamSprites[b.i].hall[b.hall-1]}});
    addStatic({c:teamSprites[b.i].forge,dx:isoX(cx+2,cy-2)-20,dy:isoY(cx+2,cy-2)-30,key:cx+2+cy-2+1,w:40,h:48});
    b.depot=[cx-0.5,cy+0.5];b.forgeSpot=[cx+2.5,cy-0.4];b.restSpot=[cx+0.5,cy+0.8];
    for(const[gx,gy]of b.gates){const sx=gx+(gx===cx?2:(gx>cx?1:-1)),sy=gy+(gy===cy?2:(gy>cy?1:-1));if(!passable(sx,sy))continue;addStatic({c:SP.lamp,dx:isoX(sx+.5,sy+.5)-4,dy:isoY(sx+.5,sy+.5)-20,key:sx+sy+1,w:8,h:22,light:[sx+.5,sy+.5,22]})}
  }
  // vegetation and resources
  const nearAnyBase=(x,y)=>{let n=99;for(const b of bases)n=Math.min(n,Math.hypot(x-b.cx,y-b.cy));return n};
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){
    const i=y*MW+x,t=tiles[i],h=hash2(x*7+sd%997,y*13),nb=nearAnyBase(x,y);
    if(nb<6.5||t===G.PATH||t===G.WATER||t===G.ROCK||t===G.PLAZA)continue;
    const jx=(hash2(x,y*3)-0.5)*0.5,jy=(hash2(x*5,y)-0.5)*0.5;
    if(t===G.GRASS||t===G.DIRT){
      const dense=forest[i]>0.6&&t===G.GRASS;
      if((dense&&h<0.78)||h<0.045){const pine=forest[i]>0.66?hash2(x,y+9)<0.7:hash2(x,y+9)<0.3;addRes('tree',x+.5+jx,y+.5+jy,pine?'pine':'round');continue}
      if(h>0.975)addRes('rock',x+.5,y+.5);else if(h>0.95&&t===G.GRASS)addRes('bush',x+.5+jx,y+.5+jy);
    }else if(t===G.SAND){if(h<0.06)addStatic({c:SP.cactus[(h*100|0)%2].c,dx:isoX(x+.5,y+.5)-6,dy:isoY(x+.5,y+.5)-17,key:x+y+1,w:13,h:19});else if(h>0.97)addRes('rock',x+.5,y+.5)}
  }
  for(const b of bases){
    let rocks=0,bushes=0,tries=0;
    while((rocks<6||bushes<4)&&tries++<400){const a=R()*6.28,d=7+R()*5,x=(b.cx+Math.cos(a)*d)|0,y=(b.cy+Math.sin(a)*d)|0;if(!passable(x,y)||tiles[y*MW+x]===G.PATH||tiles[y*MW+x]===G.PLAZA)continue;if(resources.some(r=>(r.x|0)===x&&(r.y|0)===y))continue;
      if(rocks<6){addRes('rock',x+.5,y+.5);rocks++}else{addRes('bush',x+.5,y+.5);bushes++}}
  }
  function addRes(kind,x,y,var_){
    const r={uid:uidN++,kind,x,y,claim:null,regrow:0,bad:0};
    if(kind==='tree'){r.type='wood';r.max=r.amt=30;r.full=var_==='pine'?pick(SP.pine):pick(SP.round);r.empty=SP.stump}
    else if(kind==='rock'){r.type='stone';r.max=r.amt=45;r.full=pick(SP.boulder);r.empty=null}
    else{r.type='food';r.max=r.amt=24;r.full=SP.bush[1];r.empty=SP.bush[0]}
    r.key=x+y;Object.defineProperty(r,'cur',{get(){return r.amt>0?r.full:r.empty}});
    resources.push(r);statics.push(r);
  }
  sparkles=[];for(let k=0;k<700;k++){const x=(R()*MW)|0,y=(R()*MH)|0;if(tiles[y*MW+x]===G.WATER&&!bridge[y*MW+x])sparkles.push([isoX(x+R(),y+R()),isoY(x+R(),y+R()),R()*6.28])}
}

/* ================= terrain rendering ================= */
function renderTerrain(){
  const c=document.createElement('canvas');c.width=WORLD_W;c.height=WORLD_H;const g=c.getContext('2d');
  const img=g.createImageData(WORLD_W,WORLD_H),d=img.data;
  const GR=[[57,96,43],[68,112,47],[82,128,53],[96,144,59],[112,158,66],[128,170,74]];
  const DI=[[128,80,46],[146,94,54],[163,108,62],[180,123,73]];
  const SA=[[204,168,110],[216,182,124],[226,196,140],[234,208,156]];
  const PL=[[146,141,134],[160,155,147],[134,129,123],[170,165,156]];
  const tAt=(fx,fy)=>{const x=Math.floor(fx),y=Math.floor(fy);if(x<0||y<0||x>=MW||y>=MH)return G.WATER;return tiles[y*MW+x]};
  const fAt=(fx,fy)=>{const x=clamp(fx-0.5,0,MW-1.001),y=clamp(fy-0.5,0,MH-1.001),ix=x|0,iy=y|0,u=x-ix,v=y-iy,i=iy*MW+ix,a=forest[i],b=forest[Math.min(N-1,i+1)],cc=forest[Math.min(N-1,i+MW)],dd=forest[Math.min(N-1,i+MW+1)];return a+(b-a)*u+(cc-a)*v+(a-b-cc+dd)*u*v};
  for(let py=0;py<WORLD_H;py+=2)for(let px=0;px<WORLD_W;px+=2){
    const u=(px+1-OX)/16,v=(py+1-OY)/8,fx=(v+u)/2,fy=(v-u)/2;
    const h=hash2(px,py),h2=hash2(py+71,px+13);
    let col;
    const inMap=fx>=0&&fy>=0&&fx<MW&&fy<MH;
    const jx=(h-0.5)*0.42,jy=(h2-0.5)*0.42;
    const t=inMap?tAt(fx+jx,fy+jy):G.WATER;
    const ti=inMap?Math.floor(fy)*MW+Math.floor(fx):-1;
    if(t===G.WATER||(t===G.PATH&&inMap&&bridge[Math.floor(fy+jy)*MW+Math.floor(fx+jx)]&&false)){
      const dep=inMap?wdepth[Math.floor(clamp(fy+jy,0,MH-1))*MW+Math.floor(clamp(fx+jx,0,MW-1))]:9;
      col=dep<=1?[76,150,188]:dep===2?[62,132,174]:dep<=4?[50,112,156]:[34,84,128];
      if(!inMap)col=[30,74,114];
      const wave=Math.sin(fx*2.1+fy*1.3+h*0.6);if(wave>0.93&&h>0.5)col=col.map(v=>v+26);
      if(inMap&&(tAt(fx+0.22,fy)!==G.WATER||tAt(fx-0.22,fy)!==G.WATER||tAt(fx,fy+0.22)!==G.WATER||tAt(fx,fy-0.22)!==G.WATER)){const br=tAt(fx+0.22,fy)===G.PATH||tAt(fx,fy+0.22)===G.PATH;if(!br)col=[156,206,222]}
    }else if(t===G.PATH&&inMap&&bridge[ti]){
      const lx=fx-Math.floor(fx),ly=fy-Math.floor(fy);const along=(Math.floor((lx+ly)*5))%2;col=along?[148,104,64]:[126,86,52];if(lx<0.08||ly<0.08||lx>0.92||ly>0.92)col=[92,62,38];
    }else if(t===G.GRASS){
      const f=fAt(fx,fy);let k=FN(fx,fy)*0.75+FN2(fx,fy)*0.35+(h-0.5)*0.35-clamp(f-0.45,0,0.5)*0.9;col=GR[clamp(Math.floor(k*5),0,5)];
      if(h>0.996)col=[[230,120,150],[240,232,206],[238,200,84],[160,140,220]][(h2*4)|0];else if(h<0.015)col=[44,78,35];
    }else if(t===G.DIRT||t===G.PATH){
      let k=FN(fx+9,fy)*0.7+(h-0.5)*0.5+(t===G.PATH?0.25:0);col=DI[clamp(Math.floor(k*4),0,3)];if(h>0.988)col=[118,108,100];
    }else if(t===G.SAND){
      let k=FN(fx,fy+7)*0.7+(h-0.5)*0.4;col=SA[clamp(Math.floor(k*4),0,3)];if(h>0.99)col=[150,128,96];
    }else if(t===G.ROCK){col=[92,86,82];
    }else{ // plaza
      const lx=fx-Math.floor(fx),ly=fy-Math.floor(fy);const tile=hash2(Math.floor(fx)*3,Math.floor(fy)*5);
      col=PL[(tile*4)|0].slice();if(h>0.7)col=col.map(v=>v-6);
      if(lx<0.07||ly<0.07)col=[100,96,91];
      let nd=99;for(const b of bases)nd=Math.min(nd,Math.hypot(fx-(b.cx+.5),fy-(b.cy+.5)));if(nd>5.2)col=[112,106,99];
    }
    const o=(py*WORLD_W+px)*4;const r=col[0]|0,gg=col[1]|0,bb=col[2]|0;
    for(const off of[0,4,WORLD_W*4,WORLD_W*4+4]){d[o+off]=r;d[o+off+1]=gg;d[o+off+2]=bb;d[o+off+3]=255}
  }
  g.putImageData(img,0,0);
  return c;
}

/* ================= agents ================= */
const SYL=['be','it','ul','ont','ax','ene','si','ick','ob','lch','xe','ep','fe','hyr','den','sus','qu','del','ish','el','ra','vo','mir','ka','zu','ta','ny','or','vek','sa','lo','ri','go','an','ek','th','ma','ru','ilk','dra','ven','oth','pa','yr'];
function genName(used){for(let k=0;k<50;k++){let n=pick(SYL)+pick(SYL);if(R()<0.25)n+=pick(SYL);n=n.slice(0,7);if(n.length<4)continue;n=n[0].toUpperCase()+n.slice(1);if(!used.has(n)){used.add(n);return n}}return 'Agent'+used.size}
const ti=v=>Math.round(clamp(v,0,100));
function newGoal(prev){let g;do{g=pick(GOALS)}while(g.k===prev);return{...g,p:0}}
function makeAgent(team,used){
  const b=bases[team];const p=nearestPassable((b.cx+R()*4-2)|0,(b.cy+R()*3+1)|0,3);
  const temp={aggr:ti(15+R()*80),greed:ti(10+R()*80),caution:ti(10+R()*80),pride:ti(10+R()*85),loyalty:ti(20+R()*80)};
  const a={id:agents.length,isAgent:true,kind:'agent',team,name:genName(used),x:p[0]+.5,y:p[1]+.5,hp:90,maxHp:90,lvl:1,xp:0,px:20,pxEarned:0,kills:0,mkills:0,duels:0,deaths:0,
    equip:{sword:1,plate:0,boots:0},tonics:1,temp,temp0:{...temp},rep:{bravery:ti(10+R()*20),generosity:ti(10+R()*20),teamwork:ti(10+R()*20)},
    look:{skin:pick(SKINS),hair:pick(HAIRS),style:(R()*5)|0,beard:R()<0.3},
    role:'gatherer',task:null,path:null,pathKey:'',pathT:0,thinkT:R()*1.5,cd:0,atkT:0,walkT:0,moving:false,facing:R()<.5?1:-1,
    carry:null,flag:null,dead:false,respawnT:0,combatT:0,
    fear:{slime:0,wolf:0,golem:0,wraith:0},dmgFrom:{slime:0,wolf:0,golem:0,wraith:0},lessons:[],grudges:new Map(),friends:new Map(),avenge:new Set(),
    heard:[],bubble:null,mind:{choice:'look around',conf:1,also:[],why:'Just arrived.'},
    goal:newGoal(),goalsDone:0,life:[],quote:'',ds:{kills:0,died:false,robbed:false,delivered:0,px:0},captain:false};
  return a;
}
function lifeLog(a,icon,text){a.life.unshift({d:day,i:icon,t:text});if(a.life.length>50)a.life.pop()}
function clock(){const t=(time%DAY)/DAY,hm=(6+t*24)%24,h=Math.floor(hm),m=Math.floor((hm-h)*60);return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
function phase(){const t=(time%DAY)/DAY;return t<0.07?'Dawn':t<0.68?'Day':t<0.8?'Dusk':'Night'}
function isNight(){const t=(time%DAY)/DAY;return t>=0.8||t<0.03}
function darkness(){const t=(time%DAY)/DAY;if(t<0.07)return 0.42*(1-t/0.07);if(t<0.68)return 0;if(t<0.8)return 0.46*(t-0.68)/0.12;return 0.46}
let feedN=0;function feedPush(text,cls=''){feedN++;feed.push({t:`D${day} ${clock()}`,text,cls});if(feed.length>80)feed.shift()}
function setHeadline(tag,text){headline={tag,text,t:time}}
function say(a,text){a.bubble={text,t:3.2};for(const o of agents){if(o===a||o.dead)continue;if(Math.hypot(o.x-a.x,o.y-a.y)<9){o.heard.unshift({who:a.name,team:a.team,text});if(o.heard.length>3)o.heard.pop()}}}
function earn(a,n){a.px+=n;a.pxEarned+=n;a.ds.px+=n;progress(a,'pxearn',n)}
function progress(a,k,n=1){if(a.goal.k!==k)return;a.goal.p+=n;if(a.goal.p>=a.goal.n){a.goalsDone++;lifeLog(a,'★',`Fulfilled a life goal: ${a.goal.t}`);feedPush(`${a.name} fulfilled a life goal: ${a.goal.t.toLowerCase()}.`,'c-gold');a.goal=newGoal(a.goal.k);earn(a,25)}}
function bump(obj,k,n){obj[k]=clamp(obj[k]+n,0,100)}
function gainXP(a,n){a.xp+=n;while(a.xp>=30+a.lvl*20){a.xp-=30+a.lvl*20;a.lvl++;a.maxHp+=8;a.hp=a.maxHp;floater(a,'LEVEL UP','#e9b04b');if(a.lvl%3===0)feedPush(`${a.name} reached level ${a.lvl}.`)}}
function floater(e,text,color){floaters.push({x:e.x,y:e.y,text:String(text),color,t:0})}
function allied(t1,t2){return t1===t2||bases[t1].allies.has(t2)}
function teamOf(e){return e.isAgent?e.team:e.kind==='tower'?e.team:-1}

/* ================= decisions ================= */
const D=(a,k)=>a.temp[k]/100;
function nearestMonster(a,r){let best=null,bd=r;for(const m of monsters){if(m.dead)continue;const d=Math.hypot(m.x-a.x,m.y-a.y);if(d<bd){bd=d;best=m}}return best}
function nearestEnemy(a,r,pred){let best=null,bd=r;for(const o of agents){if(o.dead||allied(o.team,a.team))continue;if(pred&&!pred(o))continue;const d=Math.hypot(o.x-a.x,o.y-a.y);if(d<bd){bd=d;best=o}}return best}
function findResource(a,type){
  let best=null,bd=1e9;for(const r of resources){if(r.type!==type||r.amt<=0||(r.claim&&r.claim!==a)||r.bad>time)continue;const d=Math.hypot(r.x-a.x,r.y-a.y)+Math.hypot(r.x-bases[a.team].cx,r.y-bases[a.team].cy)*0.6;if(d<bd){bd=d;best=r}}return best}
function shopItem(a){
  const cap=bases[a.team].forge+1;const cost=l=>Math.round(40*Math.pow(l+1,1.5));
  const items=[];if(a.equip.sword<cap+1)items.push({k:'sword',c:cost(a.equip.sword),w:0.5+D(a,'aggr')});if(a.equip.plate<cap)items.push({k:'plate',c:cost(a.equip.plate+1),w:0.5+D(a,'caution')});if(a.equip.boots<cap)items.push({k:'boots',c:cost(a.equip.boots+1),w:0.4+D(a,'greed')*0.3});
  if(a.tonics<2)items.push({k:'tonic',c:18,w:0.6+D(a,'caution')*0.5});
  const ok=items.filter(i=>i.c<=a.px);if(!ok.length)return null;ok.sort((p,q)=>q.w/q.c-p.w/p.c);return ok[0];
}
function think(a){
  const b=bases[a.team],hpF=a.hp/a.maxHp,opts=[],night=isNight();
  const add=(o)=>{if(o.s>0)opts.push(o)};
  if(a.flag){add({type:'carry',label:`run ${bases[a.flag.i].name}'s flag home`,s:6,why:'I have their flag. Every second counts.'})}
  // own flag recovery
  const of=b.flag;
  if(!a.flag){
    if(of.carrier&&!of.carrier.dead){const d=Math.hypot(of.carrier.x-a.x,of.carrier.y-a.y);if(d<16)add({type:'duel',tgt:of.carrier,label:`chase ${of.carrier.name} and our flag`,s:(1.4+D(a,'loyalty'))*(1-d/22),why:`${of.carrier.name} is running off with our flag.`})}
    const mc=agents.find(o=>o!==a&&!o.dead&&o.team===a.team&&o.flag);
    if(mc&&Math.hypot(mc.x-a.x,mc.y-a.y)<14){const thr=nearestEnemy(mc,6);add(thr?{type:'duel',tgt:thr,label:`cover ${mc.name} from ${thr.name}`,s:1.7+D(a,'loyalty')*0.6,why:`${mc.name} carries a flag and ${thr.name} is closing in.`}:{type:'escort',tgt:mc,label:`escort ${mc.name} home`,s:1.2+D(a,'loyalty')*0.5,why:`${mc.name} has the flag. Stay close.`})}
    else if(of.dropped){const d=Math.hypot(of.x-a.x,of.y-a.y);if(d<22)add({type:'recover',label:'recover our dropped flag',s:2.2+D(a,'loyalty'),why:'Our flag is lying in the dirt.'})}
    for(const eb of bases){if(eb===b||allied(eb.i,a.team))continue;const f=eb.flag;if(f.dropped&&Math.hypot(f.x-a.x,f.y-a.y)<12)add({type:'raid',tgt:eb,label:`grab ${eb.name}'s dropped flag`,s:2.0+D(a,'pride')*0.5,why:'Their flag is loose. Nobody is holding it.'})}
  }
  // role work
  const need=b.need;
  if(a.role==='gatherer'||a.role==='builder'&&!b.project){const r=findResource(a,need);if(r)add({type:'gather',res:r,label:`gather ${need}`,s:0.55+D(a,'greed')*0.3,why:`Captain wants ${need}. ${b.name} has ${Math.round(b.res[need])} in store.`})}
  if(a.role==='builder'&&b.project)add({type:'build',label:`build the ${b.project.name}`,s:0.85,why:`The ${b.project.name} is ${Math.round(b.project.prog/b.project.work*100)}% done.`});
  if(a.role==='guard')add({type:'guard',label:`guard ${b.name}`,s:0.5+D(a,'caution')*0.3+D(a,'loyalty')*0.2,why:`Captain posted me at the walls. Caution ${a.temp.caution}.`});
  if(a.role==='raider'){const tb=bases[b.target];if(tb&&!allied(tb.i,a.team)&&!tb.flag.carrier)add({type:'raid',tgt:tb,label:`raid ${tb.name}`,s:(0.6+D(a,'aggr')*0.3+D(a,'pride')*0.2)*Math.max(0.3,hpF),why:`Captain sent me at ${tb.name}. ${guardsAt(tb)} guard${guardsAt(tb)===1?'':'s'} on their walls.`})}
  if(a.role==='scout'){if(rift&&Math.hypot(rift.x-a.x,rift.y-a.y)<30)add({type:'rift',label:'seal the rift',s:0.7+D(a,'aggr')*0.3,why:'A rift is open. It keeps spawning monsters.'});else add({type:'explore',label:'scout the wilds',s:0.6,why:'Someone has to know what is out there.'})}
  // fights
  const m=nearestMonster(a,a.role==='scout'?10:8);
  if(m){const fear=a.fear[m.type];let s=(0.22+D(a,'aggr')*0.4+D(a,'greed')*0.25)*hpF*(1-fear*0.8);if(m.type==='golem')s*=a.lvl>=4?1.1:0.45;if(Math.hypot(m.x-b.cx,m.y-b.cy)<8)s+=0.3*D(a,'loyalty')+0.2;
    add({type:'hunt',tgt:m,label:`hunt the ${MT[m.type].label}`,s,why:fear>0.3?`I fear ${MT[m.type].label}S, but it is close.`:`Aggression ${a.temp.aggr}, greed ${a.temp.greed}. Monsters drop PX.`})}
  const e=nearestEnemy(a,8);
  if(e){const gr=a.grudges.get(e.id)||0;let s=(0.18+D(a,'aggr')*0.45+D(a,'pride')*0.2+Math.min(0.6,gr*0.15))*hpF*(a.lvl>=e.lvl-1?1:0.6);if(e.flag)s+=1.5;
    add({type:'duel',tgt:e,label:gr?`settle the score with ${e.name}`:`duel ${e.name}`,s,why:gr?`${e.name} is on my grudge list.`:`${e.name} of ${bases[e.team].name} is in reach. Pride ${a.temp.pride}.`})}
  const intr=nearestEnemy({x:b.cx,y:b.cy,team:a.team},9);
  if(intr&&Math.hypot(a.x-b.cx,a.y-b.cy)<20)add({type:'duel',tgt:intr,label:`defend ${b.name} from ${intr.name}`,s:(0.45+D(a,'loyalty')*0.55)*(a.role==='guard'?1.6:1)*Math.max(0.4,hpF),why:`${intr.name} is inside our walls.`,defend:true});
  for(const o of agents){if(o===a||o.dead||o.team!==a.team||o.combatT<=0||o.hp>o.maxHp*0.55)continue;const d=Math.hypot(o.x-a.x,o.y-a.y);if(d>10)continue;const att=o.lastHitBy;if(att&&!att.dead&&att.hp>0&&(att.kind==='monster'||att.isAgent)){add({type:att.isAgent?'duel':'hunt',tgt:att,label:`help ${o.name}`,s:0.3+D(a,'loyalty')*0.7,why:`${o.name} is hurt and fighting. Loyalty ${a.temp.loyalty}.`,help:o});break}}
  if(rift&&a.role!=='scout'){const d=Math.hypot(rift.x-a.x,rift.y-a.y);if(d<14)add({type:'rift',label:'seal the rift',s:0.25+D(a,'aggr')*0.45*hpF,why:'The rift is close. Sealing it pays well.'})}
  add({type:'rest',label:'rest at the hall',s:(1-hpF)*(0.6+D(a,'caution')*0.9)+(night?(1-D(a,'aggr'))*0.25:0)+0.02,why:`Health ${Math.round(a.hp)}/${a.maxHp}. Caution ${a.temp.caution} says heal first.`});
  const it=shopItem(a);if(it)add({type:'shop',item:it,label:`buy ${it.k==='tonic'?'a tonic':'better '+it.k}`,s:0.42+D(a,'greed')*0.15,why:`I have ${a.px} PX. A ${it.k} costs ${it.c}.`});
  if(!opts.length)add({type:'guard',label:`guard ${b.name}`,s:0.2,why:'Nothing better to do.'});
  // stickiness
  const curKey=a.task?taskKey(a.task):'';
  for(const o of opts)if(taskKey(o)===curKey)o.s+=0.18;
  const tot=opts.reduce((s,o)=>s+o.s*o.s,0);for(const o of opts)o.p=o.s*o.s/tot;
  opts.sort((p,q)=>q.p-p.p);
  const best=opts[0];
  a.mind={choice:best.label,conf:best.p,also:opts.slice(1,4).map(o=>({label:o.label,p:o.p})),why:best.why};
  if(taskKey(best)!==curKey){
    if(a.task&&a.task.res&&a.task.res.claim===a)a.task.res.claim=null;
    a.task={...best,phase:null,timer:0};a.path=null;
    if(best.res)best.res.claim=a;
    if(best.help){bump(a.rep,'teamwork',2);progress(a,'help');lifeLog(a,'✚',`Came to the aid of ${best.help.name}`);say(a,'On my way!');best.help.friends.set(a.id,(best.help.friends.get(a.id)||0)+1);a.friends.set(best.help.id,(a.friends.get(best.help.id)||0)+1)}
    if(best.type==='duel'&&!best.defend&&R()<0.5)say(a,pick([`${best.tgt.name}! Face me.`,'Here we go.','You picked the wrong path.']));
  }
}
const taskKey=t=>t.type+':'+(t.tgt?(t.tgt.uid??(t.tgt.isAgent?'a'+t.tgt.id:'b'+t.tgt.i)):t.res?t.res.uid:'');
function guardsAt(b){return agents.filter(a=>a.team===b.i&&!a.dead&&a.role==='guard').length}

/* ================= task execution ================= */
function speedOf(e){if(e.isAgent)return(2.1+0.15*e.equip.boots)*(e.carry?0.85:1)*(e.flag?1.15:1);return MT[e.type].spd}
function stepToward(e,px,py,dt){const dx=px-e.x,dy=py-e.y,d=Math.hypot(dx,dy),sp=speedOf(e)*dt;e.moving=true;if(Math.abs(dx-dy)>0.02)e.facing=(dx-dy)>0?1:-1;if(d<=sp){e.x=px;e.y=py;return true}e.x+=dx/d*sp;e.y+=dy/d*sp;return false}
function goTo(e,gx,gy,dt,near=0.45,repath=0){
  const d=Math.hypot(gx-e.x,gy-e.y);if(d<=near){e.path=null;return true}
  const tx=Math.floor(gx),ty=Math.floor(gy),key=tx+','+ty;e.pathT-=dt;
  if(!e.path||e.pathKey!==key||(repath&&e.pathT<=0)){e.path=findPath(Math.floor(e.x),Math.floor(e.y),tx,ty,e.isAgent?4000:600);e.pathKey=key;e.pathT=repath;
    if(!e.path){if(e.isAgent){if(e.task&&e.task.res){e.task.res.bad=time+40;e.task.res.claim=null}e.task=null}else{e.wt=0;e.target=null}return false}}
  if(!e.path.length){stepToward(e,gx,gy,dt);return false}
  const[nx,ny]=e.path[0];
  if(stepToward(e,nx+.5,ny+.5,dt))e.path.shift();
  return false;
}
function engage(a,tg,dt){
  if(!tg||tg.dead||tg.hp<=0){a.task=null;return}
  const d=Math.hypot(tg.x-a.x,tg.y-a.y);if(d>16){a.task=null;return}
  const reach=tg.kind==='rift'?1.4:1.05;
  if(d>reach){goTo(a,tg.x,tg.y,dt,reach*0.95,0.6);return}
  a.facing=((tg.x-a.x)-(tg.y-a.y))>=0?1:-1;a.combatT=3;
  if(a.cd<=0){a.cd=0.85-a.equip.boots*0.03;a.atkT=0.22;hurt(tg,(6+a.equip.sword*3+a.lvl*0.8)*(0.8+R()*0.4),a)}
}
function runTask(a,dt){
  const t=a.task;if(!t)return;const b=bases[a.team];
  switch(t.type){
    case'gather':{const r=t.res;
      if(!t.phase)t.phase=a.carry?'home':'go';
      if(t.phase==='go'){if(r.amt<=0){r.claim=null;a.task=null;return}if(goTo(a,r.x,r.y,dt,0.55)){t.phase='work';t.timer=2.4}}
      else if(t.phase==='work'){if(a.cd<=0){a.cd=0.6;a.atkT=0.25}t.timer-=dt;if(t.timer<=0){const take=Math.min(10+a.lvl,r.amt);r.amt-=take;if(r.amt<=0)r.regrow=r.type==='stone'?110:r.type==='wood'?80:45;r.claim=null;a.carry={type:r.type,amt:take};charSprites(a);t.phase='home'}}
      else if(goTo(a,b.depot[0],b.depot[1],dt,0.8)){b.res[a.carry.type]+=a.carry.amt;earn(a,2);gainXP(a,2);a.ds.delivered+=a.carry.amt;progress(a,'deliver',a.carry.amt);bump(a.rep,'generosity',0.4);a.carry=null;charSprites(a);a.task=null}
      break}
    case'build':{const p=b.project;if(!p){a.task=null;return}
      if(goTo(a,p.x+.5,p.y+.5,dt,1.1)){a.facing=((p.x+.5-a.x)-(p.y+.5-a.y))>=0?1:-1;if(a.cd<=0){a.cd=0.55;a.atkT=0.25}p.prog+=dt;p.builders.add(a);if(p.prog>=p.work)completeProject(b)}
      break}
    case'guard':{if(!t.tile||goTo(a,t.tile[0],t.tile[1],dt,0.4)){t.wait=(t.wait||0)-dt;if(!t.tile||t.wait<=0){const ang=R()*6.28,rr=1.5+R()*2.6;const p=nearestPassable((b.cx+Math.cos(ang)*rr)|0,(b.cy+Math.sin(ang)*rr)|0,2);t.tile=p?[p[0]+.5,p[1]+.5]:[b.cx+.5,b.cy+1.5];t.wait=1.5+R()*3}}break}
    case'raid':{const tb=t.tgt,f=tb.flag;if(f.carrier){a.task=null;return}
      if(!t.phase){t.phase=f.dropped?'rush':'stage';t.timer=0;const g=tb.gates.slice().sort((p,q)=>Math.hypot(p[0]-a.x,p[1]-a.y)-Math.hypot(q[0]-a.x,q[1]-a.y))[0];const ox=Math.sign(g[0]-tb.cx),oy=Math.sign(g[1]-tb.cy);const st=nearestPassable(g[0]+ox*5,g[1]+oy*5,3)||g;t.stage=[st[0]+.5,st[1]+.5]}
      if(t.phase==='stage'){if(goTo(a,t.stage[0],t.stage[1],dt,1.2)){t.timer+=dt;const mates=agents.filter(o=>o!==a&&!o.dead&&o.team===a.team&&Math.hypot(o.x-a.x,o.y-a.y)<4).length;const dark=isNight();
          if(mates>=1||t.timer>(dark?6:16)){t.phase='rush';say(a,mates?'Together, now!':dark?'Under cover of dark.':'Going in alone.')}}break}
      if(goTo(a,f.x,f.y,dt,0.6,1.5)){f.carrier=a;f.dropped=false;a.flag=tb;a.task=null;say(a,`I have ${tb.name}'s flag!`);lifeLog(a,'⚑',`Took ${tb.name}'s flag`);
        feedPush(`${a.name} of ${b.name} took ${tb.name}'s flag.`,'c-gold');setHeadline('Flag taken',`${tb.name.toUpperCase()} FLAG IN ${b.name.toUpperCase()} HANDS`);direct(a)}
      break}
    case'carry':{if(!a.flag){a.task=null;return}if(goTo(a,b.flag.hx,b.flag.hy,dt,0.7,2))capture(a);break}
    case'recover':{const f=b.flag;if(!f.dropped){a.task=null;return}if(goTo(a,f.x,f.y,dt,0.6,1.5)){returnFlag(f,a)}break}
    case'hunt':case'duel':engage(a,t.tgt,dt);break;
    case'escort':{const c=t.tgt;if(!c||c.dead||!c.flag){a.task=null;return}goTo(a,c.x,c.y,dt,1.6,0.8);break}
    case'rift':if(!rift){a.task=null;return}engage(a,rift,dt);break;
    case'rest':{if(goTo(a,b.restSpot[0],b.restSpot[1],dt,1.2)){const food=b.res.food>0;a.hp=Math.min(a.maxHp,a.hp+dt*(food?7:2.5));if(food)b.res.food=Math.max(0,b.res.food-dt*0.4);if(a.hp>=a.maxHp*0.96)a.task=null}break}
    case'shop':{if(goTo(a,b.forgeSpot[0],b.forgeSpot[1],dt,0.9)){buy(a,t.item);a.task=null}break}
    case'explore':{if(!t.tile){for(let k=0;k<20;k++){const x=(R()*MW)|0,y=(R()*MH)|0;if(passable(x,y)&&Math.hypot(x-a.x,y-a.y)>12){t.tile=[x+.5,y+.5];break}}if(!t.tile){a.task=null;return}}
      if(goTo(a,t.tile[0],t.tile[1],dt,0.8))a.task=null;
      if(R()<dt*0.3){const m=nearestMonster(a,7);if(m&&!a.bubble)say(a,`${MT[m.type].label} near me`)}
      break}
  }
}
function buy(a,it){
  if(!it||a.px<it.c)return;a.px-=it.c;
  if(it.k==='tonic'){a.tonics++;return}
  a.equip[it.k]++;const nm=it.k[0].toUpperCase()+it.k.slice(1);
  lifeLog(a,'⚒',`Bought ${nm} ${a.equip[it.k]}`);feedPush(`${a.name} bought ${nm} ${a.equip[it.k]} at the ${bases[a.team].name} forge.`);
  if(it.k==='plate')a.maxHp+=10;
  charSprites(a);if((a.equip.plate>=2)!==a.pHelm)makePortrait(a);
}
function completeProject(b){
  const p=b.project;b.project=null;
  if(p.k==='tower'){block[p.y*MW+p.x]=1;b.towers.push({x:p.x,y:p.y,cd:0,team:b.i,kind:'tower',name:`${b.name} tower`});statics.push({c:teamSprites[b.i].tower,dx:isoX(p.x+.5,p.y+.5)-13,dy:isoY(p.x+.5,p.y+.5)-44,key:p.x+p.y+1,w:28,h:52,light:[p.x+.5,p.y+.5,40]});statics.sort((q,r)=>q.key-r.key)
    for(const a of agents)if(!a.dead&&Math.floor(a.x)===p.x&&Math.floor(a.y)===p.y){const q=nearestPassable(p.x,p.y,2);if(q){a.x=q[0]+.5;a.y=q[1]+.5}}}
  else if(p.k==='forge')b.forge++;else b.hall++;
  feedPush(`${b.name} finished a ${p.name}.`,'c-green');
  for(const a of p.builders){progress(a,'build');lifeLog(a,'▲',`Finished the ${p.name} at ${b.name}`);earn(a,15);gainXP(a,10);bump(a.rep,'teamwork',3)}
}
function capture(a){
  const b=bases[a.team],eb=a.flag,f=eb.flag;f.carrier=null;f.dropped=false;f.x=f.hx;f.y=f.hy;a.flag=null;a.task=null;
  b.captures++;daily.captures++;earn(a,60);gainXP(a,30);progress(a,'capture');bump(a.rep,'bravery',6);
  lifeLog(a,'⚑',`Captured ${eb.name}'s flag for ${b.name}`);say(a,'Flag home!');
  feedPush(`${a.name} ran ${eb.name}'s flag home. ${b.name} ${b.captures}/3.`,'c-gold');setHeadline('Capture',`${b.name.toUpperCase()} CAPTURES ${eb.name.toUpperCase()}'S FLAG`);direct(a);
  if(b.captures>=3&&!seasonEnd){seasonEnd={t:10,winner:b};banner={t:time,title:`Season ${season} · ${b.name} wins`,text:`${b.name} captured three flags. A new season starts in a moment.`};feedPush(`Season ${season} goes to ${b.name}.`,'c-gold')}
}
function returnFlag(f,a){f.carrier=null;f.dropped=false;f.x=f.hx;f.y=f.hy;if(a){say(a,'Our flag is back!');bump(a.rep,'teamwork',3);lifeLog(a,'⚑','Returned our flag home');feedPush(`${a.name} returned ${bases[f.team].name}'s flag.`)}if(a)a.task=null}
function dropFlag(a){if(!a.flag)return;const f=a.flag.flag;f.carrier=null;f.dropped=true;f.x=a.x;f.y=a.y;f.dropT=25;a.flag=null;feedPush(`${bases[f.team].name}'s flag lies in the dirt.`)}

/* ================= combat ================= */
function hurt(t,dmg,src){
  if(t.kind==='rift'){t.hp-=dmg;floater(t,Math.round(dmg),'#d6c4ff');if(t.hp<=0&&rift===t)sealRift(src);return}
  if(t.isAgent){dmg*=1-0.09*t.equip.plate;t.hp-=dmg;t.combatT=3;t.lastHitBy=src;
    if(src&&src.kind==='monster'){t.dmgFrom[src.type]+=dmg;checkFear(t,src.type)}
    if(t.hp>0&&t.hp<t.maxHp*0.35&&!t.bubble&&R()<0.35)say(t,src&&src.isAgent?`${src.name} is on me!`:src&&src.kind==='monster'?`${MT[src.type].label} on me!`:'Need help!');
    if(t.hp>0&&t.hp<t.maxHp*0.3&&t.tonics>0){t.tonics--;t.hp=Math.min(t.maxHp,t.hp+45);floater(t,'+45','#74c96b')}
  }else{t.hp-=dmg;if(src&&src.isAgent){t.target=src;t.aggroT=6}}
  floater(t,Math.round(dmg),t.isAgent?'#ff8a7a':'#fff3dc');
  if(t.hp<=0)die(t,src);
}
function checkFear(a,type){
  if(a.dmgFrom[type]>a.maxHp*0.9&&a.fear[type]<0.5){a.fear[type]=0.6;bump(a.temp,'caution',4);const s=`Learned to fear ${MT[type].label}S`;a.lessons.unshift({t:s,tag:`Fears ${MT[type].label.toLowerCase()}s`});if(a.lessons.length>5)a.lessons.pop();lifeLog(a,'!',s)}
}
function die(v,k){
  if(v.dead)return;
  if(v.kind==='monster'){v.dead=true;
    if(k&&k.isAgent){earn(k,v.px);gainXP(k,MT[v.type].xp);k.mkills++;k.kills++;k.ds.kills++;daily.monsters++;progress(k,'mkills');if(v.type==='golem')progress(k,'golem');bump(k.rep,'bravery',v.type==='golem'?4:0.6);
      if(k.fear[v.type]>0){k.fear[v.type]*=0.7;if(k.fear[v.type]<0.2&&k.fear[v.type]>0){k.fear[v.type]=0;k.lessons.unshift({t:`Learned to beat ${MT[v.type].label}S`,tag:`Beats ${MT[v.type].label.toLowerCase()}s`});if(k.lessons.length>5)k.lessons.pop()}}
      if(v.type==='golem'||v.type==='wraith'&&R()<0.4){feedPush(`${k.name} brought down a ${MT[v.type].label}.`);lifeLog(k,'✦',`Slew a ${MT[v.type].label}`);if(v.type==='golem')direct(k)}
      if(D(k,'greed')<0.45){const ally=agents.find(o=>o!==k&&!o.dead&&o.team===k.team&&Math.hypot(o.x-k.x,o.y-k.y)<5);if(ally){const share=Math.floor(v.px/2);k.px-=share;earn(ally,share);say(k,"Loot over here, it's yours.");bump(k.rep,'generosity',3);ally.friends.set(k.id,(ally.friends.get(k.id)||0)+1)}}
    }
    if(v.type==='golem'&&(!k||!k.isAgent))daily.monsters++;
    return;
  }
  // agent
  v.dead=true;v.hp=0;v.respawnT=Math.max(6,15-bases[v.team].hall*2.5);v.deaths++;v.ds.died=true;daily.fallen++;
  if(v.task&&v.task.res&&v.task.res.claim===v)v.task.res.claim=null;v.task=null;v.carry=null;v.path=null;
  dropFlag(v);graves.push({x:v.x,y:v.y,t:14});
  if(k&&k.isAgent){
    const steal=Math.max(5,Math.floor(v.px*0.15));v.px-=steal;earn(k,steal);k.duels++;k.kills++;k.ds.kills++;daily.duels++;gainXP(k,25);progress(k,'duels');bump(k.rep,'bravery',3);v.ds.robbed=true;
    feedPush(`${k.name} (${bases[k.team].name}) cut down ${v.name} and took ${steal} PX.`,'c-red');
    lifeLog(v,'✝',`Fell to ${k.name}`);lifeLog(k,'⚔',`Cut down ${v.name}`);
    v.grudges.set(k.id,(v.grudges.get(k.id)||0)+2);if((v.grudges.get(k.id)||0)===2)lifeLog(v,'✕',`Swore a grudge against ${k.name}`);
    if(k.avenge.has(v.id)){k.avenge.delete(v.id);progress(k,'avenge');lifeLog(k,'✕',`Settled the score with ${v.name}`)}
    for(const o of agents){if(o===v||o.dead||o.team!==v.team)continue;if(D(o,'loyalty')>0.6&&(o.friends.get(v.id)||0)>=1&&R()<0.7){o.avenge.add(k.id);o.grudges.set(k.id,(o.grudges.get(k.id)||0)+1);feedPush(`${o.name} swore to avenge ${v.name}.`);lifeLog(o,'✕',`Swore to avenge ${v.name}`);break}}
    if(k.flag===null&&R()<0.4)say(k,pick(['Got one.','Stay down.','Next!']));
    direct(k);
  }else if(k&&k.kind==='monster'){feedPush(`${v.name} was slain by a ${MT[k.type].label}.`,'c-red');lifeLog(v,'✝',`Fell to a ${MT[k.type].label}`);v.fear[k.type]=Math.max(v.fear[k.type],0.4);if(!v.lessons.some(l=>l.t.includes(MT[k.type].label))){v.lessons.unshift({t:`Learned to fear ${MT[k.type].label}S`,tag:`Fears ${MT[k.type].label.toLowerCase()}s`});if(v.lessons.length>5)v.lessons.pop()}}
  else if(k&&k.kind==='tower'){feedPush(`${v.name} fell to the ${k.name}.`,'c-red');lifeLog(v,'✝',`Fell to the ${k.name}`)}
}
function respawn(a){const b=bases[a.team];const p=nearestPassable((b.cx+R()*3-1)|0,(b.cy+1+R()*2)|0,3);a.x=p[0]+.5;a.y=p[1]+.5;a.dead=false;a.hp=a.maxHp;a.task=null;a.path=null;a.combatT=0;a.thinkT=0.2;charSprites(a)}

/* ================= monsters ================= */
function spawnMonster(type,x,y,purple){
  const mt=MT[type],sc=1+Math.min(1.5,day*0.06);
  monsters.push({uid:uidN++,kind:'monster',type,x,y,hp:mt.hp*sc,maxHp:mt.hp*sc,px:Math.round(mt.px*(1+day*0.05)),cd:0,atkT:0,animT:R()*2,target:null,aggroT:0,path:null,pathKey:'',pathT:0,facing:1,moving:false,home:[x,y],wt:0,wtile:null,purple:!!purple,dead:false});
}
function wildTile(){for(let k=0;k<40;k++){const x=(R()*MW)|0,y=(R()*MH)|0;if(!passable(x,y))continue;if(bases.some(b=>Math.hypot(x-b.cx,y-b.cy)<12))continue;if(agents.some(a=>!a.dead&&Math.hypot(x-a.x,y-a.y)<8))continue;return[x+.5,y+.5]}return null}
function updateMonster(m,dt){
  m.cd-=dt;m.aggroT-=dt;m.animT+=dt;m.atkT-=dt;m.moving=false;
  const mt=MT[m.type];
  if(m.type==='wraith'&&!isNight()){m.hp-=dt*6;if(m.hp<=0){m.dead=true;return}}
  let tg=m.target;
  if(!tg||tg.dead||m.aggroT<=0||Math.hypot(tg.x-m.x,tg.y-m.y)>12){tg=null;let bd=mt.aggro*(isNight()?1.3:1);for(const a of agents){if(a.dead)continue;const d=Math.hypot(a.x-m.x,a.y-m.y);if(d<bd){bd=d;tg=a}}m.target=tg;if(tg)m.aggroT=5}
  if(tg){const d=Math.hypot(tg.x-m.x,tg.y-m.y);
    if(d>0.95)goTo(m,tg.x,tg.y,dt,0.9,0.8);
    else{m.facing=((tg.x-m.x)-(tg.y-m.y))>=0?1:-1;if(m.cd<=0){m.cd=mt.cd;m.atkT=0.25;hurt(tg,mt.dmg*(0.85+R()*0.3)*(1+Math.min(1,day*0.03)),m)}}
    if(Math.hypot(m.x-m.home[0],m.y-m.home[1])>16){m.target=null;m.aggroT=0}
  }else{m.wt-=dt;if(m.wt<=0||!m.wtile){m.wt=3+R()*5;const p=nearestPassable((m.home[0]+R()*8-4)|0,(m.home[1]+R()*8-4)|0,2);m.wtile=p?[p[0]+.5,p[1]+.5]:null;m.path=null}
    if(m.wtile&&m.wt<4)goTo(m,m.wtile[0],m.wtile[1],dt,0.3)}
}
function updateRift(dt){
  riftT-=dt;
  if(!rift&&riftT<=0){const p=wildTile();if(p){let nb=bases[0],nd=1e9;for(const b of bases){const d=Math.hypot(b.cx-p[0],b.cy-p[1]);if(d<nd){nd=d;nb=b}}
      rift={kind:'rift',uid:uidN++,x:p[0],y:p[1],hp:240,maxHp:240,t:60,spawnT:2,near:nb.name,dead:false};setHeadline('Rift',`RIFT NEAR ${nb.name.toUpperCase()}`);feedPush(`A rift tore open near ${nb.name}.`,'c-mind')}
    riftT=DAY*(0.55+R()*0.5)}
  if(rift){rift.t-=dt;rift.spawnT-=dt;
    if(rift.spawnT<=0){rift.spawnT=5;if(monsters.filter(m=>m.purple).length<7){const q=nearestPassable((rift.x+R()*4-2)|0,(rift.y+R()*4-2)|0,2);if(q)spawnMonster(isNight()&&R()<0.5?'wraith':'slime',q[0]+.5,q[1]+.5,true)}}
    if(rift.t<=0){feedPush(`The rift near ${rift.near} collapsed on its own.`,'c-mind');rift.dead=true;rift=null}}
}
function sealRift(k){
  if(!rift)return;const n=rift.near;rift.dead=true;rift=null;
  if(k&&k.isAgent){earn(k,90);gainXP(k,40);progress(k,'rift');bump(k.rep,'bravery',5);lifeLog(k,'✦',`Sealed the rift near ${n}`);feedPush(`${k.name} sealed the rift near ${n} (+90 PX).`,'c-mind');setHeadline('Rift sealed',`${k.name.toUpperCase()} SEALS THE RIFT`);direct(k)}
}

/* ================= captains ================= */
function captainThink(b){
  const team=agents.filter(a=>a.team===b.i),alive=team.filter(a=>!a.dead);
  // alliances
  const leader=bases.slice().sort((p,q)=>q.captures-p.captures)[0];
  const others=bases.filter(o=>o!==leader);
  const leadBy=leader.captures-Math.max(...others.map(o=>o.captures));
  if(leadBy>=2){if(b!==leader){const mate=others.find(o=>o!==b);if(!b.allies.has(mate.i)){b.allies.add(mate.i);mate.allies.add(b.i);feedPush(`${b.name} and ${mate.name} ally against ${leader.name}.`,'c-mind');setHeadline('Alliance',`${b.name.toUpperCase()} + ${mate.name.toUpperCase()} VS ${leader.name.toUpperCase()}`)}b.target=leader.i}}
  else if(b.allies.size){for(const o of b.allies)bases[o].allies.delete(b.i);b.allies.clear();feedPush(`${b.name} breaks its alliance.`,'c-mind')}
  if(!b.allies.size||b.target===undefined||allied(b.target,b.i)){const cands=bases.filter(o=>o!==b&&!allied(o.i,b.i));if(cands.length){cands.sort((p,q)=>guardsAt(p)-guardsAt(q)+(q.captures-p.captures)*0.5);b.target=cands[0].i}}
  // project
  if(!b.project){
    let k=null;
    if(b.towers.length<3&&b.res.wood>=PROJ.tower.wood&&b.res.stone>=PROJ.tower.stone)k='tower';
    else if(b.forge<3&&b.res.wood>=PROJ.forge.wood&&b.res.stone>=PROJ.forge.stone&&(b.towers.length>=1||b.res.stone>140))k='forge';
    else if(b.hall<3&&b.res.wood>=PROJ.hall.wood&&b.res.food>=PROJ.hall.food&&b.res.stone>=PROJ.hall.stone&&b.towers.length>=2)k='hall';
    if(k){const P=PROJ[k];b.res.wood-=P.wood;b.res.stone-=P.stone;b.res.food-=P.food;let site;
      if(k==='tower'){site=b.slots.find(([x,y])=>!b.towers.some(t=>t.x===x&&t.y===y))}else if(k==='forge')site=[b.cx+2,b.cy-1];else site=[b.cx-1,b.cy];
      b.project={k,name:P.name,x:site[0],y:site[1],prog:0,work:P.work,builders:new Set()}}
  }
  // what to gather next
  const next=b.towers.length<3?PROJ.tower:b.forge<3?PROJ.forge:PROJ.hall;
  const def={wood:next.wood-b.res.wood,stone:next.stone-b.res.stone,food:Math.max(next.food,35)-b.res.food};
  b.need=Object.keys(def).sort((p,q)=>def[q]-def[p])[0];if(def[b.need]<=0)b.need=pick(['wood','stone','food']);
  // roles
  const threats=agents.filter(o=>!o.dead&&!allied(o.team,b.i)&&Math.hypot(o.x-b.cx,o.y-b.cy)<10).length+monsters.filter(m=>!m.dead&&Math.hypot(m.x-b.cx,m.y-b.cy)<8).length;
  const n=alive.length;if(!n)return;
  const behind=Math.max(...bases.map(o=>o.captures))-b.captures;
  const rich=!b.project&&b.towers.length>=3;const q={guard:threats?Math.min(3,1+threats):1,raider:threats>2?0:Math.min(3,(behind>=1&&n>=4?2:1)+(rich?1:0)),builder:b.project?1:0,scout:(rift||n>=5)?1:0};
  let used=q.guard+q.raider+q.builder+q.scout;while(used>n-1&&used>0){if(q.scout){q.scout--;}else if(q.raider>1){q.raider--}else if(q.guard>1){q.guard--}else if(q.builder){q.builder--}else if(q.raider){q.raider--}else q.guard--;used=q.guard+q.raider+q.builder+q.scout}
  q.gatherer=n-used;
  const fit={raider:a=>a.temp.aggr+a.temp.pride+a.lvl*6,guard:a=>a.temp.caution+a.temp.loyalty,builder:a=>a.temp.loyalty+100-a.temp.aggr,scout:a=>a.temp.caution*0.5+a.equip.boots*20+100-a.temp.pride*0.5,gatherer:a=>a.temp.greed+50};
  const pool=alive.slice();const assign=new Map();
  for(const role of['raider','guard','builder','scout','gatherer']){for(let k=0;k<q[role];k++){if(!pool.length)break;pool.sort((p,r)=>fit[role](r)-fit[role](p)+(r.role===role?25:0)-(p.role===role?25:0));assign.set(pool.shift(),role)}}
  for(const[a,role]of assign){if(a.role!==role){a.role=role;lifeLog(a,'◆',`Took up work as a ${role}`);charSprites(a);a.thinkT=0;
      const cap=team.find(o=>o.captain);if(cap&&cap!==a){const msg=role==='raider'?`${a.name}, hit ${bases[b.target].name}.`:role==='guard'?`${a.name}, hold the walls.`:role==='builder'?`${a.name}, get building.`:role==='scout'?`${a.name}, go scout.`:`${a.name}, bring ${b.need}.`;a.heard.unshift({who:`Captain ${cap.name}`,team:b.i,text:msg});if(a.heard.length>3)a.heard.pop()}}}
  const tn=bases[b.target].name;
  b.plan=[q.raider?`${q.raider} raid${q.raider>1?'':'s'} ${tn}`:null,`${q.guard} guard${q.guard>1?'':'s'}`,q.gatherer?`${q.gatherer} gather${q.gatherer>1?'':'s'} ${b.need}`:null,q.builder?`1 builds ${b.project.name}`:null,q.scout?'1 scouts':null].filter(Boolean).join(' · ');
}

/* ================= main step ================= */
let daily0=()=>({monsters:0,fallen:0,duels:0,captures:0});
function onDawn(){
  let top=null;for(const a of agents)if(!top||a.ds.px>top.ds.px)top=a;
  banner={t:time,title:`Dawn · Day ${day}`,text:`Day ${day-1} is done: ${daily.monsters} monsters slain, ${daily.fallen} fallen, ${daily.duels} duel${daily.duels===1?'':'s'} decided. Top earner ${top.name} (+${top.ds.px} PX).`};
  feedPush(`Dawn of day ${day}.`);
  for(const a of agents){const s=a.ds;
    a.quote=s.robbed?'I was robbed yesterday. Today I hunt.':s.died?'I fell yesterday. Today I hit back.':s.kills>=3?`${s.kills} kills yesterday. Today I want more.`:s.delivered>=40?'The stockpile grows. Keep hauling.':
      ({guard:'Nobody passes the gate today.',raider:'Their flag looks lonely.',scout:'Something is out past the river.',builder:'One more tower and we are safe.',gatherer:'Wood does not chop itself.'})[a.role];
    a.ds={kills:0,died:false,robbed:false,delivered:0,px:0}}
  for(const m of monsters)if(m.type==='wraith')m.dead=true;
  daily=daily0();
}
function startSeason(){
  seasonEnd=null;season++;
  for(const b of bases){b.captures=0;b.allies.clear();const f=b.flag;f.carrier=null;f.dropped=false;f.x=f.hx;f.y=f.hy}
  for(const a of agents){a.flag=null;if(!a.dead)a.hp=a.maxHp;a.task=null;lifeLog(a,'◆',`Season ${season} begins`)}
  feedPush(`Season ${season} begins. Flags reset.`,'c-gold');setHeadline('New season',`SEASON ${season} BEGINS`);
}
function step(dt){
  time+=dt;
  const nd=Math.floor(time/DAY)+1;if(nd!==day){day=nd;onDawn()}
  if(seasonEnd){seasonEnd.t-=dt;if(seasonEnd.t<=0)startSeason()}
  for(const b of bases){
    b.capT-=dt;if(b.capT<=0){b.capT=5;captainThink(b)}
    for(const tw of b.towers){tw.cd-=dt;if(tw.cd>0)continue;let tg=null,bd=6;
      for(const m of monsters){if(m.dead)continue;const d=Math.hypot(m.x-tw.x-.5,m.y-tw.y-.5);if(d<bd){bd=d;tg=m}}
      for(const a of agents){if(a.dead||allied(a.team,b.i))continue;const d=Math.hypot(a.x-tw.x-.5,a.y-tw.y-.5);if(d<Math.min(bd,4.5)){bd=d;tg=a}}
      if(tg){tw.cd=1.6;projs.push({x0:tw.x+.5,y0:tw.y+.5,tg,t:0,dur:0.35,dmg:(tg.isAgent?3:8)+b.forge,src:tw})}}
    const f=b.flag;if(f.carrier){f.x=f.carrier.x;f.y=f.carrier.y}else if(f.dropped){f.dropT-=dt;if(f.dropT<=0){returnFlag(f,null);feedPush(`${b.name}'s flag returned home on its own.`)}}
  }
  for(const a of agents){
    if(a.dead){a.respawnT-=dt;if(a.respawnT<=0)respawn(a);continue}
    a.cd-=dt;a.atkT-=dt;a.combatT-=dt;if(a.bubble){a.bubble.t-=dt;if(a.bubble.t<=0)a.bubble=null}
    if(a.combatT<=0)a.hp=Math.min(a.maxHp,a.hp+dt*0.6);
    a.thinkT-=dt;if(a.thinkT<=0||!a.task){a.thinkT=1.2+R()*0.6;think(a)}
    a.moving=false;runTask(a,dt);if(a.moving)a.walkT+=dt;
    // flags on touch
    for(const eb of bases){const f=eb.flag;if(!f.dropped)continue;if(Math.hypot(f.x-a.x,f.y-a.y)>0.7)continue;
      if(eb.i===a.team)returnFlag(f,a);else if(!allied(eb.i,a.team)&&!a.flag){f.carrier=a;f.dropped=false;a.flag=eb;a.task=null;say(a,`Got ${eb.name}'s flag!`);feedPush(`${a.name} picked up ${eb.name}'s flag.`,'c-gold')}}
  }
  for(const m of monsters)if(!m.dead)updateMonster(m,dt);
  monsters=monsters.filter(m=>!m.dead);
  spawnT-=dt;if(spawnT<=0){spawnT=2.5;const night=isNight(),cap=12+Math.min(14,day*1.5)+(night?6:0);if(monsters.length<cap){const p=wildTile();if(p){const r=R();const type=night&&r<0.4?'wraith':r<0.06+Math.min(0.08,day*0.006)?'golem':r<0.45?'wolf':'slime';spawnMonster(type,p[0],p[1])}}}
  updateRift(dt);
  for(const p of projs){p.t+=dt;if(p.t>=p.dur&&!p.done){p.done=true;if(!p.tg.dead&&p.tg.hp>0)hurt(p.tg,p.dmg,p.src)}}
  projs=projs.filter(p=>!p.done);
  if(Math.floor(time)!==Math.floor(time-dt))for(const r of resources)if(r.amt<=0){r.regrow-=1;if(r.regrow<=0)r.amt=r.max}
  for(const g of graves)g.t-=dt;graves=graves.filter(g=>g.t>0);
}
function direct(a){if(!director||time-lastDirect<14)return;lastDirect=time;watch(a,true)}

/* ================= rendering ================= */
const cv=document.getElementById('world'),ctx=cv.getContext('2d');
const mini=document.getElementById('mini'),mctx=mini.getContext('2d');
let visT=0;
const DPR=()=>Math.min(window.devicePixelRatio||1,2);
function resize(){const r=cv.getBoundingClientRect(),d=DPR();cv.width=Math.max(1,Math.round(r.width*d));cv.height=Math.max(1,Math.round(r.height*d));const m=mini.getBoundingClientRect();mini.width=Math.round(m.width*d);mini.height=Math.round(m.height*d)}
function view(){const d=DPR(),ds=ZOOMS[zi]*d;const ox=Math.round(cv.width/2-cam.x*ds),oy=Math.round(cv.height/2-cam.y*ds);return{d,ds,ox,oy,x0:-ox/ds,y0:-oy/ds,x1:(cv.width-ox)/ds,y1:(cv.height-oy)/ds}}
function render(){
  const V=view();
  ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#1e4a72';ctx.fillRect(0,0,cv.width,cv.height);
  ctx.setTransform(V.ds,0,0,V.ds,V.ox,V.oy);ctx.imageSmoothingEnabled=false;
  ctx.drawImage(terrainC,0,0);
  // A restrained tactical halo helps each outpost read at a glance without changing the terrain.
  for(const b of bases){
    const bx=isoX(b.cx+.5,b.cy+.5),by=isoY(b.cx+.5,b.cy+.5);
    if(bx<V.x0-70||bx>V.x1+70||by<V.y0-50||by>V.y1+50)continue;
    const [r,g,bl]=hexRgb(b.color),pulse=(Math.sin(visT*1.2+b.i*1.7)+1)*0.5;
    ctx.beginPath();ctx.ellipse(bx,by+7,49+pulse*3,25+pulse*2,0,0,Math.PI*2);
    ctx.fillStyle=`rgba(${r},${g},${bl},.055)`;ctx.fill();
    ctx.strokeStyle=`rgba(${r},${g},${bl},${.21+pulse*.09})`;
    ctx.lineWidth=.75;ctx.stroke();
  }
  ctx.fillStyle='#d6eef8';for(const s of sparkles){if(s[0]<V.x0||s[0]>V.x1||s[1]<V.y0||s[1]>V.y1)continue;if(Math.sin(visT*1.6+s[2]*3)>0.9)ctx.fillRect(Math.round(s[0]),Math.round(s[1]),2,1)}
  // drawables
  const list=[];const inV=(x,y,m=60)=>x>V.x0-m&&x<V.x1+m&&y>V.y0-m&&y<V.y1+m*1.5;
  for(const o of statics){if(o.cur!==undefined){const c=o.cur;if(!c)continue;const sx=isoX(o.x,o.y),sy=isoY(o.x,o.y);if(!inV(sx,sy))continue;list.push({k:o.key,f:()=>ctx.drawImage(c.c,Math.round(sx-c.ax),Math.round(sy-c.ay))})}
    else{if(o.dx+o.w<V.x0||o.dx>V.x1||o.dy+o.h<V.y0||o.dy>V.y1)continue;list.push({k:o.key,f:()=>ctx.drawImage(o.c,o.dx,o.dy)})}}
  for(const b of bases){
    const cfx=isoX(b.cx+.5,b.cy+.5),cfy=isoY(b.cx+.5,b.cy+.5);
    if(inV(cfx,cfy,200)){
      list.push({k:b.cx+b.cy+1,f:()=>ctx.drawImage(SP.campfire[Math.floor(visT*7)%3],Math.round(cfx-8),Math.round(cfy-12))});
      const dx=isoX(b.depot[0],b.depot[1]),dy=isoY(b.depot[0],b.depot[1]);
      list.push({k:b.depot[0]+b.depot[1],f:()=>{const w=Math.min(5,Math.floor(b.res.wood/25)),s=Math.min(4,Math.floor(b.res.stone/30)),fo=Math.min(3,Math.floor(b.res.food/25));for(let i=0;i<w;i++)ctx.drawImage(SP.logs,Math.round(dx-12+(i%3)*2),Math.round(dy-4-Math.floor(i/3)*3)-(i%3));for(let i=0;i<s;i++)ctx.drawImage(SP.stone,Math.round(dx+1+(i%2)*4),Math.round(dy-3-Math.floor(i/2)*3));for(let i=0;i<fo;i++)ctx.drawImage(SP.food,Math.round(dx-4+i*3),Math.round(dy+2))}});
      if(b.project){const p=b.project;list.push({k:p.x+p.y+1,f:()=>{const sx=isoX(p.x,p.y),sy=isoY(p.x,p.y);if(p.k==='tower')ctx.drawImage(SP.scaffold,Math.round(sx-18),Math.round(sy-28));const bx=isoX(p.x+.5,p.y+.5)-10,by=isoY(p.x+.5,p.y+.5)-(p.k==='tower'?34:26);ctx.fillStyle='#1a1715';ctx.fillRect(bx,by,20,3);ctx.fillStyle='#74c96b';ctx.fillRect(bx+1,by+1,Math.round(18*p.prog/p.work),1)}})}
    }
    const f=b.flag;if(!f.carrier){const sx=isoX(f.x,f.y),sy=isoY(f.x,f.y);if(inV(sx,sy))list.push({k:f.x+f.y,f:()=>ctx.drawImage(teamSprites[b.i].flag[Math.floor(visT*3+b.i)%2],Math.round(sx-3),Math.round(sy-29))})}
  }
  for(const g of graves){const sx=isoX(g.x,g.y),sy=isoY(g.x,g.y);if(inV(sx,sy))list.push({k:g.x+g.y-0.01,f:()=>ctx.drawImage(SP.grave,Math.round(sx-4),Math.round(sy-11))})}
  if(rift){const sx=isoX(rift.x,rift.y),sy=isoY(rift.x,rift.y);if(inV(sx,sy))list.push({k:rift.x+rift.y,f:()=>{ctx.drawImage(SP.rift[Math.floor(visT*6)%4],Math.round(sx-15),Math.round(sy-34));hpBar(sx,sy-38,rift.hp/rift.maxHp,'#a093f4',20)}})}
  for(const m of monsters){const sx=isoX(m.x,m.y),sy=isoY(m.x,m.y);if(inV(sx,sy))list.push({k:m.x+m.y,f:()=>drawMonster(m,sx,sy)})}
  for(const a of agents){if(a.dead)continue;const sx=isoX(a.x,a.y),sy=isoY(a.x,a.y);if(inV(sx,sy))list.push({k:a.x+a.y,f:()=>drawAgent(a,sx,sy)})}
  list.sort((p,q)=>p.k-q.k);for(const d of list)d.f();
  // projectiles
  for(const p of projs){const tx=p.tg.x,ty=p.tg.y,f=p.t/p.dur;const sx=isoX(p.x0+(tx-p.x0)*f,p.y0+(ty-p.y0)*f),sy=isoY(p.x0+(tx-p.x0)*f,p.y0+(ty-p.y0)*f)-34*(1-f)-8-Math.sin(f*3.14)*8;ctx.drawImage(SP.arrow,Math.round(sx),Math.round(sy))}
  // smoke from forges & halls
  if(Math.random()<0.25){const b=pick(bases,Math.random);smokes.push({x:isoX(b.cx+2.75,b.cy-1.75)+1,y:isoY(b.cx+2.75,b.cy-1.75)-30,t:0});smokes.push({x:isoX(b.cx-1.45+0.4,b.cy-1.45)+1,y:isoY(b.cx-1.5,b.cy-1.5)-44,t:0})}
  for(const s of smokes){s.t+=1/60;s.y-=0.25;s.x+=0.08;const a=0.45*(1-s.t/2.4);ctx.fillStyle=`rgba(205,198,190,${Math.max(0,a)})`;const z=s.t>1?3:2;ctx.fillRect(Math.round(s.x),Math.round(s.y),z,z)}
  smokes=smokes.filter(s=>s.t<2.4);
  // floaters
  ctx.font='bold 7px "Chakra Petch", sans-serif';ctx.textAlign='center';
  for(const f of floaters){const sx=isoX(f.x,f.y),sy=isoY(f.x,f.y)-26-f.t*14;const a=Math.max(0,1-f.t/1.1);ctx.fillStyle=`rgba(10,8,6,${a})`;ctx.fillText(f.text,Math.round(sx)+0.5,Math.round(sy)+0.5);ctx.globalAlpha=a;ctx.fillStyle=f.color;ctx.fillText(f.text,Math.round(sx),Math.round(sy));ctx.globalAlpha=1}
  // night
  const dk=darkness();
  if(dk>0.01){ctx.fillStyle=`rgba(12,18,52,${dk})`;ctx.fillRect(V.x0,V.y0,V.x1-V.x0,V.y1-V.y0);
    ctx.globalCompositeOperation='lighter';const k=dk/0.46;
    const light=(x,y,r,c)=>{if(x<V.x0-r||x>V.x1+r||y<V.y0-r||y>V.y1+r)return;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,c);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)};
    for(const b of bases){light(isoX(b.cx+.5,b.cy+.5),isoY(b.cx+.5,b.cy+.5)-6,70,`rgba(255,150,60,${0.32*k})`);light(isoX(b.cx+2.5,b.cy-1.5),isoY(b.cx+2.5,b.cy-1.5)-6,34,`rgba(255,140,50,${0.3*k})`);light(isoX(b.cx-1,b.cy),isoY(b.cx-1,b.cy)-14,40,`rgba(255,200,110,${0.2*k})`)}
    for(const o of statics)if(o.light)light(isoX(o.light[0],o.light[1]),isoY(o.light[0],o.light[1])-o.light[2],26,`rgba(255,190,90,${0.28*k})`);
    if(rift)light(isoX(rift.x,rift.y),isoY(rift.x,rift.y)-16,60,`rgba(150,90,255,${0.4*k})`);
    for(const m of monsters)if(m.type==='golem'||m.type==='wraith')light(isoX(m.x,m.y),isoY(m.x,m.y)-12,16,m.type==='golem'?`rgba(255,150,60,${0.3*k})`:`rgba(170,130,255,${0.3*k})`);
    ctx.globalCompositeOperation='source-over'}
  // screen-space labels
  ctx.setTransform(V.d,0,0,V.d,0,0);
  const toS=(wx,wy)=>[(wx*V.ds+V.ox)/V.d,(wy*V.ds+V.oy)/V.d];
  const z=ZOOMS[zi];
  for(const b of bases){const[sx,sy]=toS(isoX(b.cx+.5,b.cy+.5),isoY(b.cx+.5,b.cy+.5)-92);plate(sx,sy,b.name.toUpperCase(),`OUTPOST · ${b.captures}/3 FLAGS`,b.color)}
  if(rift){const[sx,sy]=toS(isoX(rift.x,rift.y),isoY(rift.x,rift.y)-42);tag(sx,sy,'RIFT','#a093f4',true)}
  for(const a of agents){if(a.dead||a===watched)continue;const[sx,sy]=toS(isoX(a.x,a.y),isoY(a.x,a.y)-24);if(sx<-60||sy<-40||sx>cv.width/V.d+60||sy>cv.height/V.d+40)continue;
    if(z>=1.5||a.flag)tag(sx,sy,(a.captain?'★ ':'')+a.name,TEAMS[a.team].color,false,a.flag?'⚑':null);
    if(a.bubble)bubble(sx,sy-18,a.bubble.text)}
  if(watched&&!watched.dead){const a=watched;const[sx,sy]=toS(isoX(a.x,a.y),isoY(a.x,a.y)-24);card(a,sx,sy);if(a.bubble)bubble(sx,sy-44,a.bubble.text)}
}
function hpBar(x,y,f,c,w=12){ctx.fillStyle='#1a1412';ctx.fillRect(Math.round(x-w/2-1),Math.round(y-1),w+2,4);ctx.fillStyle='#3a1a16';ctx.fillRect(Math.round(x-w/2),Math.round(y),w,2);ctx.fillStyle=c;ctx.fillRect(Math.round(x-w/2),Math.round(y),Math.max(0,Math.round(w*f)),2)}
function drawAgent(a,sx,sy){
  sx=Math.round(sx);sy=Math.round(sy);
  ctx.fillStyle='rgba(10,8,6,.32)';ctx.fillRect(sx-5,sy-1,10,2);ctx.fillRect(sx-3,sy-2,6,4);
  if(a===watched){ctx.fillStyle='#e9b04b';for(let k=0;k<20;k++){const an=k/20*6.283+visT*0.8;ctx.fillRect(Math.round(sx+Math.cos(an)*9),Math.round(sy+Math.sin(an)*4.5),1,1)}}
  if(a.carry){const s=a.carry.type==='wood'?SP.logs:a.carry.type==='stone'?SP.stone:SP.food;ctx.drawImage(s,sx-(a.facing>0?9:0),sy-15)}
  if(a.flag){const fs=teamSprites[a.flag.i].flag[Math.floor(visT*4)%2];ctx.drawImage(fs,sx-(a.facing>0?9:-1),sy-38)}
  const fr=a.atkT>0?a.spr.atk:(a.moving&&Math.floor(a.walkT*7)%2?a.spr.walk:a.spr.idle);
  const bob=a.moving&&Math.floor(a.walkT*7)%2?-1:0;
  if(a.facing<0){ctx.save();ctx.translate(sx,0);ctx.scale(-1,1);ctx.drawImage(fr,-11,sy-22+bob);ctx.restore()}else ctx.drawImage(fr,sx-11,sy-22+bob);
  if(a.hp<a.maxHp-0.5&&a!==watched)hpBar(sx,sy-25,a.hp/a.maxHp,a.hp/a.maxHp>0.5?'#74c96b':a.hp/a.maxHp>0.25?'#e9b04b':'#e75a4c');
}
function drawMonster(m,sx,sy){
  sx=Math.round(sx);sy=Math.round(sy);const fr=Math.floor(m.animT*(m.moving?6:2.5))%2;
  const s=m.type==='slime'?(m.purple?monsterSprites.rslime:monsterSprites.slime)[fr]:monsterSprites[m.type][fr];
  ctx.fillStyle='rgba(10,8,6,.3)';const sw=m.type==='golem'?12:m.type==='wolf'?9:6;ctx.fillRect(sx-sw,sy-1,sw*2,2);
  const w=s.width,h=s.height,lift=m.type==='wraith'?4+Math.round(Math.sin(m.animT*3)*1.5):0;
  if(m.facing<0){ctx.save();ctx.translate(sx,0);ctx.scale(-1,1);ctx.drawImage(s,-Math.round(w/2),sy-h+1-lift);ctx.restore()}else ctx.drawImage(s,sx-Math.round(w/2),sy-h+1-lift);
  if(m.hp<m.maxHp-0.5)hpBar(sx,sy-h-4-lift,m.hp/m.maxHp,'#e75a4c',m.type==='golem'?18:12);
}
function rr(x,y,w,h){ctx.beginPath();ctx.rect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function tag(x,y,text,color,big,icon){
  ctx.font=`600 ${big?11:10}px "Chakra Petch", sans-serif`;const t=(icon?icon+' ':'')+text;const w=ctx.measureText(t).width+12;
  ctx.fillStyle='rgba(14,12,10,.82)';rr(x-w/2,y-12,w,15);ctx.fill();ctx.fillStyle=color;ctx.fillRect(Math.round(x-w/2),Math.round(y-12),2,15);
  ctx.fillStyle='#ece6da';ctx.textAlign='center';ctx.fillText(t,Math.round(x+1),Math.round(y-1));
}
function bubble(x,y,text){
  ctx.font='500 11px "Chakra Petch", sans-serif';const w=Math.min(200,ctx.measureText(text).width+14);
  ctx.fillStyle='#f3ecdf';rr(x-w/2,y-16,w,17);ctx.fill();ctx.fillRect(Math.round(x-3),Math.round(y+1),6,2);ctx.fillRect(Math.round(x-1),Math.round(y+3),2,2);
  ctx.fillStyle='#1a1412';ctx.textAlign='center';ctx.fillText(text,Math.round(x),Math.round(y-4),w-10);
}
function plate(x,y,a,b,color){
  ctx.font='700 12px "Chakra Petch", sans-serif';const w1=ctx.measureText(a).width;ctx.font='600 9px "Chakra Petch", sans-serif';const w2=ctx.measureText(b).width;const w=Math.max(w1,w2)+20;
  ctx.fillStyle='rgba(9,22,22,.91)';rr(x-w/2,y-16,w,30);ctx.fill();
  ctx.strokeStyle='rgba(241,232,202,.36)';ctx.lineWidth=1;ctx.strokeRect(Math.round(x-w/2)+.5,Math.round(y-16)+.5,Math.round(w)-1,29);
  ctx.fillStyle=color;ctx.fillRect(Math.round(x-w/2),Math.round(y+12),Math.round(w),2);
  ctx.textAlign='center';ctx.fillStyle='#ece6da';ctx.font='700 12px "Chakra Petch", sans-serif';ctx.fillText(a,Math.round(x),Math.round(y-2));
  ctx.fillStyle=color;ctx.font='600 9px "Chakra Petch", sans-serif';ctx.fillText(b,Math.round(x),Math.round(y+9));
}
function card(a,x,y){
  const act=(a.task?a.task.label:'idle').toUpperCase();
  ctx.font='700 13px "Chakra Petch", sans-serif';const w1=ctx.measureText(a.name).width;ctx.font='600 9px "Chakra Petch", sans-serif';const w2=ctx.measureText(act).width;
  const w=Math.max(w1,w2)+52,h=38,cx=Math.round(x+14),cy=Math.round(y-44);
  ctx.fillStyle='rgba(14,12,10,.9)';rr(cx,cy,w,h);ctx.fill();ctx.strokeStyle='#3d3934';ctx.lineWidth=1;ctx.strokeRect(cx+.5,cy+.5,w-1,h-1);
  ctx.fillStyle=TEAMS[a.team].color;ctx.fillRect(cx,cy,2,h);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(a.portraitC,cx+5,cy+5,28,28);
  ctx.textAlign='left';ctx.fillStyle='#ece6da';ctx.font='700 13px "Chakra Petch", sans-serif';ctx.fillText(a.name,cx+39,cy+15);
  ctx.fillStyle=a.task&&(a.task.type==='duel'||a.task.type==='hunt')?'#ef7a6c':'#e9b04b';ctx.font='600 9px "Chakra Petch", sans-serif';ctx.fillText(act,cx+39,cy+26,w-44);
  const f=a.hp/a.maxHp;ctx.fillStyle='#26231f';ctx.fillRect(cx+39,cy+30,w-45,3);ctx.fillStyle=f>0.5?'#74c96b':f>0.25?'#e9b04b':'#e75a4c';ctx.fillRect(cx+39,cy+30,Math.round((w-45)*f),3);
  ctx.fillStyle='rgba(14,12,10,.9)';ctx.fillRect(Math.round(x+4),Math.round(y-8),10,1);
}
function renderMini(){
  const W=mini.width,H=mini.height;if(!W||!H)return;
  if(!miniBase||miniBase.width!==W){miniBase=document.createElement('canvas');miniBase.width=W;miniBase.height=H;const g=miniBase.getContext('2d');g.imageSmoothingEnabled=true;g.fillStyle='#1e4a72';g.fillRect(0,0,W,H);g.drawImage(terrainC,0,0,W,H)}
  mctx.setTransform(1,0,0,1,0,0);mctx.drawImage(miniBase,0,0);
  const sx=W/WORLD_W,sy=H/WORLD_H,d=DPR();
  for(const b of bases){mctx.fillStyle=b.color;mctx.fillRect(isoX(b.cx+.5,b.cy+.5)*sx-3*d,isoY(b.cx+.5,b.cy+.5)*sy-3*d,6*d,6*d)}
  for(const m of monsters){mctx.fillStyle=m.purple?'#a093f4':'#2a0f0c';mctx.fillRect(isoX(m.x,m.y)*sx-d,isoY(m.x,m.y)*sy-d,2*d,2*d)}
  for(const a of agents){if(a.dead)continue;mctx.fillStyle=a===watched?'#ffffff':TEAMS[a.team].color;mctx.fillRect(isoX(a.x,a.y)*sx-1.5*d,isoY(a.x,a.y)*sy-1.5*d,3*d,3*d)}
  if(rift){mctx.strokeStyle='#c9a8ff';mctx.lineWidth=d;mctx.strokeRect(isoX(rift.x,rift.y)*sx-4*d,isoY(rift.x,rift.y)*sy-4*d,8*d,8*d)}
  const V=view();mctx.strokeStyle='rgba(255,255,255,.85)';mctx.lineWidth=d;mctx.strokeRect(V.x0*sx,V.y0*sy,(V.x1-V.x0)*sx,(V.y1-V.y0)*sy);
}

/* ================= UI ================= */
const $=id=>document.getElementById(id);
function watch(a,keepFollow){watched=a;if(!keepFollow)follow=true;$('bFollow').classList.toggle('on',follow);renderUI(true)}
const roleName=r=>r[0].toUpperCase()+r.slice(1);
function segBar(v,col){let s='';const n=Math.round(v/10);for(let i=0;i<10;i++)s+=`<i style="${i<n?`background:${col}`:''}"></i>`;return`<div class="seg">${s}</div>`}
function renderWatch(){
  const a=watched;if(!a){$('watch').innerHTML='';return}
  const b=bases[a.team],T=TEAMS[a.team],f=a.hp/a.maxHp;
  const actCol=a.dead?'var(--bad)':a.task&&(a.task.type==='duel'||a.task.type==='hunt')?'#ef7a6c':'var(--amber)';
  const act=a.dead?`Respawning in ${Math.ceil(a.respawnT)}s`:a.task?a.task.label:'thinking';
  let h=`<div class="wh"><span class="lbl">Watching</span><span class="nav"><button id="prevA" aria-label="Previous agent">◀</button><button id="nextA" aria-label="Next agent">▶</button></span></div>
  <div class="idrow"><img class="pt" src="${a.portrait}" alt="">
   <div><div class="nm">${esc(a.name)}</div>
   <div class="sub"><span><i style="background:${T.color}"></i>${b.name}</span><span>LV ${a.lvl}</span><span style="color:var(--fg)">${roleName(a.role)}</span>${a.captain?'<span style="color:var(--amber)">★ Captain</span>':''}</div>
   <div class="act" style="color:${actCol}">${a.dead?'✝':'⚔'} ${esc(act[0].toUpperCase()+act.slice(1))}</div>
   <div class="sub" style="margin-top:3px">Life ${a.deaths+1} · ${a.goalsDone} goal${a.goalsDone===1?'':'s'} fulfilled</div></div></div>
  <div class="sec" style="border:none;padding-top:8px;margin-top:4px"><div class="row2"><span class="lbl">Health</span><span class="mono">${Math.round(a.hp)}/${a.maxHp}</span></div><div class="bar"><i style="width:${(f*100).toFixed(1)}%;background:${f>0.5?'var(--good)':f>0.25?'var(--amber)':'var(--bad)'}"></i></div>
  <div class="chips"><span class="chip${a.equip.sword?'':' dim'}">Sword ${a.equip.sword}</span><span class="chip${a.equip.plate?'':' dim'}">Plate ${a.equip.plate}</span><span class="chip${a.equip.boots?'':' dim'}">Boots ${a.equip.boots}</span><span class="chip ${a.tonics?'good':'dim'}">Tonic ×${a.tonics}</span><span class="chip gold">${a.px} PX</span>${a.flag?`<span class="chip gold">⚑ ${bases[a.flag.i].name}</span>`:''}</div></div>
  <div class="stats3"><div><b>${a.pxEarned.toLocaleString('en-US')}</b><small>PX earned</small></div><div><b>${a.kills}</b><small>Kills</small></div><div><b>${a.duels}</b><small>Duels won</small></div></div>
  <div class="tabs" role="tablist"><button data-tab="mind" class="${tab==='mind'?'on':''}">Mind &amp; bonds</button><button data-tab="life" class="${tab==='life'?'on':''}">Life log · ${a.life.length}</button></div>`;
  if(tab==='life'){
    h+=`<div class="life">${a.life.map(e=>`<div><span class="d">DAY ${e.d}</span><span>${e.i}</span><span>${esc(e.t)}</span></div>`).join('')||'<p class="muted">Nothing yet.</p>'}</div>`;
  }else{
    const g=a.goal;
    h+=`<div class="sec" style="border:none"><div class="sh amber">◈ Life goal</div><div class="row2"><span>${esc(g.t)}</span><span class="mono muted">${Math.min(g.p,g.n)}/${g.n}</span></div><div class="bar thin"><i style="width:${Math.min(100,g.p/g.n*100)}%;background:var(--amber)"></i></div>
      ${a.quote?`<div><span class="chip" style="margin-right:6px">Today: ${a.role}</span><span class="quote">“${esc(a.quote)}”</span></div>`:''}</div>`;
    const tags=[];if(a.rep.bravery>=60)tags.push(['Brave','good']);if(a.rep.bravery<15&&day>2)tags.push(['Timid','bad']);if(a.rep.generosity>=55)tags.push(['Generous','good']);if(a.rep.teamwork>=55)tags.push(['Loyal','good']);if(a.duels>=4)tags.push(['Ruthless','bad']);if(a.ds.robbed)tags.push(['Robbed','bad']);
    h+=`<div class="sec"><div class="sh teal">◇ Reputation</div>${[['Bravery','bravery','#e8a07a'],['Generosity','generosity','#74c96b'],['Teamwork','teamwork','#5fc9c0']].map(([n,k,c])=>`<div class="rep"><span>${n}</span><div class="bar"><i style="width:${Math.round(a.rep[k])}%;background:${c}"></i></div><span class="mono">${Math.round(a.rep[k])}</span></div>`).join('')}
      ${tags.length?`<div class="chips">${tags.map(([t,c])=>`<span class="chip ${c}">${t}</span>`).join('')}</div>`:''}</div>`;
    if(a.lessons.length)h+=`<div class="sec"><div class="sh green">★ Lessons</div><div class="chips">${[...new Set(a.lessons.map(l=>l.tag))].map(t=>`<span class="chip bad">${esc(t)}</span>`).join('')}</div><ul class="lst">${a.lessons.slice(0,3).map(l=>`<li>· ${esc(l.t)}</li>`).join('')}</ul></div>`;
    h+=`<div class="sec"><div class="sh amber">❝ Heard</div>${a.heard.length?`<ul class="lst heard">${a.heard.map(x=>`<li><b style="color:${TEAMS[x.team].color}">${esc(x.who)}</b>: “${esc(x.text)}”</li>`).join('')}</ul>`:'<p class="muted" style="margin:0;font-size:12px">Quiet so far.</p>'}</div>`;
    const m=a.mind;let mem='';
    const gr=[...a.grudges.entries()].sort((p,q)=>q[1]-p[1])[0];
    if(gr)mem=`Fell to or crossed ${agents[gr[0]].name} before. ${agents[gr[0]].name} is on my grudge list.`;else if(a.lessons.length)mem=`${a.lessons[0].t}, so I watch my step.`;else mem='No old scores to settle yet.';
    h+=`<div class="sec"><div class="sh mind">◉ Mind</div>
      <div class="mindline muted">Today: <b style="color:var(--mind)">${a.role}</b> · health ${Math.round(f*100)}% · ${isNight()?'night':'daylight'}</div>
      <div class="mindline muted">From past days: ${esc(mem)}</div>
      <div class="mindline">Chose to <b>${esc(m.choice)}</b> <span class="muted">· ${Math.round(m.conf*100)}% sure</span></div>
      <div class="mindline" style="color:var(--mind);font-size:11.5px">${esc(m.why)}</div>
      ${m.also.length?`<div class="lbl" style="font-size:9.5px;margin-top:2px">Also weighed</div>${m.also.map(o=>`<div class="weigh"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.label)}</span><div class="bar thin"><i style="width:${Math.round(o.p*100)}%"></i></div><span class="mono">${Math.round(o.p*100)}%</span></div>`).join('')}`:''}</div>`;
    h+=`<div class="sec"><div class="sh">★ Temperament</div>${[['Aggression','aggr','#e8705f'],['Greed','greed','#e2c25a'],['Caution','caution','#5fc9c0'],['Pride','pride','#b08cf0'],['Loyalty','loyalty','#74c96b']].map(([n,k,c])=>{const dlt=a.temp[k]-a.temp0[k];return`<div class="temp"><span>${n}</span>${segBar(a.temp[k],c)}<span class="d" style="color:${dlt>0?'var(--good)':dlt<0?'var(--bad)':'var(--muted)'}">${dlt>0?'▲':dlt<0?'▼':''}${a.temp[k]}</span></div>`}).join('')}</div>`;
    const fr=[...a.friends.entries()].sort((p,q)=>q[1]-p[1]).slice(0,6).map(([id])=>agents[id]);
    const grs=[...a.grudges.entries()].sort((p,q)=>q[1]-p[1]).slice(0,6).map(([id])=>agents[id]);
    h+=`<div class="sec"><div class="sh green">♥ Bonds</div>
      <div class="bonds"><span class="lbl">Friends</span><div class="faces">${fr.length?fr.map(o=>`<img src="${o.portrait}" data-w="${o.id}" title="${esc(o.name)}" alt="${esc(o.name)}">`).join(''):'<span class="muted" style="font-size:12px">None yet</span>'}</div></div>
      <div class="bonds"><span class="lbl">Grudges</span><div class="faces">${grs.length?grs.map(o=>`<img class="gr" src="${o.portrait}" data-w="${o.id}" title="${esc(o.name)}" alt="${esc(o.name)}">`).join(''):'<span class="muted" style="font-size:12px">None yet</span>'}</div></div></div>`;
  }
  $('watch').innerHTML=h;
}
function renderRight(){
  let h=`<section class="card"><div class="lbl" style="margin-bottom:4px">Teams · first to 3 flags</div>`;
  for(const b of bases){const cap=agents.find(a=>a.team===b.i&&a.captain);const al=[...b.allies].map(i=>bases[i].name);
    h+=`<div class="team"><div class="tn"><i style="background:${b.color}"></i>${b.name}<span class="pips">${[0,1,2].map(i=>`<span style="${i<b.captures?`background:${b.color};border-color:${b.color}`:''}"></span>`).join('')}</span></div>
    <div class="plan">${esc(b.plan||'Settling in')}</div>
    <div class="rs"><span>Wood ${Math.floor(b.res.wood)}</span><span>Stone ${Math.floor(b.res.stone)}</span><span>Food ${Math.floor(b.res.food)}</span></div>
    <div class="rs"><span>Towers ${b.towers.length}/3</span><span>Forge ${b.forge}</span><span>Hall ${b.hall}</span>${cap?`<span>★ ${esc(cap.name)}</span>`:''}</div>
    ${al.length?`<div class="chips"><span class="chip" style="color:var(--mind);border-color:#4a4380">Allied with ${al.join(', ')}</span></div>`:''}
    ${b.flag.carrier?`<div class="chips"><span class="chip bad">⚑ Flag carried by ${esc(b.flag.carrier.name)}</span></div>`:b.flag.dropped?`<div class="chips"><span class="chip bad">⚑ Flag dropped</span></div>`:''}</div>`}
  h+=`</section><section class="card"><div class="lbl">Top PX</div><div class="lb">`;
  agents.slice().sort((p,q)=>q.pxEarned-p.pxEarned).slice(0,10).forEach((a,i)=>{h+=`<button data-w="${a.id}" class="${a===watched?'on':''}"><span class="rk">${i+1}</span><img src="${a.portrait}" alt=""><span class="n">${esc(a.name)}<small style="color:${TEAMS[a.team].color}">${bases[a.team].name} · ${a.dead?'fallen':a.role}</small></span><span class="v">${a.pxEarned.toLocaleString('en-US')}</span></button>`});
  h+=`</div></section>`;
  $('right').innerHTML=h;
}
let lastFeedLen=-1;
function renderFeed(){
  if(feedN===lastFeedLen)return;lastFeedLen=feedN;
  const el=$('fl');const atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<20;
  el.innerHTML=feed.slice(feedOpen?-60:-12).map(f=>`<div><span class="t">${f.t}</span><span class="${f.cls}">${esc(f.text)}</span></div>`).join('');
  if(atBottom||true)el.scrollTop=el.scrollHeight;
}
function renderTop(){
  $('chipbar').innerHTML=`<span class="tchip">Season <b>${season}</b></span><span class="tchip">${phase()} · Day <b>${day}</b> · <b>${clock()}</b></span>`+bases.map(b=>`<span class="tchip"><i style="background:${b.color}"></i>${b.name} <b>${b.captures}/3</b></span>`).join('');
  const show=time-banner.t<14;
  $('banner').innerHTML=(show?`<div class="bx"><div class="when">${phase()==='Dawn'||banner.title.startsWith('Dawn')?'☀ ':''}${esc(banner.title.toUpperCase())}</div><div class="sum">${esc(banner.text)}</div></div>`:'')+
    (time-headline.t<12?`<div class="head"><small>${esc(headline.tag.toUpperCase())}</small>${esc(headline.text)}</div>`:'');
  $('miniLbl').textContent=`${agents.filter(a=>!a.dead).length} agents · ${monsters.length} monsters`;
}
function renderUI(force){renderTop();renderWatch();renderRight();renderFeed()}

/* ================= input ================= */
let drag=null;
cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,cx:cam.x,cy:cam.y,moved:false};cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>4){drag.moved=true;cv.classList.add('drag');if(follow){follow=false;$('bFollow').classList.remove('on')}}if(drag.moved){const z=ZOOMS[zi];cam.x=drag.cx-dx/z;cam.y=drag.cy-dy/z}});
cv.addEventListener('pointerup',e=>{cv.classList.remove('drag');if(drag&&!drag.moved){const r=cv.getBoundingClientRect(),V=view();const wx=((e.clientX-r.left)*V.d-V.ox)/V.ds,wy=((e.clientY-r.top)*V.d-V.oy)/V.ds;let best=null,bd=14;for(const a of agents){if(a.dead)continue;const d=Math.hypot(isoX(a.x,a.y)-wx,isoY(a.x,a.y)-10-wy);if(d<bd){bd=d;best=a}}if(best)watch(best)}drag=null});
cv.addEventListener('wheel',e=>{e.preventDefault();zi=clamp(zi+(e.deltaY<0?1:-1),0,ZOOMS.length-1)},{passive:false});
mini.addEventListener('click',e=>{const r=mini.getBoundingClientRect();cam.x=(e.clientX-r.left)/r.width*WORLD_W;cam.y=(e.clientY-r.top)/r.height*WORLD_H;follow=false;$('bFollow').classList.remove('on')});
$('watch').addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;renderWatch();return}const w=e.target.closest('[data-w]');if(w){watch(agents[+w.dataset.w]);return}
  if(e.target.id==='prevA'||e.target.id==='nextA'){const i=agents.indexOf(watched),n=agents.length;watch(agents[(i+(e.target.id==='nextA'?1:n-1))%n])}});
$('right').addEventListener('click',e=>{const w=e.target.closest('[data-w]');if(w)watch(agents[+w.dataset.w])});
$('bPause').onclick=()=>{paused=!paused;$('bPause').textContent=paused?'Play':'Pause';$('bPause').classList.toggle('on',paused)};
document.querySelectorAll('button[data-sp]').forEach(b=>b.onclick=()=>{speed=+b.dataset.sp;document.querySelectorAll('button[data-sp]').forEach(o=>o.classList.toggle('on',o===b))});
$('bFollow').onclick=()=>{follow=!follow;$('bFollow').classList.toggle('on',follow)};
$('bDirector').onclick=()=>{director=!director;$('bDirector').classList.toggle('on',director)};
const setWorldFocus=on=>{
  $('stage').classList.toggle('focus-world',on);
  $('bFocus').textContent=on?'Show HUD':'Focus world';
  $('bFocus').setAttribute('aria-pressed',String(on));
  resize();
};
$('bFocus').onclick=()=>setWorldFocus(!$('stage').classList.contains('focus-world'));
$('bIn').onclick=()=>{zi=Math.min(ZOOMS.length-1,zi+1)};$('bOut').onclick=()=>{zi=Math.max(0,zi-1)};
$('bNew').onclick=()=>newWorld((Math.random()*1e9)|0);
$('feedT').onclick=()=>{feedOpen=!feedOpen;$('feed').classList.toggle('open',feedOpen);$('feedT').textContent=feedOpen?'Collapse':'Expand';lastFeedLen=-1;renderFeed()};
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const z=ZOOMS[zi],st=40/z;
  if(e.key==='Escape'&&$('stage').classList.contains('focus-world')){setWorldFocus(false);return}
  if(e.key==='f'||e.key==='F'){setWorldFocus(!$('stage').classList.contains('focus-world'));return}
  if(['ArrowLeft','a','A'].includes(e.key)){cam.x-=st;follow=false}else if(['ArrowRight','d','D'].includes(e.key)){cam.x+=st;follow=false}else if(['ArrowUp','w','W'].includes(e.key)){cam.y-=st;follow=false}else if(['ArrowDown','s','S'].includes(e.key)){cam.y+=st;follow=false}
  else if(e.key==='+'||e.key==='=')zi=Math.min(ZOOMS.length-1,zi+1);else if(e.key==='-')zi=Math.max(0,zi-1);else if(e.key===' '&&e.target===document.body){e.preventDefault();$('bPause').click()}
  else if(e.key===']'||e.key==='['){const i=agents.indexOf(watched),n=agents.length;watch(agents[(i+(e.key===']'?1:n-1))%n])}else return;
  $('bFollow').classList.toggle('on',follow)});
new ResizeObserver(resize).observe($('viewport'));

/* ================= boot ================= */
function newWorld(sd){
  genWorld(sd);
  agents=[];monsters=[];projs=[];floaters=[];graves=[];feed=[];smokes=[];rift=null;riftT=DAY*0.35;spawnT=0;time=DAY*0.02;day=1;season=1;daily=daily0();banner={t:-99,title:'',text:''};headline={t:-99,tag:'',text:''};seasonEnd=null;lastDirect=-99;
  const used=new Set();
  for(let t=0;t<3;t++){const team=[];for(let k=0;k<5;k++){const a=makeAgent(t,used);agents.push(a);team.push(a)}const cap=team.slice().sort((p,q)=>(q.temp.pride+q.temp.loyalty)-(p.temp.pride+p.temp.loyalty))[0];cap.captain=true;}
  for(const a of agents){charSprites(a);makePortrait(a);lifeLog(a,'◆',`Arrived at ${bases[a.team].name}`)}
  statics.sort((p,q)=>p.key-q.key);
  terrainC=renderTerrain();miniBase=null;
  for(let k=0;k<14;k++){const p=wildTile();if(p)spawnMonster(R()<0.4?'wolf':R()<0.1?'golem':'slime',p[0],p[1])}
  for(const b of bases)captainThink(b);
  feedPush('Three outposts wake on the island. First team to three captured flags wins the season.','c-gold');
  banner={t:time,title:'Dawn · Day 1',text:'Emberhold, Tidewatch and Sunreach each start with five agents and a flag to defend.'};
  // warm up so the world opens mid-action
  for(let k=0;k<Math.round(25/SIM_DT);k++)step(SIM_DT);
  floaters=[];
  watched=agents.find(a=>a.captain)||agents[0];follow=true;$('bFollow').classList.add('on');
  cam.x=isoX(watched.x,watched.y);cam.y=isoY(watched.x,watched.y)-12+112/ZOOMS[zi];
  applyLinkedCaptain();
  lastFeedLen=-1;renderUI(true);
}
function applyLinkedCaptain(){
  if(!linkedCaptain||!agents?.length)return;
  for(const a of agents)if(a.linkedOriginalName){a.name=a.linkedOriginalName;delete a.linkedOriginalName}
  const a=agents.find(a=>a.captain&&a.team===linkedCaptain.faction);
  if(!a)return;
  a.linkedOriginalName=a.name;a.name=linkedCaptain.name;
  watched=a;follow=true;$('bFollow').classList.add('on');
  cam.x=isoX(a.x,a.y);cam.y=isoY(a.x,a.y)-12+112/ZOOMS[zi];
  lastFeedLen=-1;renderUI(true);
}
window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!=='OUTPOST_CAPTAIN')return;
  const name=e.data.name,faction=e.data.faction;
  if(typeof name!=='string'||name.length<2||name.length>24||!/^[\w \-']+$/.test(name)||!Number.isInteger(faction)||faction<0||faction>2)return;
  linkedCaptain={name,faction};applyLinkedCaptain();
});
buildSprites();buildTeamSprites();buildMonsters();
if(window.innerWidth<900)zi=1;
resize();newWorld(20261013);
let last=0,acc=0,uiT=0;
function frame(ts){
  const rdt=Math.min(0.1,last?(ts-last)/1000:0);last=ts;visT+=rdt;
  if(!paused){acc+=rdt*speed;let n=0;while(acc>=SIM_DT&&n<30){step(SIM_DT);acc-=SIM_DT;n++}if(n>=30)acc=0}
  for(const f of floaters)f.t+=rdt*Math.max(1,speed*0.6);floaters=floaters.filter(f=>f.t<1.1);
  if(follow&&watched&&!watched.dead){const tx=isoX(watched.x,watched.y),ty=isoY(watched.x,watched.y)-12+112/ZOOMS[zi];const k=Math.min(1,rdt*5);cam.x+=(tx-cam.x)*k;cam.y+=(ty-cam.y)*k}
  cam.x=clamp(cam.x,0,WORLD_W);cam.y=clamp(cam.y,0,WORLD_H);
  render();
  uiT-=rdt;if(uiT<=0){uiT=0.35;renderUI();renderMini()}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
})();
