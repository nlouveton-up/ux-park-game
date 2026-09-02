/* ================= game logic =================
   The simulation: state, rules, economy. No DOM, no canvas — the graphic
   layer reads this module to draw it, the UI layer reads and drives it. */
import {
  N_ST, IDX_RECH, IDX_CADRAGE, IDX_IDEE, IDX_PROTO, IDX_TEST,
  INITIAL_INV, BUDGET, INITIAL_PRESSURE,
  CAPITAL_START, SPRINT_FIXED, SPRINT_UX, REV_PER_SAT, HARM_MULT,
  SPRINT, WIP_MAX, VULN, CATALOG_SIZE, DIFF_MAX, IDEA_SPREAD, MAX_ITERS,
  VISIT_PERIOD, SESSION, R_RING, R_GATE, CX, CY
} from "./config.js";
import { STAGES, GATE_LABELS } from "./content.js";
import { polar, stAngle } from "./geometry.js";

export { N_ST, IDX_RECH, IDX_CADRAGE, IDX_IDEE, IDX_PROTO, IDX_TEST, CATALOG_SIZE };

/* ---------------- resources & schedule pressure ---------------- */
export let INV = [...INITIAL_INV];        /* resources invested per station */
export const allocated = () => INV.reduce((a, b) => a + b, 0);
export const freeBudget = () => Math.max(0, BUDGET - allocated());

export let PRESSURE = INITIAL_PRESSURE;
export function setPressure(v){ PRESSURE = v; }

/* Schedule pressure makes stations get skipped; investment protects. */
const pSkip = k => Math.min(0.90,
  VULN[k] * Math.pow(1 - INV[k], 1.2) * (0.30 + 1.60 * PRESSURE));

/* ---------------- economy ---------------- */
export let capital = CAPITAL_START, outcome = null;   /* null | "won" | "lost" */

/* ---------------- the product ---------------
   The product holds a fixed list of latent leads, each with a potential
   satisfaction drawn once and for all. Neither the list nor the values are
   known to the team: research uncovers them one at a time.
   A lead with positive potential is a feature; negative, a non-feature. */
export let catalog = [], discovered = 0, optimum = 0;
function buildCatalog(){
  catalog = Array.from({length: CATALOG_SIZE}, () => Math.random()*2 - 1);
  discovered = 0;
  optimum = catalog.reduce((a,v) => a + Math.max(0, v), 0);
}

/* --- Research: sample size ---
   A wider sample surfaces more leads per sprint. The draw stays uniform:
   research does not choose what it finds, it reveals. */
export const sampleSize = () => Math.max(1, Math.round(1 + 4 * INV[IDX_RECH]));

/* --- Framing: filter on potential satisfaction, estimated with error --- */
export const frameNoise = iters => (0.08 + 0.62 * (1 - INV[IDX_CADRAGE])) * Math.pow(0.62, iters);
/* The bar must be genuinely permissive when nothing is invested: otherwise a
   free filter removes the non-features and investment buys nothing. */
export const frameBar = () => -0.45 + 0.75 * INV[IDX_CADRAGE];

/* --- Ideation: differentiation, bonus OR penalty ---
   An ideation session can produce a bad idea. Investing shifts the expected
   value upward without removing the risk: run low, ideation degrades the lead
   more often than it improves it. */
const ideaDelta = () =>
  (-0.10 + 0.32 * INV[IDX_IDEE]) + (Math.random()*2 - 1) * IDEA_SPREAD;

/* --- Prototype: real satisfaction factor, diminishing returns --- */
const protoGain = () => 0.20 + 0.60 * INV[IDX_PROTO];

/* --- Testing: filter on real satisfaction, measured with error --- */
const testNoise = () => 0.04 + 0.46 * (1 - INV[IDX_TEST]);
export const testBar = () => -0.25 + 0.55 * INV[IDX_TEST];

/* gaussian draw (Box-Muller) */
function gauss(sigma){
  let u=0, v=0;
  while (u===0) u = Math.random();
  while (v===0) v = Math.random();
  return sigma * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}

/* ---------------- world layout ----------------
   Stations sit on the ring; the two gates sit further out, on the research
   and testing spokes. Positions are world coordinates (grid units). */
