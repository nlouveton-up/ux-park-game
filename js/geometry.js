/* ================= geometry =================
   Pure world-space math (grid units, not pixels): where things sit on the
   ring. No canvas, no state — shared by the game logic (to place stations
   and gates) and the graphic layer (to draw them). */
import { CX, CY, N_ST } from "./config.js";

export const rad = d => d * Math.PI / 180;
export const polar = (r, d) => [CX + r * Math.cos(rad(d)), CY + r * Math.sin(rad(d))];
export const stAngle = i => 270 + i * (360 / N_ST);
