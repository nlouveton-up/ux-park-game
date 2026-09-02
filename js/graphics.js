/* ================= graphic layer =================
   Everything that turns the simulation into pixels: the isometric canvas,
   the ground, the buildings, the moving pieces. Reads game-logic state to
   draw it; never mutates it (selection and labels are its own view state). */
import { GRID, CX, CY, R_RING, R_GATE, TW, TH, ZH, REDUCED, N_ST, IDX_CADRAGE, IDX_TEST } from "./config.js";
import { polar, stAngle } from "./geometry.js";
import { stations, GATES, packages, users, particles, rocket, selected, t, satisfaction } from "./game-logic.js";

/* ---------------- view state ----------------
   Display preferences the player toggles; they affect only what is drawn. */
let showLabels = true;
export function toggleLabels(){ showLabels = !showLabels; return showLabels; }

/* ---------------- canvas & projection ---------------- */
const cvs = document.getElementById("c"), ctx = cvs.getContext("2d");
let scale = 1, ox = 0, oy = 0, W = 900, H = 560, dpr = 1;

export function resize(){
  const box = cvs.parentElement.getBoundingClientRect();
  W = Math.max(300, Math.round(box.width));
  H = Math.round(Math.max(360, Math.min(680, W * 0.68)));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cvs.width = W*dpr; cvs.height = H*dpr; cvs.style.height = H+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  scale = Math.max(0.38, Math.min(W/(GRID*TW*2), H/(GRID*TH*2+180)) * 1.72);
  ox = W/2; oy = H/2 - (CX+CY)*TH*scale + 30;
}
const iso = (x,y,z) => [ ox + (x-y)*TW*scale, oy + (x+y)*TH*scale - (z||0)*ZH*scale ];

/* High-level hit test: which station, if any, sits under a client-space
   point. Keeps the canvas element itself out of the UI layer. */
export function onStationClick(handler){
  cvs.addEventListener("click", e => {
    const r = cvs.getBoundingClientRect(), mx = e.clientX-r.left, my = e.clientY-r.top;
    let best = -1, bd = 1e9;
    stations.forEach(s => { const p = iso(s.x,s.y,1.2), d = Math.hypot(p[0]-mx,p[1]-my); if (d<bd){ bd=d; best=s.i; } });
    if (best>=0 && bd<68*scale) handler(best);
  });
}