export const stations = STAGES.map((s,i) => {
  const [x,y] = polar(R_RING, stAngle(i));
  return { i, x, y, color:s.color, name:s.name, porte:(i===IDX_RECH||i===IDX_TEST), visits:0, skips:0, pulse:0 };
});
export const GATES = [
  { st:IDX_RECH, deg:stAngle(IDX_RECH), label:GATE_LABELS[0] },
  { st:IDX_TEST, deg:stAngle(IDX_TEST), label:GATE_LABELS[1] }
].map(g => { const [x,y] = polar(R_GATE, g.deg); return { st:g.st, deg:g.deg, label:g.label, x, y }; });

/* ---------------- leads in flight ---------------- */
export let packages = [], users = [], particles = [];
let nextId = 1;
export let stats = { born:0, shipped:0, dropped:0, rejects:0, iterSum:0, sprints:0,
              satSum:0, harmful:0, caught:0, given:0, skips:0, missed:0,
              earned:0, spent:0, harmSum:0 };
export let statsDirty = true;
export function markDirty(){ statsDirty = true; }
export function consumeDirty(){ const d = statsDirty; statsDirty = false; return d; }

let backlog = [], sprintTimer = 0, resources = 0, gateTimers = [0,0];
export { backlog };
export let rocket = { state:"ready", z:0, t:0 };
export let running = true, t = 0;
export function setRunning(on){ running = on; }
export let speed = 1;
export function setSpeed(v){ speed = v; }
export let selected = 0;   /* station whose card is open */
export function setSelectedStage(i){ selected = i; }

/* Called once, when the simulation ends: lets the UI layer present the
   outcome without this module reaching into the DOM. */
let onGameEnd = null;
export function setGameEndHandler(fn){ onGameEnd = fn; }

const DWELL = () => 1.1 * (0.75 + Math.random()*0.5);

function newPackage(pot){
  return { id:nextId++, phase:"ring", st:IDX_RECH, u:0, lane:(Math.random()-.5)*0.9,
           speed:0.100 + Math.random()*0.030,
           /* The three attributes of a lead. The potential is intrinsic and
              invisible to the team; the real factor says how much of it will
              actually be delivered; differentiation is acquired. */
           pot:  pot,
           real: Math.random(),          /* factor in [0,1], drawn at random */
           diff: 0,
           iters:0, dwell:0, spin:Math.random()*6.28 };
}
/* Delivered satisfaction = potential × real factor, plus differentiation. */
export const satisfaction = p => p.pot * p.real + p.diff;

function doStation(p,i){
  if (i===IDX_IDEE)  p.diff = Math.max(-DIFF_MAX, Math.min(DIFF_MAX, p.diff + ideaDelta()));
  if (i===IDX_PROTO) p.real = Math.min(1, p.real + (1 - p.real) * protoGain());
  stations[i].visits++; stations[i].pulse = 1;
}
function skipStation(p,i){
  stations[i].skips++; stats.skips++; statsDirty = true;
  const s = stations[i];
  particles.push({ x:s.x, y:s.y, z:1.15, vz:.85, life:1.1, color:"#E85D4E", txt:"skipped" });
}

/* ================= users ================= */
function spawnVisit(gi){
  const g = GATES[gi], st = stations[g.st];
  const n = 1 + (Math.random()*2|0);
  for (let k=0;k<n;k++){
    users.push({ x:g.x, y:g.y, ex:g.x, ey:g.y, link:g.st, state:"in", t:0,
                 tx: st.x + (Math.random()-.5)*1.5, ty: st.y + (Math.random()-.5)*1.5,
                 bob:Math.random()*6.28 });
  }
}
export const usersAt = i => users.filter(u => u.state==="at" && u.link===i).length;
/* Every sprint drops the leads revealed by the sample into the backlog,
   whether or not the park can absorb them. This is where overload shows. */
