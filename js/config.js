/* ================= configuration =================
   Every tunable number the simulation and its rendering depend on.
   Nothing here computes anything; it only names values. */

/* --- stations --- */
export const N_ST = 5;
export const IDX_RECH = 0, IDX_CADRAGE = 1, IDX_IDEE = 2, IDX_PROTO = 3, IDX_TEST = 4;

/* --- resources ---
   Deliberately poor opening allocation: that of a team which builds first
   and talks to nobody. It also leaves 0.75 of the budget idle. Left alone,
   it wins about one game in five. */
export const INITIAL_INV = [0.20, 0.20, 0.30, 0.80, 0.20];
export const BUDGET = 2.5;               /* fixed budget shared by the five stations */
export const INITIAL_PRESSURE = 0.35;    /* schedule pressure */

/* --- economy ---
   Each sprint costs a fixed amount plus the resources committed.
   Out of capital: lost. Whole catalogue revealed: won. */
export const CAPITAL_START = 195;
export const SPRINT_FIXED  = 8;      /* unavoidable cost of a sprint */
export const SPRINT_UX     = 6;      /* cost per unit of allocated resource */
/* One-off payment on release, proportional to the satisfaction delivered.
   A recurring revenue would reward slowness — here every extra sprint costs,
   and nothing pays for time passing. */
export const REV_PER_SAT   = 75;
/* A shipped non-feature weighs more than a feature earns: support load,
   churn, repairs. The damage is counted at a multiple. */
export const HARM_MULT     = 4;

export const SPRINT  = 3.0;   /* sprint length, in weeks */
export const WIP_MAX = 12;    /* leads in the park at once */

/* Schedule pressure makes stations get skipped; investment protects. */
export const VULN = [0, 0.42, 0.52, 0.24, 0];

/* --- the product ---
   The product holds a fixed list of latent leads, each with a potential
   satisfaction drawn once and for all. The draw being uniform over [-1,1],
   the catalogue holds half features, half non-features. */
export const CATALOG_SIZE = 80;

/* --- ideation --- */
export const DIFF_MAX     = 0.45;
export const IDEA_SPREAD  = 0.30;

/* --- testing / iteration --- */
export const MAX_ITERS = 6;   /* beyond this, the lead is abandoned */

/* --- users --- */
export const VISIT_PERIOD = 4.2;    /* weeks between visits, per gate */
export const SESSION      = 2.2;    /* how long a user stays */

/* --- world geometry (grid units, not pixels) --- */
export const GRID = 26, CX = 12.5, CY = 12.5;
export const R_RING = 7.0, R_GATE = 12.2;
export const TW = 32, TH = 16, ZH = 21;   /* isometric tile projection */

/* --- environment --- */
export const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