function poly(pts, fill){
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function shade(hex,k){
  const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  if (k>=0){ r+=(255-r)*k; g+=(255-g)*k; b+=(255-b)*k; } else { r*=(1+k); g*=(1+k); b*=(1+k); }
  return "rgb("+(r|0)+","+(g|0)+","+(b|0)+")";
}
function mix(a,b,k){
  const A=parseInt(a.slice(1),16), B=parseInt(b.slice(1),16);
  const r=((A>>16&255)*(1-k)+(B>>16&255)*k)|0, g=((A>>8&255)*(1-k)+(B>>8&255)*k)|0, bl=((A&255)*(1-k)+(B&255)*k)|0;
  return "#"+((1<<24)+(r<<16)+(g<<8)+bl).toString(16).slice(1);
}
function hash(x,y){ let h=x*374761393+y*668265263; h=(h^(h>>13))*1274126177; return ((h^(h>>16))>>>0)/4294967296; }
/* Ring colour: delivered satisfaction, from harmful to beneficial.
   The viewer sees the truth the team has to estimate. */
const effColor = v => v < -0.15 ? "#E85D4E" : v < 0.05 ? "#8A939A"
                    : v < 0.35 ? "#C9A24A" : v < 0.6 ? "#7FB05A" : "#4FC08D";
const USER_COLOR = "#8FB3C4";

/* double diamond: pinched at stations, widest mid-segment */
function halfWidth(deg){
  const seg = 360 / N_ST;
  const a = ((deg - 270) % seg + seg) % seg;
  const d = Math.min(a, seg - a) / (seg/2);
  return (0.62 + 1.30 * Math.sin(Math.PI * d / 2)) / 2;
}

/* Where a package sits in world space right now — a drawing concern only
   (z-order and screen position), not part of the simulation's own state. */
function packagePos(p){
  if (p.phase==="work" || p.phase==="wait"){
    const s = stations[p.st];
    return [s.x + p.lane*0.55, s.y + p.lane*0.55];
  }
  if (p.phase==="drop"){ const st = stations[IDX_CADRAGE]; return [st.x + p.lane*0.55, st.y + p.lane*0.55]; }
  if (p.phase==="ring") return polar(R_RING + p.lane, 270 + p.u*360);
  if (p.phase==="toPad"){
    const a=stations[IDX_TEST];
    const tx = CX + p.lane*0.75, ty = CY + p.lane*0.75;
    return [a.x + (tx-a.x)*p.u, a.y + (ty-a.y)*p.u];
  }
  return [CX,CY];
}

/* ================= ground ================= */
const GRASS = ["#79A857","#6F9E4E","#83B061","#719F52","#7CAB5B"];
const PATHC = ["#DCC9A2","#D4C098","#E1D0AB"];
let tiles = [];
function distToSpoke(px,py,deg,r0,r1){
  const [ax,ay]=polar(r0,deg), [bx,by]=polar(r1,deg);
  const dx=bx-ax, dy=by-ay, L=dx*dx+dy*dy;
  let s=((px-ax)*dx+(py-ay)*dy)/L; s=Math.max(0,Math.min(1,s));
  return Math.hypot(px-(ax+dx*s), py-(ay+dy*s));
}
export function buildGround(){
  tiles=[];
  for (let x=0;x<GRID;x++){
    tiles[x]=[];
    for (let y=0;y<GRID;y++){
      const px=x+.5, py=y+.5, dx=px-CX, dy=py-CY, r=Math.hypot(dx,dy);
      let deg=Math.atan2(dy,dx)*180/Math.PI; if (deg<0) deg+=360;
      let t="grass", c=GRASS[(hash(x,y)*GRASS.length)|0];
      if (Math.abs(r-R_RING) < halfWidth(deg)){ t="path"; c=PATHC[(hash(x,y)*3)|0]; }
      if (t==="grass" && r < 2.2){ t="pad"; c=hash(x,y)>.5?"#C4C7C0":"#BCC0B9"; }
      if (t==="grass"){
        for (const g of GATES) if (distToSpoke(px,py,g.deg,R_RING,R_GATE) < 0.55){ t="gate"; c="#D2C3A2"; }
      }
      if (t==="grass" && distToSpoke(px,py,stAngle(IDX_TEST),2.2,R_RING) < 0.5){ t="launch"; c="#C8D2D6"; }
      let prop=null;
      if (t==="grass" && r>2.6 && r<R_GATE-0.6){
        const h=hash(x*7+3,y*13+5);
        if (h>.915) prop={kind:"tree",v:hash(x,y+99)};
        else if (h>.888) prop={kind:"bush",v:hash(x+5,y)};
      }
      tiles[x][y]={t,c,prop};
    }
  }
}

/* ================= primitives ================= */
function box(x,y,z,w,d,h,col){
  poly([iso(x,y,z+h),iso(x+w,y,z+h),iso(x+w,y+d,z+h),iso(x,y+d,z+h)], shade(col,.13));
  poly([iso(x,y+d,z+h),iso(x+w,y+d,z+h),iso(x+w,y+d,z),iso(x,y+d,z)], shade(col,-.16));
  poly([iso(x+w,y,z+h),iso(x+w,y+d,z+h),iso(x+w,y+d,z),iso(x+w,y,z)], shade(col,-.34));
}
function roof(x,y,z,w,d,h,col){
  const my=y+d/2;
  poly([iso(x,y,z),iso(x+w,y,z),iso(x+w,my,z+h),iso(x,my,z+h)], shade(col,.14));
  poly([iso(x,y+d,z),iso(x+w,y+d,z),iso(x+w,my,z+h),iso(x,my,z+h)], shade(col,-.2));
}
function cone(x,y,z,r,h,col){
  const segs=8, ap=iso(x,y,z+h);
  for (let i=0;i<segs;i++){
    const a1=i/segs*6.283, a2=(i+1)/segs*6.283;
    poly([ap, iso(x+r*Math.cos(a1),y+r*Math.sin(a1),z), iso(x+r*Math.cos(a2),y+r*Math.sin(a2),z)],
         shade(col,.18-.42*((Math.sin((a1+a2)/2-.8)+1)/2)));
  }
}
function cyl(x,y,z,r,h,col){
  const segs=8, cap=[];
  for (let i=0;i<segs;i++){
    const a1=i/segs*6.283, a2=(i+1)/segs*6.283;
    poly([iso(x+r*Math.cos(a1),y+r*Math.sin(a1),z+h), iso(x+r*Math.cos(a2),y+r*Math.sin(a2),z+h),
          iso(x+r*Math.cos(a2),y+r*Math.sin(a2),z), iso(x+r*Math.cos(a1),y+r*Math.sin(a1),z)],
         shade(col,.1-.4*((Math.sin((a1+a2)/2-.8)+1)/2)));
  }
  for (let i=0;i<segs;i++){ const a=i/segs*6.283; cap.push(iso(x+r*Math.cos(a),y+r*Math.sin(a),z+h)); }
  poly(cap, shade(col,.18));
}
function shadowEllipse(x,y,r,alpha){
  const p=iso(x,y,0);
  ctx.beginPath(); ctx.ellipse(p[0],p[1],r*TW*scale,r*TH*scale,0,0,6.283);
  ctx.fillStyle="rgba(20,35,20,"+(alpha||.20)+")"; ctx.fill();
}

/* ================= objects ================= */
function drawRocket(){
  shadowEllipse(CX,CY,1.55,.22);
  cyl(CX,CY,0,1.35,.24,"#B9BDB4");
  for (let k=0;k<3;k++){
    const a=k/3*6.283+0.5;
    box(CX+1.05*Math.cos(a)-.1, CY+1.05*Math.sin(a)-.1, .24,.2,.2,1.5,"#8E969B");
  }
  if (rocket.state==="gone") return;
  const z = rocket.z;
  if (rocket.state==="lift"){
    const fl = 0.6 + Math.abs(Math.sin(t*30))*0.5;
    cone(CX,CY,z+0.05,.42,-fl,"#F0A63C");
    cone(CX,CY,z+0.05,.26,-fl*0.6,"#FBE3A8");
  }
  cyl(CX,CY,z+.24,.44,2.0,"#EFEDE6");
  for (let k=0;k<3;k++){
    const a=k/3*6.283+0.9;
    box(CX+.42*Math.cos(a)-.12, CY+.42*Math.sin(a)-.12, z+.24,.24,.24,.55,"#D34C42");
  }
  cyl(CX,CY,z+2.24,.44,.28,"#3E9BD6");
  cone(CX,CY,z+2.52,.44,.9,"#D34C42");
  if (showLabels && rocket.state==="ready"){
    const p=iso(CX,CY,4.1);
    ctx.font="600 "+Math.max(9,10*scale)+"px 'JetBrains Mono', monospace";
    ctx.fillStyle="#5FC9D6"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText("PRODUCTION", p[0], p[1]);
  }
}
function drawGate(g){
  shadowEllipse(g.x,g.y,.85);
  box(g.x-.85,g.y-.16,0,.34,.34,1.25,"#C9BFA6");
  box(g.x+.5,g.y-.16,0,.34,.34,1.25,"#C9BFA6");
  box(g.x-.9,g.y-.2,1.25,1.8,.42,.22,"#9E9481");
  if (showLabels){
    const p=iso(g.x,g.y,2.1);
    ctx.font="600 "+Math.max(9,10*scale)+"px 'JetBrains Mono', monospace";
    ctx.fillStyle="#9DAFB8"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(g.label, p[0], p[1]);
  }
}
function drawStation(s){
  const total = s.visits + s.skips;
  const neglect = total>3 ? Math.min(.7, s.skips/total) : 0;
  const c = neglect>.05 ? mix(s.color,"#5A6067",neglect) : s.color;
  const bx = s.x-.95, by = s.y-.95;
  shadowEllipse(s.x,s.y,1.5);
  box(bx-.2,by-.2,0,2.3,2.3,.16,"#B9AE93");
  box(bx,by,.16,1.9,1.9,.78,"#EFE9DC");
  roof(bx-.18,by-.18,.94,2.26,2.26,.58,c);
  if (s.pulse>0){
    const p=iso(s.x,s.y,1.9);
    ctx.beginPath();
    ctx.ellipse(p[0],p[1],(1+(1-s.pulse)*2.4)*TW*scale*.8,(1+(1-s.pulse)*2.4)*TH*scale*.8,0,0,6.283);
    ctx.strokeStyle=c; ctx.globalAlpha=s.pulse*.55; ctx.lineWidth=2; ctx.stroke(); ctx.globalAlpha=1;
  }
  const wob = REDUCED?0:Math.sin(t*2+s.i)*.07;
  switch(s.i){
    case 0:
      box(s.x+.35,s.y+.35,1.52,.5,.5,1.05,"#DCD3C0");
      cyl(s.x+.6,s.y+.6,2.57,.34,.4,c);
      { const e=iso(s.x+.6,s.y+.6,3.16);
        ctx.beginPath(); ctx.arc(e[0],e[1],4.2*scale,0,6.283); ctx.fillStyle="#F7F3E9"; ctx.fill();
        ctx.beginPath(); ctx.arc(e[0],e[1],2*scale,0,6.283); ctx.fillStyle="#26333A"; ctx.fill(); }
      break;
    case 1:
      box(s.x+.35,s.y+.35,1.52,.34,.34,1.4,"#E4DCC9");
      cone(s.x+.52,s.y+.52,2.92,.34,.5,c);
      box(s.x-.5,s.y+.38,2.05,.85,.12,.3,c);
      break;
    case 2:
      cone(s.x-.35,s.y-.1,1.55,.52,.95,c);
      cone(s.x+.45,s.y+.3,1.55,.42,.72,shade(c,-.18));
      cone(s.x+.1,s.y+.7,1.55,.34,.55,shade(c,.16));
      break;
    case 3:
      box(s.x-.55,s.y-.55,1.52,.16,.16,1.4,"#9AA3A8");
      box(s.x+.55,s.y-.55,1.52,.16,.16,1.4,"#9AA3A8");
      box(s.x-.55,s.y+.55,1.52,.16,.16,1.4,"#9AA3A8");
      box(s.x-.62,s.y-.62,2.9,1.35,1.35,.1,c);
      box(s.x+.1+wob,s.y-.9,2.5,.1,.8,.1,"#B4BCC0");
      break;
    case 4:
      box(s.x-.55,s.y-.1,1.52,1.1,.7,.62,"#E4DCC9");
      box(s.x-.42,s.y+.05,2.14,.36,.3,.5,shade(c,-.1));
      box(s.x+.1,s.y+.05,2.14,.36,.3,.34,shade(c,.05));
      break;
  }
  if (showLabels){
    const p=iso(s.x,s.y,3.6);
    const txt = String(s.i+1).padStart(2,"0")+"  "+s.name.toUpperCase();
    ctx.font="600 "+Math.max(9,11*Math.min(1.3,scale))+"px 'JetBrains Mono', monospace";
    const w=ctx.measureText(txt).width+14, h=18;
    ctx.fillStyle="rgba(12,18,22,.80)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(p[0]-w/2,p[1]-h,w,h,5); else ctx.rect(p[0]-w/2,p[1]-h,w,h);
    ctx.fill();
    ctx.fillStyle=c; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.fillText(txt,p[0],p[1]-h/2+.5);
  }
}
function drawTree(x,y,v){ shadowEllipse(x,y,.42); cyl(x,y,0,.1,.38,"#8A6A46"); cone(x,y,.34,.44+v*.12,.95+v*.5, v>.5?"#4E8C46":"#5E9B4E"); }
function drawBush(x,y,v){ shadowEllipse(x,y,.3); cone(x,y,0,.32,.42+v*.2,"#619E52"); }
function drawUser(u){
  shadowEllipse(u.x,u.y,.2);
  const moving = u.state==="in"||u.state==="out";
  const bob = (moving && !REDUCED) ? Math.abs(Math.sin(t*8+u.bob))*.07 : 0;
  cyl(u.x,u.y,bob,.13,.32,USER_COLOR);
  const hp=iso(u.x,u.y,.40+bob);
  ctx.beginPath(); ctx.arc(hp[0],hp[1],2.7*scale,0,6.283); ctx.fillStyle="#DCC6A6"; ctx.fill();
  if (u.state==="at" && u.link!==null){
    const st=stations[u.link], a=iso(u.x,u.y,.5), b=iso(st.x,st.y,1.0);
    ctx.save(); ctx.setLineDash([3,3]);
    ctx.strokeStyle=stations[u.link].color; ctx.globalAlpha=.6; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); ctx.restore();
  }
}
function drawPackage(p){
  const [x,y] = packagePos(p);
  const dropping = p.phase==="drop";
  if (dropping) ctx.globalAlpha = Math.max(0, 1 - p.dropT/1.6);
  const moving = p.phase==="ring"||p.phase==="toPad";
  const bob = (moving && !REDUCED) ? Math.abs(Math.sin(t*6+p.spin))*.07
            : dropping ? -0.06*p.dropT : 0;
  shadowEllipse(x,y,.3);
  const w=.58;
  box(x-w/2, y-w/2, bob, w, w, .5, dropping ? "#948C82" : "#C89A62");
  ctx.strokeStyle = dropping ? "#6E6862" : "#9A7345"; ctx.lineWidth=Math.max(1,1.4*scale);
  const a=iso(x-w/2,y,bob+.5), b=iso(x+w/2,y,bob+.5);
  ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
  const c=iso(x,y-w/2,bob+.5), d=iso(x,y+w/2,bob+.5);
  ctx.beginPath(); ctx.moveTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.stroke();
  const fp=iso(x,y,0);
  ctx.beginPath(); ctx.ellipse(fp[0],fp[1],.34*TW*scale,.34*TH*scale,0,0,6.283);
  ctx.strokeStyle=effColor(satisfaction(p)); ctx.lineWidth=Math.max(1.2,1.9*scale);
  ctx.globalAlpha=.9; ctx.stroke(); ctx.globalAlpha=1;
  if (dropping){ ctx.globalAlpha = 1; return; }
  ctx.textAlign="center";
  if (p.phase==="wait"){
    const q=iso(x,y,1.05);
    ctx.font="500 "+Math.max(9,10*scale)+"px 'JetBrains Mono', monospace";
    ctx.fillStyle="rgba(255,255,255,.72)";
    ctx.fillText("waiting", q[0], q[1]);
  } else if (p.iters>0){
    const q=iso(x,y,1.02);
    ctx.font="600 "+Math.max(9,10*scale)+"px 'JetBrains Mono', monospace";
    ctx.fillStyle="#E85D4E";
    ctx.fillText("↺"+p.iters, q[0], q[1]);
  }
}