function runSprint(){
  stats.sprints++;
  capital -= SPRINT_FIXED + SPRINT_UX * allocated();
  stats.spent += SPRINT_FIXED + SPRINT_UX * allocated();
  const n = Math.min(sampleSize(), CATALOG_SIZE - discovered);
  for (let i=0;i<n;i++) backlog.push(catalog[discovered++]);
  stats.born += n;
  statsDirty = true;
}
function stepUsers(dt){
  for (let gi=0; gi<GATES.length; gi++){
    gateTimers[gi] += dt;
    if (gateTimers[gi] > VISIT_PERIOD){ gateTimers[gi] = 0; spawnVisit(gi); }
  }

  for (let i=users.length-1;i>=0;i--){
    const u = users[i];
    if (u.state==="in" || u.state==="out"){
      const dx=u.tx-u.x, dy=u.ty-u.y, d=Math.hypot(dx,dy);
      if (d<.16){
        u.x=u.tx; u.y=u.ty;
        if (u.state==="in"){ u.state="at"; u.t = SESSION; }
        else users.splice(i,1);
      } else { const sp=2.2*dt; u.x+=dx/d*sp; u.y+=dy/d*sp; }
    } else if (u.state==="at"){
      u.t -= dt;
      if (u.t<=0){ u.state="out"; u.tx=u.ex; u.ty=u.ey; u.link=null; }
    }
  }
}

/* ================= verdict and rocket ================= */
function verdict(p){
  const st = stations[IDX_TEST];
  const eff = satisfaction(p);
  const measured = eff + gauss(testNoise());
  if (measured >= testBar() || p.iters >= MAX_ITERS){
    if (measured < testBar()){        /* abandoned after too many laps */
      stats.dropped++; stats.given++; statsDirty = true;
      particles.push({ x:st.x, y:st.y, z:1.5, vz:.7, life:1.8, color:"#8A939A", txt:"abandoned" });
      p.phase="drop"; p.dropT = 0;
      return;
    }
    particles.push({ x:st.x, y:st.y, z:1.5, vz:.7, life:1.5, color:"#5FC9D6",
                     txt:"passed " + (eff>=0?"+":"") + eff.toFixed(2) });
    p.phase = "toPad"; p.u = 0;
  } else {
    p.iters++; stats.rejects++; statsDirty = true;
    particles.push({ x:st.x, y:st.y, z:1.5, vz:.7, life:1.7, color:"#E85D4E", txt:"rejected" });
    p.phase = "ring";
    p.u = IDX_TEST / N_ST;
  }
}
function stepRocket(dt){
  if (rocket.state==="lift"){
    rocket.t += dt; rocket.z += (1.6 + rocket.t*5.2)*dt;
    if (rocket.z > 12){ rocket.state="gone"; rocket.t=0; }
  } else if (rocket.state==="gone"){
    rocket.t += dt;
    if (rocket.t > 0.7){ rocket.state="ready"; rocket.z=0; rocket.t=0; }
  }
}

/* ================= simulation ================= */
function endGame(kind){
  if (outcome) return;
  outcome = kind; statsDirty = true;
  running = false;
  if (onGameEnd) onGameEnd(kind);
}

