/* ================= interface =================
   DOM wiring only: reads and drives the game-logic and graphic layers,
   never computes simulation rules or draws to the canvas itself. */
import { BUDGET, CATALOG_SIZE, HARM_MULT, SPRINT, SPRINT_FIXED, SPRINT_UX, WIP_MAX } from "./config.js";
import { STAGES, INV_FX } from "./content.js";
import {
  INV, PRESSURE, setPressure, allocated, freeBudget,
  stats, backlog, packages, capital, discovered, optimum,
  running, setRunning, speed, setSpeed,
  setSelectedStage, setGameEndHandler, markDirty, consumeDirty,
  reset as resetGame, sampleSize, frameBar, testBar
} from "./game-logic.js";
import { toggleLabels, onStationClick } from "./graphics.js";

const $ = id => document.getElementById(id);

/* ---------------- station card ---------------- */
function selectStage(i){
  setSelectedStage(i);
  const s = STAGES[i];
  $("swatch").style.background = s.color;
  $("stgNum").textContent = "Station " + String(i+1).padStart(2,"0");
  $("stgDia").textContent = s.dia;
  $("stgName").textContent = s.name;
  $("stgRole").textContent = s.role;
  $("stgDesc").textContent = s.desc;
  $("stgOut").textContent = s.out;
  $("stgChips").innerHTML = s.methods.map(m=>'<span class="chip">'+m+"</span>").join("");
  [...$("picker").children].forEach((b,k)=>b.setAttribute("aria-current", k===i?"true":"false"));
}
$("picker").innerHTML = STAGES.map((s,i)=>
  '<button type="button" aria-current="false" title="'+s.name+'"><i style="background:'+s.color+'"></i>'+(i+1)+"</button>").join("");
[...$("picker").children].forEach((b,i)=>b.addEventListener("click",()=>selectStage(i)));

/* ---------------- play / pause ---------------- */
function syncPlayLabel(){
  $("ppLabel").textContent = running ? "Pause" : "Play";
  $("ppIcon").setAttribute("d", running ? "M3.5 2.5h3.5v11H3.5zM9 2.5h3.5v11H9z" : "M4 2.5l9 5.5-9 5.5z");
}
export function play(on){ setRunning(on); syncPlayLabel(); }
$("btnPlay").addEventListener("click", () => play(!running));

/* ---------------- result panel ----------------
   Registered with the game-logic layer, which calls this once when a game
   ends, instead of reaching into the DOM itself. */
setGameEndHandler(kind => {
  play(false);
  $("resTitle").textContent = kind === "won" ? "Product fully explored" : "Out of capital";
  $("resBody").textContent = kind === "won"
    ? "All " + CATALOG_SIZE + " leads were explored in " + stats.sprints
      + " sprints. Satisfaction delivered: " + stats.satSum.toFixed(1)
      + " out of a positive potential of " + optimum.toFixed(1)
      + ", or " + Math.round(stats.satSum/optimum*100) + "%. Capital left: "
      + Math.round(capital) + "."
    : "The money ran out after " + stats.sprints + " sprints, with "
      + discovered + " of " + CATALOG_SIZE + " leads explored. "
      + "Delivered satisfaction (" + stats.satSum.toFixed(1)
      + ") was not earning enough to pay for the sprints.";
  $("result").className = "result " + (kind === "won" ? "win" : "lose");
  $("result").hidden = false;
});

function reset(){
  resetGame();
  $("result").hidden = true;
}
$("btnReset").addEventListener("click", () => { reset(); play(true); });
$("btnAgain").addEventListener("click", () => { reset(); play(true); });

/* ---------------- labels toggle ---------------- */
$("btnLabels").addEventListener("click", e => {
  const on = toggleLabels();
  e.currentTarget.setAttribute("aria-pressed", String(on));
});

/* ---------------- speed ---------------- */
$("spd").addEventListener("input", e => {
  const v = e.target.value==="0" ? 0 : Math.pow(e.target.value/100,1.4);
  setSpeed(v);
  $("spdOut").textContent = speed.toFixed(2)+"×";
});

/* ---------------- resource sliders ---------------- */
$("invRows").innerHTML = STAGES.map((st,i) =>
  '<div class="inv-row">'
  + '<label for="inv'+i+'"><i style="background:'+st.color+'"></i>'+st.name+'</label>'
  + '<input id="inv'+i+'" type="range" min="0" max="100" step="1" value="'
  + Math.round(INV[i]*100) + '" title="'+INV_FX[i]+'">'
  + '<output id="out'+i+'">'+Math.round(INV[i]*100)+'%</output></div>').join("");