/* Animated ring under the station whose card is open: it ties the right-hand
   panel explicitly to a building on the map. */
function drawSelectionRing(){
  const st = stations[selected];
  if (!st) return;
  const c = st.color;
  const puls = REDUCED ? 0 : Math.sin(t*2.4);
  const p = iso(st.x, st.y, 0.07);
  /* 2.7 units: outside the building footprint (±1.15) and well within the
     gap between two neighbouring stations (8.2 units of chord). */
  const R = 2.7 + puls*0.10;
  const rx = R * TW * scale;
  const ry = R * TH * scale;

  ctx.save();
  /* halo diffus */
  ctx.globalAlpha = 0.10 + (REDUCED ? 0 : (puls+1)*0.028);
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.ellipse(p[0], p[1], rx, ry, 0, 0, 6.283); ctx.fill();
  /* anneau pointillé tournant */
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(1.9, 2.8 * scale);
  ctx.setLineDash([12, 9]);
  ctx.lineDashOffset = REDUCED ? 0 : -t * 26;
  ctx.beginPath(); ctx.ellipse(p[0], p[1], rx, ry, 0, 0, 6.283); ctx.stroke();
  /* second anneau, plus fin, en sens inverse */
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1.2, 1.5 * scale);
  ctx.setLineDash([5, 13]);
  ctx.lineDashOffset = REDUCED ? 0 : t * 18;
  ctx.beginPath(); ctx.ellipse(p[0], p[1], rx*0.86, ry*0.86, 0, 0, 6.283); ctx.stroke();
  ctx.restore();
}

