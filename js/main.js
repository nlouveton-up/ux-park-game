/* ================= entry point =================
   Wires the layers together and drives the animation loop. Nothing here
   computes game rules or draws pixels — it only calls into the modules
   that do. */
import { REDUCED } from "./config.js";
import { step, running, speed, reset } from "./game-logic.js";
import { resize, buildGround, render } from "./graphics.js";
import { init as initUI, updateDash, play } from "./ui.js";

let last = performance.now();
function frame(now){
  const dt = Math.min((now-last)/1000, .05); last = now;
  if (running) step(dt*speed);
  render();
  updateDash();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);

resize();
buildGround();
reset();
initUI();
play(!REDUCED);
requestAnimationFrame(frame);
