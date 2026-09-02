/* ================= content =================
   The words and per-station identity shown to the player. No game rules,
   no rendering — pure editorial data. */

export const STAGES = [
  { name:"Research", role:"Understand the people and the problem", dia:"Discover · north gate", color:"#E85D4E",
    desc:"The entrance, and the point of return. The product holds a fixed list of latent leads, unknown to the team. A wider sample reveals more of them per sprint — but the draw stays uniform: research does not choose what it finds, and brings back as many non-features as features. Past the park's capacity, the surplus piles up in the backlog.",
    methods:["Interviews","Field studies","Analytics","Competitive audit"],
    out:"A lead from the catalogue, and a potential nobody knows yet." },
  { name:"Framing", role:"Decide which problem is worth solving", dia:"Define", color:"#F0A63C",
    desc:"The filter on potential satisfaction. The team estimates it without knowing it: investing reduces the error and raises the bar. Run it low and non-features get through; run it high and you cut the harmful, then the merely mediocre, at the risk of throwing away sound leads. Cutting here costs one segment; cutting at Testing costs a lap.",
    methods:["Personas","Journey maps","Affinity mapping","Problem statement"],
    out:"A stated problem — or a box sent to the skip." },
  { name:"Ideation", role:"Generate more options than you need", dia:"Develop", color:"#E9D24A",
    desc:"Diverge deliberately, then choose. This station produces <b>differentiation</b>, drawn at random on each pass: a bonus, but sometimes a penalty, because an ideation session can produce a bad idea. Investing shifts the expected value upward without removing the risk — run it low and ideation degrades the lead more often than it improves it.",
    methods:["Sketching","Crazy 8s","How might we","Design studio"],
    out:"A differentiated lead — or one spoiled by a bad idea." },
  { name:"Prototype", role:"Make the idea cheap enough to be wrong", dia:"Develop", color:"#58B86E",
    desc:"Build the smallest thing a real person can misunderstand. This station raises the <b>real satisfaction factor</b>, with diminishing returns: the share of the potential actually delivered. A multiplier, then — building a harmful lead better makes it more harmful.",
    methods:["Wireframes","Clickable prototype","Design system","Draft content"],
    out:"Something testable — not something finished." },
  { name:"Testing", role:"The verdict", dia:"Deliver · west gate", color:"#3E9BD6",
    desc:"The second gate. The lead waits for a user to be present: with nobody to judge, nothing ships. Real satisfaction is measured here, with an error that investment reduces, and kept above a threshold that investment raises. Too little testing lets duds through; too much rejects good work and swells the backlog.",
    methods:["Usability testing","A/B tests","Heuristic evaluation","Accessibility audit"],
    out:"A decision: lift off, or go round again." }
];

/* Tooltip text for each resource slider, in station order. */
export const INV_FX = [
  "Wider samples: more leads revealed per sprint. The draw stays uniform — you find as many non-features as features.",
  "Filters on potential satisfaction: a less noisy estimate and a higher bar.",
  "Raises differentiation, a satisfaction bonus added on top of potential × real.",
  "Raises the real satisfaction factor: the share of the potential actually delivered.",
  "Filters on real satisfaction: a more reliable measurement and a stricter threshold."
];

/* Gate labels, in the order the gates are declared (research, then testing). */
export const GATE_LABELS = ["RESEARCH GATE", "TESTING GATE"];