/* ================= rendering ================= */
export function render(){
  ctx.clearRect(0,0,W,H);
  for (let sum=0; sum<=(GRID-1)*2; sum++){
    for (let x=0;x<GRID;x++){
      const y=sum-x; if (y<0||y>=GRID) continue;
      const tl=tiles[x][y];
      if (Math.hypot(x+.5-CX,y+.5-CY) > 13.4) continue;
      const h = tl.t==="grass" ? 0 : .05;
      poly([iso(x,y,h),iso(x+1,y,h),iso(x+1,y+1,h),iso(x,y+1,h)], tl.c);
      if (tl.t==="path"||tl.t==="gate"||tl.t==="launch"){
        poly([iso(x,y+1,h),iso(x+1,y+1,h),iso(x+1,y+1,0),iso(x,y+1,0)],"#B7A47F");
        poly([iso(x+1,y,h),iso(x+1,y+1,h),iso(x+1,y+1,0),iso(x+1,y,0)],"#AC9873");
      }
    }
  }
  drawSelectionRing();

  const draws=[];
  for (let x=0;x<GRID;x++) for (let y=0;y<GRID;y++){
    const pr=tiles[x][y].prop; if (!pr) continue;
    draws.push({d:x+y, fn:()=> pr.kind==="tree"?drawTree(x+.5,y+.5,pr.v):drawBush(x+.5,y+.5,pr.v)});
  }
  draws.push({ d:CX+CY, fn:drawRocket });
  for (const g of GATES) draws.push({ d:g.x+g.y, fn:()=>drawGate(g) });
  for (const s of stations) draws.push({ d:s.x+s.y, fn:()=>drawStation(s) });
  for (const p of packages){ const [x,y]=packagePos(p); draws.push({ d:x+y+.35, fn:()=>drawPackage(p) }); }
  for (const u of users) draws.push({ d:u.x+u.y+.1, fn:()=>drawUser(u) });
  draws.sort((a,b)=>a.d-b.d);
  for (const it of draws) it.fn();

  ctx.textAlign="center"; ctx.textBaseline="middle";
  for (const p of particles){
    const s=iso(p.x,p.y,p.z);
    ctx.globalAlpha=Math.max(0,Math.min(1,p.life));
    ctx.font="600 "+Math.max(10,12*scale)+"px 'JetBrains Mono', monospace";
    ctx.fillStyle=p.color; ctx.fillText(p.txt,s[0],s[1]); ctx.globalAlpha=1;
  }
}