export function step(dt){
  if (outcome) return;
  t += dt;
  sprintTimer += dt;
  while (sprintTimer >= SPRINT){ sprintTimer -= SPRINT; runSprint(); }
  resources += dt * allocated();
  if (capital <= 0){ capital = 0; endGame("lost"); return; }
  if (discovered >= CATALOG_SIZE) endGame("won");
  stepUsers(dt);
  stepRocket(dt);

  if (usersAt(IDX_RECH) > 0){
    /* Returning rejects come first: research is reopened for them. */
    for (const p of packages){
      if (p.phase==="wait" && p.st===IDX_RECH){
        doStation(p, IDX_RECH); p.phase="work"; p.dwell=DWELL(); p.wait=0;
      }
    }

    /* The backlog drains into the park as visits happen and space allows. */
    let k = 0;
    while (backlog.length > 0 && packages.length < WIP_MAX){
      const pot = backlog.shift(); statsDirty = true;
      const p = newPackage(pot);
      doStation(p, IDX_RECH);
      p.phase="work"; p.st=IDX_RECH; p.dwell = DWELL() + k*0.5;
      packages.push(p); k++;
    }
  }

  for (let n=packages.length-1; n>=0; n--){
    const p = packages[n];
    if (p.phase==="wait"){
      p.wait = (p.wait||0) + dt;
      if (p.st===IDX_TEST && usersAt(IDX_TEST) > 0){
        doStation(p, IDX_TEST); p.phase="work"; p.dwell=DWELL(); p.wait=0;
      }
      continue;   /* Research is served earlier, at the top of the step */
    }
    if (p.phase==="work"){
      p.dwell -= dt;
      if (p.dwell <= 0){
        if (p.st===IDX_TEST) verdict(p);
        else if (p.st===IDX_CADRAGE && (p.pot + gauss(frameNoise(p.iters))) < frameBar()){
          const st = stations[IDX_CADRAGE];
          particles.push({ x:st.x, y:st.y, z:1.4, vz:.7, life:1.7, color:"#8A939A", txt:"dropped" });
          p.phase="drop"; p.dropT = 0;
          stats.dropped++; statsDirty = true;
          if (p.pot < 0) stats.caught++; else stats.missed++;
        }
        else { p.phase="ring"; p.u = p.st / N_ST; }
      }
      continue;
    }
    if (p.phase==="ring"){
      const before = p.u;
      p.u += p.speed*dt / (1 + Math.abs(p.lane)*0.35);
      let handled = false;
      for (let k=1;k<N_ST;k++){
        /* The boundary must be computed exactly like the exit position of a
           station (p.st / N_ST). With k * (1/N_ST) the result differs by one
           ulp for k = 3 (0.6000000000000001 against 0.6): a box left Prototype
           just short of its own boundary and crossed it again on the next
           frame, forever. The epsilon guards against the same drift if
           N_ST changes. */
        const mark = k / N_ST;
        if (before < mark - 1e-9 && p.u >= mark){
          p.u = mark; p.st = k; handled = true;
          if (k===IDX_TEST){ p.phase="wait"; p.wait=0; }
          else if (Math.random() < pSkip(k)) skipStation(p,k);
          else { doStation(p,k); p.phase="work"; p.dwell=DWELL(); }
          break;
        }
      }
      if (!handled && p.u >= 1){
        /* Back to Research: the box waits until someone talks to users again. */
        p.u = 0; p.st = IDX_RECH; p.phase = "wait"; p.wait = 0;
      }
      continue;
    }
    if (p.phase==="drop"){
      p.dropT += dt;
      if (p.dropT > 1.6) packages.splice(n,1);
      continue;
    }
    if (p.phase==="toPad"){
      p.u = Math.min(1, p.u + 0.38*dt);
      if (p.u>=1 && rocket.state==="ready"){
        rocket.state="lift"; rocket.z=0; rocket.t=0;
        const eff = satisfaction(p);
        const weighted = eff < 0 ? eff * HARM_MULT : eff;
        stats.shipped++; stats.iterSum += p.iters;
        stats.satSum += weighted;
        const gain = weighted * REV_PER_SAT;
        capital += gain; stats.earned += gain;
        if (eff < 0){ stats.harmful++; stats.harmSum += weighted; }
        statsDirty = true;
        particles.push({ x:CX, y:CY, z:2.2, vz:1.0, life:1.7, color:"#5FC9D6", txt:"lift-off" });
        packages.splice(n,1);
      }
    }
  }

  for (const s of stations) s.pulse = Math.max(0, s.pulse - dt*1.5);
  for (let i=particles.length-1;i>=0;i--){
    const q=particles[i]; q.z += q.vz*dt; q.life -= dt*.8;
    if (q.life<=0) particles.splice(i,1);
  }
}

export function reset(){
  packages=[]; users=[]; particles=[];
  nextId=1; gateTimers=[0,0];
  rocket={state:"ready",z:0,t:0};
  backlog=[]; sprintTimer=0; resources=0; buildCatalog();
  capital=CAPITAL_START; outcome=null;
  stats={born:0,shipped:0,dropped:0,rejects:0,iterSum:0,sprints:0,satSum:0,harmful:0,caught:0,given:0,skips:0,missed:0,earned:0,spent:0,harmSum:0}; statsDirty=true;
  stations.forEach(s=>{ s.visits=0; s.skips=0; s.pulse=0; });
}