function refreshInv(){
  for (let i=0;i<STAGES.length;i++) $("out"+i).textContent = Math.round(INV[i]*100) + "%";
  const used = allocated(), free = freeBudget();
  $("invTotal").textContent = used.toFixed(2) + " / " + BUDGET.toFixed(2);
  $("invTotal").style.color = free < 0.005 ? "#58B86E" : "#F0A63C";
  $("allocBar").innerHTML =
    STAGES.map((st,i) => '<i style="width:'+(INV[i]/BUDGET*100)+'%;background:'+st.color+'"></i>').join("")
    + '<i class="free" style="width:'+(free/BUDGET*100)+'%"></i>';
  $("invNote").textContent =
    "Sample: " + sampleSize() + " lead" + (sampleSize()>1?"s":"")
    + " revealed per " + SPRINT + "-week sprint. "
    + "Framing drops below " + frameBar().toFixed(2) + " estimated potential. "
    + "Testing keeps above " + testBar().toFixed(2) + " measured satisfaction. "
    + (free > 0.005
        ? "Unspent budget: " + free.toFixed(2) + " — saved, but doing nothing."
        : "Budget fully allocated: raising one station forces another down.");
}
for (let i=0;i<STAGES.length;i++){
  $("inv"+i).addEventListener("input", e => {
    /* The budget cannot be exceeded: the value is clamped to what is left and
       written back to the slider so the handle does not drift. */
    const wanted = e.target.value/100;
    const ceiling = INV[i] + freeBudget();
    INV[i] = Math.min(wanted, ceiling);
    e.target.value = Math.round(INV[i]*100);
    refreshInv(); markDirty();
  });
}
$("press").addEventListener("input", e => {
  setPressure(e.target.value/100);
  const col = PRESSURE < .35 ? "#58B86E" : PRESSURE < .7 ? "#F0A63C" : "#E85D4E";
  $("outPress").textContent = Math.round(PRESSURE*100) + "%";
  $("outPress").style.color = col;
  e.target.style.setProperty("--prs", col);
  markDirty();
});

/* ---------------- dashboard, refreshed only when a counter moves ---------------- */
const fr1 = n => (n<0?"−":"+") + Math.abs(n).toFixed(1);
const fr2 = n => (n<0?"−":"") + Math.abs(n).toFixed(2);
export function updateDash(){
  if (!consumeDirty()) return;
  $("dTotal").textContent   = discovered + " / " + CATALOG_SIZE;
  $("dShipped").textContent = stats.shipped;
  $("dBacklog").textContent = backlog.length;
  $("dBacklog").style.color = backlog.length > WIP_MAX ? "#E85D4E" : backlog.length > 5 ? "#F0A63C" : "var(--fg)";
  $("dDropped").textContent = stats.dropped;
  $("dSat").textContent     = fr1(stats.satSum);
  $("dSat").style.color     = stats.satSum < 0 ? "#E85D4E" : stats.satSum > 0 ? "#58B86E" : "var(--fg)";
  $("dCap").textContent     = Math.round(capital);
  $("dCap").style.color     = capital < 25 ? "#E85D4E" : capital < 60 ? "#F0A63C" : "#5FC9D6";
  $("dSprints").textContent = "sprint " + stats.sprints;
  const moy = stats.shipped ? stats.satSum/stats.shipped : 0;
  $("dNote").textContent =
    (stats.shipped ? "Average per release " + fr2(moy) + ", "
       + (stats.iterSum/stats.shipped).toFixed(2) + " laps on average. " : "")
    + (stats.harmful ? stats.harmful + " harmful release" + (stats.harmful>1?"s":"")
        + " (" + fr1(stats.harmSum) + " satisfaction, damage ×" + HARM_MULT + "). " : "")
    + (stats.skips ? stats.skips + " station" + (stats.skips>1?"s":"")
        + " skipped under pressure. " : "")
    + (stats.missed ? stats.missed + " feature" + (stats.missed>1?"s":"")
        + " wrongly dropped. " : "")
    + "Sprint: −" + Math.round(SPRINT_FIXED + SPRINT_UX*allocated())
      + ". Earned: " + Math.round(stats.earned) + ". "
    + (discovered >= CATALOG_SIZE && backlog.length === 0 && packages.length === 0
        ? "Product fully explored. Sum of positive potentials: " + fr1(optimum)
          + " — you captured " + Math.round(stats.satSum/optimum*100) + "%"
          + (stats.satSum > optimum ? " (differentiation created value beyond the latent needs)." : ".")
        : packages.length + " in circulation out of " + WIP_MAX + " slots.");
}

/* ---------------- global input ---------------- */
onStationClick(selectStage);
document.addEventListener("keydown", e => {
  if (e.target.tagName==="INPUT") return;
  if (e.code==="Space"){ e.preventDefault(); play(!running); }
  else if (e.key>="1" && e.key<=String(STAGES.length)) selectStage(+e.key-1);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) play(false); });

export function init(){
  selectStage(0);
  refreshInv();
  $("press").dispatchEvent(new Event("input"));
}
