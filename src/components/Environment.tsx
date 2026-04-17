import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { useControls, folder, button } from "leva";
import * as THREE from "three";

interface EnvironmentProps {
  activeIndex: number;
  progress: number;
  onContextPhase?: (phase: number) => void;
  continuousIndex: number;
  onLockPrinciple?: (p: string) => void;
}

// ============================================================================
// Global mouse tracking (cursor/head stand-in)
// ============================================================================
const mouse = { x: 0, y: 0 };
const smooth = { x: 0, y: 0 };
if (typeof window !== "undefined") {
  window.addEventListener("mousemove", (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

// ============================================================================
// Easing helpers
// ============================================================================
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ============================================================================
// Types
// ============================================================================
interface Behavior {
  op: number;
  em: number;
  altOp: number;
  altScale: number;
  scale: number;
  scaleZ: number; // z-depth multiplier for 2D→3D reveal; 1 = full 3D, 0.05 = paper-flat
  rotLock: number; // 0 = free ambient rotation; 1 = locked face-on to camera
  offX: number;
  offY: number;
  offZ: number;
  tgtX: number;
  tgtY: number;
  tgtZ: number;
  parallaxMul: number;
  metalness: number;
  roughness: number;
  edgeOp: number; // P03 wireframe visibility (per shape)
}

interface EarnState {
  shape: number;
  phase: "silence" | "arrival" | "held" | "recede";
  amp: number;
  flare: number;
  popProgress: number; // 0 = flat/2D, 1 = full 3D (depth has unfolded)
  ringRadius: number; // 0..1 normalized; ring world-size = shape.size * p01RingScale * ringRadius
  ringOp: number;
  ringPos: [number, number, number];
}

interface AttnState {
  shape: number;
  phase: "focus" | "held" | "retreat" | "silence";
  amp: number;
  bracketOp: number;
  bracketPos: [number, number, number];
}

interface CtxState {
  idx: 0 | 1 | 2;
  blend: number; // 0 = at idx, 1 = at next
}

interface HandoffState {
  fromIdx: number;
  toIdx: number;
  threadOp: number;
}

interface AgentState {
  activeResponder: number;
  agentPulse: number; // 0..1 emissive swell
  beamExtent: number; // 0..1 fraction of beam drawn
  beamOp: number;
  responderAmp: number; // 0..1 responder visibility progression
}

interface BehaviorCtx {
  earn: EarnState;
  attn: AttnState;
  p04Dim: number;
  ctx: CtxState;
  contextPhase: number; // legacy 0..1 for cards
  handoff: HandoffState;
  agent: AgentState;
  witnessFlashShape: number; // -1 if none
  witnessFlashAmp: number; // 0..1
  breath: number;
  tuning: TuningValues;
}

// Strong typing on the values returned from useControls
interface TuningValues {
  amberAccent: string;
  baseMetalness: number;
  baseRoughness: number;
  breathIntensity: number;
  breathRate: number;

  p01SilenceDur: number;
  p01ArrivalDur: number;
  p01HeldDur: number;
  p01RecedeDur: number;
  p01PeakOp: number;
  p01RingScale: number;
  p01HeldPulseAmp: number;
  p01HeldRingOp: number;
  p01PopStart: number;
  p01PopEnd: number;
  p01FlatScaleZ: number;

  p02OrbitSpeed: number;
  p02MouseMul: number;
  p02OpBase: number;
  p02TetherOp: number;

  p03Metalness: number;
  p03Roughness: number;
  p03Parallax: number;
  p03EdgeOp: number;
  p03OpBase: number;

  p04DimOp: number;
  p04FocusOp: number;
  p04FocusDur: number;
  p04HeldDur: number;
  p04RetreatDur: number;
  p04SilenceDur: number;
  p04BracketOp: number;
  p04BracketSize: number;

  p05CycleDur: number;
  p05HomeColor: string;
  p05WorkColor: string;
  p05TravelColor: string;
  p05WashOp: number;

  p06HoldADur: number;
  p06MorphDur: number;
  p06HoldBDur: number;
  p06Stagger: number;
  p06ThreadOp: number;

  p07AgentIdx: number;
  p07EdgeX: number;
  p07EdgeY: number;
  p07EdgeZ: number;
  p07FocusZ: number;
  p07ReasoningDur: number;
  p07ExtendDur: number;
  p07ArrivalDur: number;
  p07HeldDur: number;
  p07DismissDur: number;
  p07RetractDur: number;
  p07PauseDur: number;
  p07BeamOp: number;
  p07AgentScale: number;
  p07ResponderScale: number;

  p08AltWitnessIdx: number;
  p08WitnessBaseRadius: number;
  p08WitnessRingScale: number;
  p08OrbitSpeed: number;
  p08FlashInterval: number;
  p08FlashDur: number;
  p08WitnessOp: number;
  p08HaloOp: number;
  p08ShapeOpBase: number;

  lockToPrinciple: string;
}

const LOCK_OPTIONS = [
  "none",
  "P01",
  "P02",
  "P03",
  "P04",
  "P05",
  "P06",
  "P07",
  "P08",
] as const;

// ============================================================================
// Tuning defaults + localStorage persistence
// ============================================================================
const STORAGE_KEY = "spatial-principles-tuning-v2";
const BASELINE_DEFAULTS = {
  amberAccent: "#e8a76b",
  baseMetalness: 0.2,
  baseRoughness: 0.55,
  breathIntensity: 0.012,
  breathRate: 0.25,

  p01SilenceDur: 1.6,
  p01ArrivalDur: 1.2,
  p01HeldDur: 2.2,
  p01RecedeDur: 1.1,
  p01PeakOp: 0.95,
  p01RingScale: 2.5, // ring radius = shape.size * this multiplier
  p01HeldPulseAmp: 0.08,
  p01HeldRingOp: 0.3,
  p01PopStart: 0.35, // fraction of arrival phase where 2D→3D pop begins
  p01PopEnd: 0.85, // fraction of arrival phase where 2D→3D pop completes
  p01FlatScaleZ: 0.05, // z-scale during the flat/2D phase

  p02OrbitSpeed: 0.12,
  p02MouseMul: 1.8,
  p02OpBase: 0.5,
  p02TetherOp: 0.08,

  p03Metalness: 0.05,
  p03Roughness: 0.85,
  p03Parallax: 0.25,
  p03EdgeOp: 0.45,
  p03OpBase: 0.75,

  p04DimOp: 0.1,
  p04FocusOp: 0.95,
  p04FocusDur: 1.8,
  p04HeldDur: 1.5,
  p04RetreatDur: 0.8,
  p04SilenceDur: 2.5,
  p04BracketOp: 0.7,
  p04BracketSize: 1.4,

  p05CycleDur: 15,
  p05HomeColor: "#c98651",
  p05WorkColor: "#4a7dd4",
  p05TravelColor: "#7d5bd4",
  p05WashOp: 0.1,

  p06HoldADur: 2.0,
  p06MorphDur: 0.7,
  p06HoldBDur: 1.5,
  p06Stagger: 0.6,
  p06ThreadOp: 0.5,

  p07AgentIdx: 4,
  p07EdgeX: 5.5,
  p07EdgeY: -3.5,
  p07EdgeZ: -5,
  p07FocusZ: -6,
  p07ReasoningDur: 0.5,
  p07ExtendDur: 0.55,
  p07ArrivalDur: 0.75,
  p07HeldDur: 1.6,
  p07DismissDur: 0.7,
  p07RetractDur: 0.4,
  p07PauseDur: 0.6,
  p07BeamOp: 0.6,
  p07AgentScale: 0.75,
  p07ResponderScale: 1.3,

  p08AltWitnessIdx: 4,
  p08WitnessBaseRadius: 6.0,
  p08WitnessRingScale: 1.0,
  p08OrbitSpeed: 0.08,
  p08FlashInterval: 2.2,
  p08FlashDur: 0.8,
  p08WitnessOp: 0.4,
  p08HaloOp: 0.55,
  p08ShapeOpBase: 0.55,

  lockToPrinciple: "none" as string,
};

// Hydrate from localStorage
function loadPersisted(): Partial<typeof BASELINE_DEFAULTS> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<typeof BASELINE_DEFAULTS>;
  } catch {
    return {};
  }
}
const PERSISTED = loadPersisted();
const DEFAULTS = {
  ...BASELINE_DEFAULTS,
  ...PERSISTED,
} as typeof BASELINE_DEFAULTS;

// ============================================================================
// getBehavior: per-shape target state for a given principle index
// ============================================================================
function getBehavior(
  idx: number,
  i: number,
  t: number,
  f: { pos: number[]; size: number },
  c: BehaviorCtx,
  formsLen: number
): Behavior {
  const cfg = c.tuning;
  let op = 0.5;
  let em = 0;
  let altOp = 0;
  let altScale = 0;
  let scale = f.size;
  let scaleZ = 1;
  let rotLock = 0;
  let offX = 0;
  let offY = 0;
  let offZ = 0;
  let tgtX = f.pos[0];
  let tgtY = f.pos[1];
  let tgtZ = f.pos[2];
  let parallaxMul = 1;
  let metalness = cfg.baseMetalness;
  let roughness = cfg.baseRoughness;
  let edgeOp = 0;

  if (idx === 0) {
    // P01: SPATIAL IS EARNED — the earning shape arrives as a flat 2D
    // silhouette that then "unfolds" into 3D depth. Parallax is zeroed so
    // the moment feels ceremonial rather than body-coupled.
    parallaxMul = 0; // never tracks the cursor during P01
    const isEarning = c.earn.shape === i && c.earn.phase !== "silence";
    if (!isEarning) {
      op = 0.015;
      em = 0;
      scale = f.size * 0.72;
      // Non-earning shapes stay quietly 3D so the crossfade into P02 is smooth.
      scaleZ = 1;
      rotLock = 0;
    } else {
      const amp = c.earn.amp;
      const pop = c.earn.popProgress;
      op = 0.015 + amp * (cfg.p01PeakOp - 0.015);
      em = 0.25 * amp + 0.55 * c.earn.flare;
      // Held-phase micro-pulse so the earned shape reads as alive
      const heldPulse =
        c.earn.phase === "held"
          ? Math.sin(t * 2.2) * cfg.p01HeldPulseAmp
          : 0;
      scale = f.size * (0.82 + amp * 0.42 + heldPulse);
      // 2D→3D reveal: depth compressed until the pop moment in mid-arrival.
      scaleZ = lerp(cfg.p01FlatScaleZ, 1, pop);
      // Rotation locked to camera during the flat phase, unlocks with pop.
      rotLock = 1 - pop;
    }
  } else if (idx === 1) {
    // P02: BODY IS THE ANCHOR — true orbit around origin with strong mouse coupling
    const baseRadius = Math.sqrt(
      f.pos[0] * f.pos[0] + f.pos[1] * f.pos[1]
    );
    const baseAngle = Math.atan2(f.pos[1], f.pos[0]);
    const angle = baseAngle + t * cfg.p02OrbitSpeed + i * 0.35;
    tgtX = Math.cos(angle) * baseRadius;
    tgtY = Math.sin(angle) * baseRadius;
    tgtZ = f.pos[2];
    parallaxMul = cfg.p02MouseMul;
    op = cfg.p02OpBase;
    em = 0.15;
    scale = f.size;
  } else if (idx === 2) {
    // P03: DIEGETIC FIRST — matte, parallax-locked, wireframe-inscribed
    parallaxMul = cfg.p03Parallax;
    op = cfg.p03OpBase;
    em = 0.08;
    metalness = cfg.p03Metalness;
    roughness = cfg.p03Roughness;
    // Only the first 3 shapes are "inscribed" (information-bearing)
    edgeOp = i < 3 ? cfg.p03EdgeOp : 0;
  } else if (idx === 3) {
    // P04: ATTENTION IS THE BUDGET — dim baseline, one focused shape
    const isFocused = c.attn.shape === i && c.attn.phase !== "silence";
    if (isFocused) {
      op =
        cfg.p04DimOp + c.attn.amp * (cfg.p04FocusOp - cfg.p04DimOp);
      em = 0.55 * c.attn.amp;
      scale = f.size * (1 + 0.25 * c.attn.amp);
    } else {
      op = cfg.p04DimOp;
      em = 0;
      scale = f.size * 0.92;
    }
  } else if (idx === 4) {
    // P05: CONTEXT IS EVERYTHING — three distinct contexts
    const isFocal = i === 2; // torus is the focal shape
    const ctxShifts: [number, number, number][] = [
      [0, -0.5, 0], // home: settled lower
      [0, 0, 0], // work: centered orthogonal
      [0.5, 0.3, 0.5], // travel: offset and shifted forward
    ];
    const from = ctxShifts[c.ctx.idx];
    const to = ctxShifts[(c.ctx.idx + 1) % 3];
    const sX = lerp(from[0], to[0], c.ctx.blend);
    const sY = lerp(from[1], to[1], c.ctx.blend);
    const sZ = lerp(from[2], to[2], c.ctx.blend);
    tgtX = f.pos[0] + sX;
    tgtY = f.pos[1] + sY;
    tgtZ = f.pos[2] + sZ;
    op = 0.65;
    em = 0.25;
    // Focal shape transforms distinctly per context
    if (isFocal) {
      const focalScales = [0.9, 1.35, 1.1];
      const sA = focalScales[c.ctx.idx];
      const sB = focalScales[(c.ctx.idx + 1) % 3];
      scale = f.size * lerp(sA, sB, c.ctx.blend);
      op = 0.85;
      em = 0.35;
    } else {
      scale = f.size * (0.95 + 0.08 * Math.sin(i + c.contextPhase * 3));
    }
  } else if (idx === 5) {
    // P06: TRANSITIONS ARE DESIGNED — eased 4-phase state machine per shape
    const P1 = cfg.p06HoldADur;
    const P2 = cfg.p06MorphDur;
    const P3 = cfg.p06HoldBDur;
    const P4 = cfg.p06MorphDur;
    const CYCLE = P1 + P2 + P3 + P4;
    const phase = (t + i * cfg.p06Stagger) % CYCLE;
    let morph: number;
    if (phase < P1) morph = 0;
    else if (phase < P1 + P2) morph = easeInOutCubic((phase - P1) / P2);
    else if (phase < P1 + P2 + P3) morph = 1;
    else morph = 1 - easeInOutCubic((phase - P1 - P2 - P3) / P4);

    scale = f.size * (1 - morph * 0.7);
    const mid = Math.sin(morph * Math.PI);
    op = 0.55 * (1 - morph) + mid * 0.12;
    altOp = morph * 0.72;
    altScale = morph * 1.3;
    em = 0.15 + morph * 0.15;
  } else if (idx === 6) {
    // P07: AGENT EARNS TRUST — agent lives at an edge position like a
    // persistent companion; when summoned, a responder shape is delivered
    // into the wearer's center focus zone along a beam. Dismissed responder
    // retracts back along the beam into the agent.
    const isAgent = i === cfg.p07AgentIdx;
    const isActiveResponder = i === c.agent.activeResponder;

    if (isAgent) {
      // Agent: compact, at edge, slow inner glow. Scale stays small so it
      // reads as a companion, not a focal subject.
      tgtX = cfg.p07EdgeX;
      tgtY = cfg.p07EdgeY;
      tgtZ = cfg.p07EdgeZ;
      op = 0.75;
      em = 0.25 + c.agent.agentPulse * 0.6;
      scale = f.size * cfg.p07AgentScale;
      metalness = 0.4;
      roughness = 0.3;
      parallaxMul = 0.6;
    } else if (isActiveResponder) {
      // Active responder: delivered to center focus zone. Travels from
      // agent toward focus during "arriving" (responderAmp 0→1), lives
      // there during "held", and retracts during "dismissing".
      const focusX = 0;
      const focusY = 0;
      const focusZ = cfg.p07FocusZ;
      const amp = c.agent.responderAmp;
      // During arrival, start near the agent and slide to center focus
      tgtX = lerp(cfg.p07EdgeX, focusX, amp);
      tgtY = lerp(cfg.p07EdgeY, focusY, amp);
      tgtZ = lerp(cfg.p07EdgeZ, focusZ, amp);
      op = 0.05 + amp * 0.9;
      em = 0.55 * amp;
      scale = f.size * lerp(cfg.p07AgentScale, cfg.p07ResponderScale, amp);
      parallaxMul = 0.5 + amp * 0.5;
    } else {
      // Other responders: waiting in the wings, near-invisible, off-screen
      // edge. Slight per-i distribution so they don't all collapse on one
      // point when occasionally glimpsed.
      const slot = getResponderSlot(i, cfg.p07AgentIdx, formsLen);
      const spread = (slot - (formsLen - 2) / 2) * 1.4;
      tgtX = cfg.p07EdgeX + 0.5;
      tgtY = cfg.p07EdgeY + spread * 0.4;
      tgtZ = cfg.p07EdgeZ - 1;
      op = 0.02;
      em = 0;
      scale = f.size * 0.5;
      parallaxMul = 0.4;
    }
  } else if (idx === 7) {
    // P08: BEYOND THE WEARER — shapes stay in their natural positions as
    // the shared "experience." Around them, witness rings orbit on various
    // axes (standard viewers + one alt-perception witness on a different
    // axis). Periodic flashes link a witness to a shape, briefly pulsing it.
    parallaxMul = 0.75;
    op = cfg.p08ShapeOpBase;
    em = 0.18;
    // If this shape is currently being "witness-flashed," pulse it
    if (c.witnessFlashShape === i && c.witnessFlashAmp > 0) {
      op = Math.min(1, op + c.witnessFlashAmp * 0.35);
      em = em + c.witnessFlashAmp * 0.6;
      scale = f.size * (1 + c.witnessFlashAmp * 0.12);
    }
  } else if (idx === 8) {
    // OUTRO: after the last principle, animations dissolve into a calm,
    // unstructured ambient drift — shapes settle toward low presence at
    // natural positions, losing all principle-specific affordances.
    parallaxMul = 0.4;
    op = 0.18;
    em = 0.04;
    scale = f.size * 0.85;
    metalness = 0.15;
    roughness = 0.65;
  }

  return {
    op,
    em,
    altOp,
    altScale,
    scale,
    scaleZ,
    rotLock,
    offX,
    offY,
    offZ,
    tgtX,
    tgtY,
    tgtZ,
    parallaxMul,
    metalness,
    roughness,
    edgeOp,
  };
}

// Map shape index -> responder slot (skipping agent)
function getResponderSlot(i: number, agentIdx: number, formsLen: number): number {
  let slot = i;
  if (i > agentIdx) slot = i - 1;
  return slot % (formsLen - 1);
}

// ============================================================================
// Environment component
// ============================================================================
export function Environment({
  onContextPhase,
  continuousIndex,
}: EnvironmentProps) {
  // ----- Tuning panel bindings ---------------------------------------------
  const globalCfg = useControls("Global", {
    amberAccent: DEFAULTS.amberAccent,
    baseMetalness: {
      value: DEFAULTS.baseMetalness,
      min: 0,
      max: 1,
      step: 0.01,
    },
    baseRoughness: {
      value: DEFAULTS.baseRoughness,
      min: 0,
      max: 1,
      step: 0.01,
    },
    breathIntensity: {
      value: DEFAULTS.breathIntensity,
      min: 0,
      max: 0.05,
      step: 0.001,
    },
    breathRate: {
      value: DEFAULTS.breathRate,
      min: 0.05,
      max: 1,
      step: 0.01,
    },
  });

  const p01Cfg = useControls("Principles.P01 Earned", {
    p01SilenceDur: {
      value: DEFAULTS.p01SilenceDur,
      min: 0.3,
      max: 12,
      step: 0.1,
    },
    p01ArrivalDur: {
      value: DEFAULTS.p01ArrivalDur,
      min: 0.2,
      max: 2,
      step: 0.05,
    },
    p01HeldDur: {
      value: DEFAULTS.p01HeldDur,
      min: 0.5,
      max: 5,
      step: 0.1,
    },
    p01RecedeDur: {
      value: DEFAULTS.p01RecedeDur,
      min: 0.3,
      max: 3,
      step: 0.05,
    },
    p01PeakOp: {
      value: DEFAULTS.p01PeakOp,
      min: 0.3,
      max: 1,
      step: 0.01,
    },
    p01RingScale: {
      value: DEFAULTS.p01RingScale,
      min: 1,
      max: 6,
      step: 0.1,
    },
    p01HeldPulseAmp: {
      value: DEFAULTS.p01HeldPulseAmp,
      min: 0,
      max: 0.4,
      step: 0.01,
    },
    p01HeldRingOp: {
      value: DEFAULTS.p01HeldRingOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p01PopStart: {
      value: DEFAULTS.p01PopStart,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p01PopEnd: {
      value: DEFAULTS.p01PopEnd,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p01FlatScaleZ: {
      value: DEFAULTS.p01FlatScaleZ,
      min: 0.01,
      max: 0.3,
      step: 0.01,
    },
  });

  const p02Cfg = useControls("Principles.P02 Anchor", {
    p02OrbitSpeed: {
      value: DEFAULTS.p02OrbitSpeed,
      min: 0,
      max: 0.5,
      step: 0.01,
    },
    p02MouseMul: {
      value: DEFAULTS.p02MouseMul,
      min: 0.5,
      max: 4,
      step: 0.05,
    },
    p02OpBase: {
      value: DEFAULTS.p02OpBase,
      min: 0.1,
      max: 1,
      step: 0.01,
    },
    p02TetherOp: {
      value: DEFAULTS.p02TetherOp,
      min: 0,
      max: 0.5,
      step: 0.01,
    },
  });

  const p03Cfg = useControls("Principles.P03 Diegetic", {
    p03Metalness: {
      value: DEFAULTS.p03Metalness,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p03Roughness: {
      value: DEFAULTS.p03Roughness,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p03Parallax: {
      value: DEFAULTS.p03Parallax,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p03EdgeOp: {
      value: DEFAULTS.p03EdgeOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p03OpBase: {
      value: DEFAULTS.p03OpBase,
      min: 0.2,
      max: 1,
      step: 0.01,
    },
  });

  const p04Cfg = useControls("Principles.P04 Attention", {
    p04DimOp: {
      value: DEFAULTS.p04DimOp,
      min: 0,
      max: 0.5,
      step: 0.01,
    },
    p04FocusOp: {
      value: DEFAULTS.p04FocusOp,
      min: 0.3,
      max: 1,
      step: 0.01,
    },
    p04FocusDur: {
      value: DEFAULTS.p04FocusDur,
      min: 0.3,
      max: 4,
      step: 0.1,
    },
    p04HeldDur: {
      value: DEFAULTS.p04HeldDur,
      min: 0.3,
      max: 4,
      step: 0.1,
    },
    p04RetreatDur: {
      value: DEFAULTS.p04RetreatDur,
      min: 0.2,
      max: 3,
      step: 0.05,
    },
    p04SilenceDur: {
      value: DEFAULTS.p04SilenceDur,
      min: 0.5,
      max: 6,
      step: 0.1,
    },
    p04BracketOp: {
      value: DEFAULTS.p04BracketOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p04BracketSize: {
      value: DEFAULTS.p04BracketSize,
      min: 0.8,
      max: 3,
      step: 0.05,
    },
  });

  const p05Cfg = useControls("Principles.P05 Context", {
    p05CycleDur: {
      value: DEFAULTS.p05CycleDur,
      min: 6,
      max: 30,
      step: 0.5,
    },
    p05HomeColor: DEFAULTS.p05HomeColor,
    p05WorkColor: DEFAULTS.p05WorkColor,
    p05TravelColor: DEFAULTS.p05TravelColor,
    p05WashOp: {
      value: DEFAULTS.p05WashOp,
      min: 0,
      max: 0.4,
      step: 0.01,
    },
  });

  const p06Cfg = useControls("Principles.P06 Transitions", {
    p06HoldADur: {
      value: DEFAULTS.p06HoldADur,
      min: 0.5,
      max: 5,
      step: 0.1,
    },
    p06MorphDur: {
      value: DEFAULTS.p06MorphDur,
      min: 0.2,
      max: 2,
      step: 0.05,
    },
    p06HoldBDur: {
      value: DEFAULTS.p06HoldBDur,
      min: 0.3,
      max: 4,
      step: 0.1,
    },
    p06Stagger: {
      value: DEFAULTS.p06Stagger,
      min: 0,
      max: 2,
      step: 0.05,
    },
    p06ThreadOp: {
      value: DEFAULTS.p06ThreadOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
  });

  const p07Cfg = useControls("Principles.P07 Trust", {
    p07AgentIdx: { value: DEFAULTS.p07AgentIdx, min: 0, max: 5, step: 1 },
    p07EdgeX: { value: DEFAULTS.p07EdgeX, min: -8, max: 8, step: 0.1 },
    p07EdgeY: { value: DEFAULTS.p07EdgeY, min: -5, max: 5, step: 0.1 },
    p07EdgeZ: { value: DEFAULTS.p07EdgeZ, min: -10, max: -2, step: 0.1 },
    p07FocusZ: { value: DEFAULTS.p07FocusZ, min: -10, max: -2, step: 0.1 },
    p07ReasoningDur: {
      value: DEFAULTS.p07ReasoningDur,
      min: 0.1,
      max: 1.5,
      step: 0.05,
    },
    p07ExtendDur: {
      value: DEFAULTS.p07ExtendDur,
      min: 0.1,
      max: 1.5,
      step: 0.05,
    },
    p07ArrivalDur: {
      value: DEFAULTS.p07ArrivalDur,
      min: 0.2,
      max: 2,
      step: 0.05,
    },
    p07HeldDur: {
      value: DEFAULTS.p07HeldDur,
      min: 0.3,
      max: 4,
      step: 0.1,
    },
    p07DismissDur: {
      value: DEFAULTS.p07DismissDur,
      min: 0.2,
      max: 2,
      step: 0.05,
    },
    p07RetractDur: {
      value: DEFAULTS.p07RetractDur,
      min: 0.1,
      max: 1.5,
      step: 0.05,
    },
    p07PauseDur: {
      value: DEFAULTS.p07PauseDur,
      min: 0.2,
      max: 2,
      step: 0.05,
    },
    p07BeamOp: {
      value: DEFAULTS.p07BeamOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p07AgentScale: {
      value: DEFAULTS.p07AgentScale,
      min: 0.3,
      max: 1.5,
      step: 0.05,
    },
    p07ResponderScale: {
      value: DEFAULTS.p07ResponderScale,
      min: 0.6,
      max: 2.5,
      step: 0.05,
    },
  });

  const p08Cfg = useControls("Principles.P08 Beyond Wearer", {
    p08AltWitnessIdx: {
      value: DEFAULTS.p08AltWitnessIdx,
      min: 0,
      max: 4,
      step: 1,
    },
    p08WitnessBaseRadius: {
      value: DEFAULTS.p08WitnessBaseRadius,
      min: 2,
      max: 12,
      step: 0.1,
    },
    p08WitnessRingScale: {
      value: DEFAULTS.p08WitnessRingScale,
      min: 0.3,
      max: 3,
      step: 0.05,
    },
    p08OrbitSpeed: {
      value: DEFAULTS.p08OrbitSpeed,
      min: 0,
      max: 0.5,
      step: 0.01,
    },
    p08FlashInterval: {
      value: DEFAULTS.p08FlashInterval,
      min: 0.5,
      max: 6,
      step: 0.1,
    },
    p08FlashDur: {
      value: DEFAULTS.p08FlashDur,
      min: 0.2,
      max: 2,
      step: 0.05,
    },
    p08WitnessOp: {
      value: DEFAULTS.p08WitnessOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p08HaloOp: {
      value: DEFAULTS.p08HaloOp,
      min: 0,
      max: 1,
      step: 0.01,
    },
    p08ShapeOpBase: {
      value: DEFAULTS.p08ShapeOpBase,
      min: 0.1,
      max: 1,
      step: 0.01,
    },
  });

  const utilCfg = useControls("Utilities", {
    lockToPrinciple: {
      value: DEFAULTS.lockToPrinciple,
      options: LOCK_OPTIONS as unknown as string[],
    },
    "Reset to defaults": button(() => {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      window.location.reload();
    }),
    "Export config (clipboard)": button(() => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY) || "{}";
        navigator.clipboard.writeText(raw);
      } catch {
        /* ignore */
      }
    }),
    _info: folder(
      {
        hint: {
          value: "Press 't' to toggle panel. Settings persist across reloads.",
          editable: false,
        },
      },
      { collapsed: true }
    ),
  });

  // Merge all useControls outputs into a single tuning object for getBehavior
  const tuning: TuningValues = {
    ...globalCfg,
    ...p01Cfg,
    ...p02Cfg,
    ...p03Cfg,
    ...p04Cfg,
    ...p05Cfg,
    ...p06Cfg,
    ...p07Cfg,
    ...p08Cfg,
    lockToPrinciple: utilCfg.lockToPrinciple,
  };
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  // Persist to localStorage whenever any knob changes
  useEffect(() => {
    try {
      const toPersist = { ...tuning };
      delete (toPersist as { lockToPrinciple?: string }).lockToPrinciple;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch {
      /* ignore quota / private mode */
    }
  }, [tuning]);

  // ----- Forms (the 6 core shapes) ------------------------------------------
  const forms = useMemo(
    () => [
      { pos: [-5.5, 3, -7], size: 0.55, depth: 2.5, color: "#4a6fa5" },
      { pos: [5.5, -2.5, -6], size: 0.4, depth: 2, color: "#6b8cce" },
      { pos: [-4, -3.5, -9], size: 0.7, depth: 3.5, color: "#3d5a80" },
      { pos: [6, 3.5, -8], size: 0.5, depth: 3, color: "#5b7db5" },
      { pos: [-6.5, 0.5, -11], size: 0.85, depth: 4, color: "#2c4a6e" },
      { pos: [4.5, -4, -5], size: 0.35, depth: 1.5, color: "#8faad0" },
    ],
    []
  );

  // ----- Geometries ---------------------------------------------------------
  const geometries = useMemo(
    () => [
      new THREE.SphereGeometry(1, 24, 24),
      new THREE.OctahedronGeometry(1, 0),
      new THREE.TorusGeometry(1, 0.3, 12, 24),
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.BoxGeometry(1, 1, 1),
    ],
    []
  );
  const altGeometries = useMemo(
    () => [
      new THREE.BoxGeometry(1.2, 1.2, 0.1),
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.CircleGeometry(0.8, 32),
      new THREE.RingGeometry(0.55, 0.9, 32),
      new THREE.PlaneGeometry(1, 1.4),
      new THREE.RingGeometry(0.45, 0.85, 5, 1, 0, Math.PI * 1.3), // partial ring for alt viewer
    ],
    []
  );
  const edgeGeometries = useMemo(
    () => geometries.map((g) => new THREE.EdgesGeometry(g)),
    [geometries]
  );

  // Particles
  const particles = useMemo(() => {
    const count = 120;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 25;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    return pos;
  }, []);

  // ----- Main & aux refs ----------------------------------------------------
  const meshRefs = useRef<THREE.Mesh[]>([]);
  const matRefs = useRef<THREE.MeshStandardMaterial[]>([]);
  const altMeshRefs = useRef<THREE.Mesh[]>([]);
  const altMatRefs = useRef<THREE.MeshStandardMaterial[]>([]);
  const edgeSegRefs = useRef<THREE.LineSegments[]>([]);
  const edgeMatRefs = useRef<THREE.LineBasicMaterial[]>([]);
  const particleRef = useRef<THREE.Points>(null!);

  // Aux mesh refs (for non-line aux geometry)
  const arrivalRingRef = useRef<THREE.Mesh>(null!);
  const arrivalRingMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const bodyIndicatorRef = useRef<THREE.Mesh>(null!);
  const bodyIndicatorMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const washRef = useRef<THREE.Mesh>(null!);
  const washMatRef = useRef<THREE.MeshBasicMaterial>(null!);

  // Pre-built aux geometries
  const arrivalRingGeo = useMemo(
    () => new THREE.TorusGeometry(1, 0.02, 16, 64),
    []
  );
  const bodyIndicatorGeo = useMemo(
    () => new THREE.RingGeometry(0.16, 0.22, 32),
    []
  );
  const washGeo = useMemo(() => new THREE.PlaneGeometry(50, 30), []);

  // Witness rings (P08): 5 thin tori orbiting at different radii and planes
  const witnessRings = useMemo(() => {
    return [0, 1, 2, 3, 4].map((i) => {
      const geo = new THREE.TorusGeometry(0.55 + i * 0.08, 0.015, 10, 64);
      const mat = new THREE.MeshBasicMaterial({
        color: "#8faad0",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      void i;
      return mesh;
    });
  }, []);

  // Line objects — constructed as Three.Line instances so we can render via
  // <primitive /> (avoids JSX <line> colliding with SVG line element)
  const tetherLines = useMemo(
    () =>
      forms.map(() => {
        const geo = buildLineGeo(2);
        const mat = new THREE.LineBasicMaterial({
          color: DEFAULTS.amberAccent,
          transparent: true,
          opacity: 0,
        });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        line.frustumCulled = false;
        return line;
      }),
    [forms]
  );
  const bracketLines = useMemo(
    () =>
      [0, 1, 2, 3].map(() => {
        const geo = buildLineGeo(3);
        const mat = new THREE.LineBasicMaterial({
          color: DEFAULTS.amberAccent,
          transparent: true,
          opacity: 0,
        });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        line.frustumCulled = false;
        return line;
      }),
    []
  );
  const threadLine = useMemo(() => {
    const geo = buildLineGeo(2);
    const mat = new THREE.LineBasicMaterial({
      color: DEFAULTS.amberAccent,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    return line;
  }, []);
  const beamLine = useMemo(() => {
    const geo = buildLineGeo(2);
    const mat = new THREE.LineBasicMaterial({
      color: DEFAULTS.amberAccent,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.frustumCulled = false;
    return line;
  }, []);
  const haloLines = useMemo(
    () =>
      forms.slice(1).map(() => {
        const geo = buildLineGeo(16);
        const mat = new THREE.LineBasicMaterial({
          color: DEFAULTS.amberAccent,
          transparent: true,
          opacity: 0,
        });
        const line = new THREE.Line(geo, mat);
        line.visible = false;
        line.frustumCulled = false;
        return line;
      }),
    [forms]
  );

  // ----- Animation state refs (not reactive) --------------------------------
  const fs = useRef(
    forms.map(() => ({
      op: 0.5,
      em: 0,
      altOp: 0,
      altScale: 0,
      scale: 0.5,
      scaleZ: 1,
      rotLock: 0,
      offX: 0,
      offY: 0,
      offZ: 0,
      tgtX: 0,
      tgtY: 0,
      tgtZ: 0,
      parallaxMul: 1,
      metalness: 0.2,
      roughness: 0.55,
      edgeOp: 0,
    }))
  );

  // P01 earn scheduler
  const earnState = useRef<EarnState>({
    shape: 0,
    phase: "silence",
    amp: 0,
    flare: 0,
    popProgress: 0,
    ringRadius: 0,
    ringOp: 0,
    ringPos: [0, 0, 0],
  });
  const earnTimer = useRef(0);
  const wasP01Active = useRef(false);

  // ----- Reduced motion preference ----------------------------------------
  // Stored in a ref so changes to the media query don't force a re-render
  // of the scene. When reduced, dt and elapsed time are clamped to 0 so all
  // scheduled animations freeze; mouse parallax is also zeroed.
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mql.matches;
    const onChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // P08 witness flash scheduler
  const witnessFlashState = useRef({
    timer: 0, // time since last flash began
    flashShape: -1, // shape currently being flashed, -1 if none
    flashWitness: -1, // witness ring index
    flashAmp: 0, // 0..1 intensity
  });

  // P04 attention scheduler
  const attnState = useRef<AttnState>({
    shape: 0,
    phase: "silence",
    amp: 0,
    bracketOp: 0,
    bracketPos: [0, 0, 0],
  });
  const attnTimer = useRef(0);

  // P05 context state
  const ctxStateRef = useRef<CtxState>({ idx: 0, blend: 0 });

  // P06 handoff state
  const handoffRef = useRef<HandoffState>({
    fromIdx: 0,
    toIdx: 1,
    threadOp: 0,
  });

  // P07 agent scheduler
  const agentState = useRef<AgentState>({
    activeResponder: -1,
    agentPulse: 0,
    beamExtent: 0,
    beamOp: 0,
    responderAmp: 0,
  });
  const agentTimer = useRef(0);
  const agentResponderIdx = useRef(0); // which responder slot is active
  type AgentPhase =
    | "reasoning"
    | "extending"
    | "arriving"
    | "held"
    | "dismissing"
    | "retracting"
    | "pause";
  const agentPhase = useRef<AgentPhase>("reasoning");

  // ==========================================================================
  // Main frame loop
  // ==========================================================================
  useFrame((state, dtRaw) => {
    // Freeze scheduled motion + world time when the user prefers reduced motion.
    const reduced = prefersReducedMotion.current;
    const dt = reduced ? 0 : dtRaw;
    const t = reduced ? 0 : state.clock.elapsedTime;
    const cfg = tuningRef.current;

    // Smooth mouse (zeroed under reduced motion so there is no parallax drift)
    if (reduced) {
      smooth.x = 0;
      smooth.y = 0;
    } else {
      smooth.x += (mouse.x - smooth.x) * 0.02;
      smooth.y += (mouse.y - smooth.y) * 0.02;
    }

    if (particleRef.current) {
      particleRef.current.rotation.y = t * 0.004 + smooth.x * 0.05;
      particleRef.current.rotation.x = t * 0.002 + smooth.y * 0.04;
    }

    // ----- Determine effective principle index (handles lock) ---------------
    // idx range: 0..7 = principles, 8 = outro (post-last-card baseline).
    const MAX_IDX = 8;
    let effectiveIdx = continuousIndex;
    if (cfg.lockToPrinciple !== "none") {
      const n = parseInt(cfg.lockToPrinciple.slice(1), 10);
      if (!isNaN(n)) effectiveIdx = n - 1; // "P01" -> 0
    }
    const idxA = Math.min(Math.max(0, Math.floor(effectiveIdx)), MAX_IDX);
    const idxB = Math.min(idxA + 1, MAX_IDX);
    const blend = clamp01(effectiveIdx - Math.floor(effectiveIdx));
    const p01Active = idxA === 0 || idxB === 0;
    const p04Active = idxA === 3 || idxB === 3;
    const p05Active = idxA === 4 || idxB === 4;
    const p06Active = idxA === 5 || idxB === 5;
    const p07Active = idxA === 6 || idxB === 6;
    const p08Active = idxA === 7 || idxB === 7;

    // ----- P01 earn scheduler -----------------------------------------------
    if (p01Active) {
      // On first entry, skip the silence phase so the user sees an arrival
      // within the first fraction of a second instead of waiting for the
      // cycle to advance through silence.
      if (!wasP01Active.current) {
        earnTimer.current = cfg.p01SilenceDur;
        earnState.current.shape = Math.floor(Math.random() * forms.length);
      }
      wasP01Active.current = true;
      earnTimer.current += dt;

      const silence = cfg.p01SilenceDur;
      const arrival = cfg.p01ArrivalDur;
      const held = cfg.p01HeldDur;
      const recede = cfg.p01RecedeDur;
      const total = silence + arrival + held + recede;
      const prev = earnTimer.current - dt;
      const prevCycle = Math.floor(prev / total);
      const curCycle = Math.floor(earnTimer.current / total);
      const tc = earnTimer.current % total;

      // Rollover: pick a new shape for the new cycle
      if (curCycle !== prevCycle) {
        let next = Math.floor(Math.random() * forms.length);
        if (next === earnState.current.shape && forms.length > 1) {
          next = (next + 1) % forms.length;
        }
        earnState.current.shape = next;
      }

      let phase: EarnState["phase"] = "silence";
      let amp = 0;
      let flare = 0;
      let popProgress = 0;
      let ringRadius = 0; // 0..1 normalized (world radius applied in render)
      let ringOp = 0;

      if (tc < silence) {
        phase = "silence";
      } else if (tc < silence + arrival) {
        phase = "arrival";
        const lt = (tc - silence) / arrival;
        amp = clamp01(easeOutBack(lt));
        flare = Math.sin(lt * Math.PI);
        // 2D→3D pop: depth unfolds between p01PopStart and p01PopEnd
        const popT = clamp01(
          (lt - cfg.p01PopStart) / Math.max(0.01, cfg.p01PopEnd - cfg.p01PopStart)
        );
        popProgress = easeOutBack(popT);
        // Ring grows with arrival and reaches full radius by the pop moment
        ringRadius = clamp01(lt / Math.max(0.01, cfg.p01PopEnd));
        ringOp = Math.sin(lt * Math.PI) * 0.95;
      } else if (tc < silence + arrival + held) {
        phase = "held";
        amp = 1;
        flare = 0;
        popProgress = 1;
        const heldT = (tc - silence - arrival) / held;
        ringRadius = 1 + Math.sin(heldT * Math.PI * 2) * 0.04;
        ringOp = cfg.p01HeldRingOp * Math.sin(heldT * Math.PI);
      } else {
        phase = "recede";
        const lt = (tc - silence - arrival - held) / recede;
        amp = 1 - easeInOutCubic(clamp01(lt));
        popProgress = 1; // depth stays; only opacity/scale recede
        ringRadius = 1 - clamp01(lt);
        ringOp = 0;
      }

      const s = forms[earnState.current.shape];
      earnState.current.phase = phase;
      earnState.current.amp = amp;
      earnState.current.flare = flare;
      earnState.current.popProgress = popProgress;
      earnState.current.ringRadius = ringRadius;
      earnState.current.ringOp = ringOp;
      earnState.current.ringPos = [s.pos[0], s.pos[1], s.pos[2]];
    } else {
      wasP01Active.current = false;
      earnState.current.phase = "silence";
      earnState.current.amp = 0;
      earnState.current.flare = 0;
      earnState.current.popProgress = 0;
      earnState.current.ringOp = 0;
    }

    // ----- P04 attention scheduler -----------------------------------------
    if (p04Active) {
      attnTimer.current += dt;
      const focus = cfg.p04FocusDur;
      const held = cfg.p04HeldDur;
      const retreat = cfg.p04RetreatDur;
      const silence = cfg.p04SilenceDur;
      const total = focus + held + retreat + silence;
      const tc = attnTimer.current % total;

      let phase: AttnState["phase"] = "silence";
      let amp = 0;
      let bracketOp = 0;

      if (tc < focus) {
        phase = "focus";
        amp = easeInOutCubic(clamp01(tc / focus));
        bracketOp = amp * cfg.p04BracketOp * 0.6;
      } else if (tc < focus + held) {
        phase = "held";
        amp = 1;
        const lt = (tc - focus) / held;
        // Brackets: draw in first third, hold, fade last third
        bracketOp = cfg.p04BracketOp * Math.sin(clamp01(lt) * Math.PI);
      } else if (tc < focus + held + retreat) {
        phase = "retreat";
        const lt = (tc - focus - held) / retreat;
        amp = 1 - easeInOutCubic(clamp01(lt));
        bracketOp = 0;
      } else {
        phase = "silence";
        amp = 0;
        bracketOp = 0;
      }

      // Advance to next shape at cycle rollover
      if (tc < dt + 0.0001 && attnTimer.current > total) {
        attnState.current.shape =
          (attnState.current.shape + 1) % forms.length;
      }

      const s = forms[attnState.current.shape];
      attnState.current.phase = phase;
      attnState.current.amp = amp;
      attnState.current.bracketOp = bracketOp;
      attnState.current.bracketPos = [s.pos[0], s.pos[1], s.pos[2]];
    } else {
      attnState.current.phase = "silence";
      attnState.current.amp = 0;
      attnState.current.bracketOp = 0;
    }

    // ----- P05 context cycling ---------------------------------------------
    const ctxCycle = cfg.p05CycleDur;
    const ctxTC = (t % ctxCycle) / ctxCycle; // 0..1 across full 3-context cycle
    const seg = ctxTC * 3; // 0..3
    const segIdx = Math.floor(seg) % 3;
    const segLocal = seg - Math.floor(seg); // 0..1 within segment
    const TRANSITION_FRACTION = 0.25; // last 25% of each segment = transition
    let blendWithin = 0;
    if (segLocal > 1 - TRANSITION_FRACTION) {
      const lt = (segLocal - (1 - TRANSITION_FRACTION)) / TRANSITION_FRACTION;
      blendWithin = easeInOutCubic(clamp01(lt));
    }
    ctxStateRef.current.idx = segIdx as 0 | 1 | 2;
    ctxStateRef.current.blend = blendWithin;

    // Legacy context phase for the cards (0..1 warm/cool) - map from idx+blend
    // 0 (home/warm) -> 0, 1 (work/cool) -> 1, 2 (travel) -> 0.5
    const ctxPhaseMap = [0, 1, 0.5];
    const curPhase = ctxPhaseMap[segIdx];
    const nextPhase = ctxPhaseMap[(segIdx + 1) % 3];
    const legacyCtxPhase = lerp(curPhase, nextPhase, blendWithin);
    if (onContextPhase) {
      onContextPhase(legacyCtxPhase);
    }

    // ----- P06 handoff thread ----------------------------------------------
    if (p06Active) {
      // Determine which adjacent pair is currently in the morph overlap
      const P1 = cfg.p06HoldADur;
      const P2 = cfg.p06MorphDur;
      const P3 = cfg.p06HoldBDur;
      const P4 = cfg.p06MorphDur;
      const CYCLE = P1 + P2 + P3 + P4;
      let bestPairFrom = -1;
      let bestPairTo = -1;
      let bestOverlap = 0;
      for (let i = 0; i < forms.length - 1; i++) {
        const pA = (t + i * cfg.p06Stagger) % CYCLE;
        const pB = (t + (i + 1) * cfg.p06Stagger) % CYCLE;
        // A shape is "in motion" during P2 or P4 phases
        const aMoving = pA >= P1 && pA < P1 + P2 + P3 + P4 && (pA < P1 + P2 || pA >= P1 + P2 + P3);
        const bMoving = pB >= P1 && pB < P1 + P2 + P3 + P4 && (pB < P1 + P2 || pB >= P1 + P2 + P3);
        if (aMoving && bMoving) {
          // Compute distances into movement phases for overlap strength
          const aT = pA < P1 + P2 ? (pA - P1) / P2 : (pA - P1 - P2 - P3) / P4;
          const bT = pB < P1 + P2 ? (pB - P1) / P2 : (pB - P1 - P2 - P3) / P4;
          const overlap = Math.sin(aT * Math.PI) * Math.sin(bT * Math.PI);
          if (overlap > bestOverlap) {
            bestOverlap = overlap;
            bestPairFrom = i;
            bestPairTo = i + 1;
          }
        }
      }
      handoffRef.current.fromIdx = bestPairFrom;
      handoffRef.current.toIdx = bestPairTo;
      handoffRef.current.threadOp =
        bestOverlap * cfg.p06ThreadOp;
    } else {
      handoffRef.current.threadOp *= 0.9;
    }

    // ----- P07 agent scheduler ---------------------------------------------
    if (p07Active) {
      agentTimer.current += dt;
      const durs: Record<AgentPhase, number> = {
        reasoning: cfg.p07ReasoningDur,
        extending: cfg.p07ExtendDur,
        arriving: cfg.p07ArrivalDur,
        held: cfg.p07HeldDur,
        dismissing: cfg.p07DismissDur,
        retracting: cfg.p07RetractDur,
        pause: cfg.p07PauseDur,
      };
      const order: AgentPhase[] = [
        "reasoning",
        "extending",
        "arriving",
        "held",
        "dismissing",
        "retracting",
        "pause",
      ];
      const curDur = durs[agentPhase.current];
      if (agentTimer.current >= curDur) {
        agentTimer.current -= curDur;
        const nextIdx = (order.indexOf(agentPhase.current) + 1) % order.length;
        agentPhase.current = order[nextIdx];
        if (agentPhase.current === "reasoning") {
          // Advance responder
          const totalResponders = forms.length - 1;
          agentResponderIdx.current =
            (agentResponderIdx.current + 1) % totalResponders;
        }
      }
      const phaseT = clamp01(agentTimer.current / curDur);

      // Derive values per phase
      let pulse = 0;
      let beamExtent = 0;
      let beamOp = 0;
      let respAmp = 0;
      let activeResp = -1;

      const totalResponders = forms.length - 1;
      const agentIdxCfg = cfg.p07AgentIdx;
      // Map responder slot -> shape index (skip agent)
      const respShapeIdx = (() => {
        const slot = agentResponderIdx.current;
        return slot < agentIdxCfg ? slot : slot + 1;
      })();

      if (agentPhase.current === "reasoning") {
        pulse = Math.sin(phaseT * Math.PI);
      } else if (agentPhase.current === "extending") {
        beamExtent = easeInOutCubic(phaseT);
        beamOp = cfg.p07BeamOp * clamp01(phaseT * 2);
        activeResp = respShapeIdx;
      } else if (agentPhase.current === "arriving") {
        beamExtent = 1;
        beamOp = cfg.p07BeamOp;
        respAmp = easeOutBack(phaseT);
        activeResp = respShapeIdx;
      } else if (agentPhase.current === "held") {
        beamExtent = 1;
        beamOp = cfg.p07BeamOp * 0.8;
        respAmp = 1;
        activeResp = respShapeIdx;
        // Subtle secondary pulse to imply "consistency"
        pulse = Math.sin(t * 4) * 0.08;
      } else if (agentPhase.current === "dismissing") {
        beamExtent = 1;
        beamOp = cfg.p07BeamOp * 0.6;
        respAmp = 1 - easeInOutCubic(phaseT);
        activeResp = respShapeIdx;
      } else if (agentPhase.current === "retracting") {
        beamExtent = 1 - easeInOutCubic(phaseT);
        beamOp = cfg.p07BeamOp * (1 - phaseT);
        respAmp = 0;
        activeResp = -1;
      } else {
        // pause
        beamExtent = 0;
        beamOp = 0;
        respAmp = 0;
        activeResp = -1;
      }

      agentState.current.agentPulse = pulse;
      agentState.current.beamExtent = beamExtent;
      agentState.current.beamOp = beamOp;
      agentState.current.responderAmp = respAmp;
      agentState.current.activeResponder = activeResp;

      // Unused totalResponders reference to avoid lint
      void totalResponders;
    } else {
      agentState.current.beamOp *= 0.9;
      agentState.current.activeResponder = -1;
    }

    // ----- P08 witness flash scheduler -------------------------------------
    // Cycle: flashDur of active flash, then (interval - flashDur) idle.
    if (p08Active) {
      const wf = witnessFlashState.current;
      wf.timer += dt;
      const interval = Math.max(cfg.p08FlashInterval, cfg.p08FlashDur + 0.2);
      const flashDur = cfg.p08FlashDur;
      if (wf.timer >= interval) {
        wf.timer = wf.timer % interval;
        wf.flashShape = Math.floor(Math.random() * forms.length);
        wf.flashWitness = Math.floor(Math.random() * witnessRings.length);
      }
      if (wf.timer < flashDur && wf.flashShape >= 0) {
        wf.flashAmp = Math.sin((wf.timer / flashDur) * Math.PI);
      } else {
        wf.flashAmp = 0;
        wf.flashShape = -1;
      }
    } else {
      witnessFlashState.current.flashAmp *= 0.9;
      if (witnessFlashState.current.flashAmp < 0.01) {
        witnessFlashState.current.flashShape = -1;
      }
    }

    // ----- Breath -----------------------------------------------------------
    const breath =
      1 +
      Math.sin(t * Math.PI * 2 * cfg.breathRate) * cfg.breathIntensity;

    // ----- Build behavior context -------------------------------------------
    const bctx: BehaviorCtx = {
      earn: earnState.current,
      attn: attnState.current,
      p04Dim: cfg.p04DimOp,
      ctx: ctxStateRef.current,
      contextPhase: legacyCtxPhase,
      handoff: handoffRef.current,
      agent: agentState.current,
      witnessFlashShape: witnessFlashState.current.flashShape,
      witnessFlashAmp: witnessFlashState.current.flashAmp,
      breath,
      tuning: cfg,
    };

    // ----- Apply to each form -----------------------------------------------
    for (let i = 0; i < forms.length; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      const altMesh = altMeshRefs.current[i];
      const altMat = altMatRefs.current[i];
      const edgeSeg = edgeSegRefs.current[i];
      const edgeMat = edgeMatRefs.current[i];
      if (!mesh || !mat) continue;

      const f = forms[i];
      const s = fs.current[i];

      const a = getBehavior(idxA, i, t, f, bctx, forms.length);
      const b = getBehavior(idxB, i, t, f, bctx, forms.length);

      // Crossfade all numeric channels
      const rate = 0.12;
      s.op += (lerp(a.op, b.op, blend) - s.op) * rate;
      s.em += (lerp(a.em, b.em, blend) - s.em) * rate;
      s.altOp += (lerp(a.altOp, b.altOp, blend) - s.altOp) * rate;
      s.altScale += (lerp(a.altScale, b.altScale, blend) - s.altScale) * rate;
      s.scale += (lerp(a.scale, b.scale, blend) - s.scale) * rate;
      s.scaleZ += (lerp(a.scaleZ, b.scaleZ, blend) - s.scaleZ) * 0.18;
      s.rotLock += (lerp(a.rotLock, b.rotLock, blend) - s.rotLock) * 0.18;
      s.offX += (lerp(a.offX, b.offX, blend) - s.offX) * 0.08;
      s.offY += (lerp(a.offY, b.offY, blend) - s.offY) * 0.08;
      s.offZ += (lerp(a.offZ, b.offZ, blend) - s.offZ) * 0.08;
      s.tgtX += (lerp(a.tgtX, b.tgtX, blend) - s.tgtX) * 0.08;
      s.tgtY += (lerp(a.tgtY, b.tgtY, blend) - s.tgtY) * 0.08;
      s.tgtZ += (lerp(a.tgtZ, b.tgtZ, blend) - s.tgtZ) * 0.08;
      s.parallaxMul +=
        (lerp(a.parallaxMul, b.parallaxMul, blend) - s.parallaxMul) * rate;
      s.metalness +=
        (lerp(a.metalness, b.metalness, blend) - s.metalness) * rate;
      s.roughness +=
        (lerp(a.roughness, b.roughness, blend) - s.roughness) * rate;
      s.edgeOp += (lerp(a.edgeOp, b.edgeOp, blend) - s.edgeOp) * rate;

      // Apply position with parallax + micro-wobble
      const px = smooth.x * f.depth * 0.7 * s.parallaxMul;
      const py = smooth.y * f.depth * 0.5 * s.parallaxMul;
      mesh.position.x = s.tgtX + px + s.offX;
      mesh.position.y =
        s.tgtY +
        py +
        Math.sin(t * 0.2 + i * 2.5) * 0.1 +
        s.offY;
      mesh.position.z =
        s.tgtZ + Math.cos(t * 0.12 + i) * 0.06 + s.offZ;

      // Rotation: ambient drift gated by rotLock (1 = face camera, 0 = free)
      const freeX = smooth.y * 0.05 + t * 0.02;
      const freeY = smooth.x * 0.07 + t * 0.025;
      const freeRot = 1 - s.rotLock;
      mesh.rotation.x = freeX * freeRot;
      mesh.rotation.y = freeY * freeRot;
      mesh.rotation.z = 0;
      // Independent Z-depth so P01's 2D→3D reveal works without affecting X/Y
      const scl = s.scale * breath;
      mesh.scale.set(scl, scl, scl * s.scaleZ);

      mat.opacity = s.op;
      mat.metalness = s.metalness;
      mat.roughness = s.roughness;

      // P05 color lerp toward context color
      if (p05Active) {
        const colorBlend = idxA === 4 ? 1 - blend : blend;
        const homeColor = new THREE.Color(cfg.p05HomeColor);
        const workColor = new THREE.Color(cfg.p05WorkColor);
        const travelColor = new THREE.Color(cfg.p05TravelColor);
        const ctxColors = [homeColor, workColor, travelColor];
        const from = ctxColors[ctxStateRef.current.idx];
        const to = ctxColors[(ctxStateRef.current.idx + 1) % 3];
        const ctxC = new THREE.Color().lerpColors(
          from,
          to,
          ctxStateRef.current.blend
        );
        const baseColor = new THREE.Color(f.color);
        mat.emissive.lerpColors(baseColor, ctxC, colorBlend);
        mat.emissiveIntensity = lerp(s.em, 0.35, colorBlend);
      } else {
        mat.emissive.set(f.color);
        mat.emissiveIntensity = s.em;
      }

      // Alt mesh (used by P06 morph counterpart)
      if (altMesh && altMat) {
        altMesh.position.copy(mesh.position);
        altMesh.rotation.copy(mesh.rotation);
        altMesh.scale.setScalar(f.size * s.altScale * breath);
        altMat.opacity = s.altOp;
        altMat.emissiveIntensity = s.em * 0.4;
        altMesh.visible = s.altOp > 0.01;
        altMat.color.set(f.color);
        altMat.emissive.set(f.color);
      }

      // P03 edge wireframe overlay
      if (edgeSeg && edgeMat) {
        edgeSeg.position.copy(mesh.position);
        edgeSeg.rotation.copy(mesh.rotation);
        const escl = s.scale * breath * 1.005;
        edgeSeg.scale.set(escl, escl, escl * s.scaleZ);
        edgeMat.opacity = s.edgeOp;
        edgeMat.color.set(cfg.amberAccent);
        edgeSeg.visible = s.edgeOp > 0.01;
      }
    }

    // ----- Aux meshes -------------------------------------------------------
    const amberColor = new THREE.Color(cfg.amberAccent);

    // Arrival ring (P01) — follows the earning shape's actual rendered
    // position each frame so it visibly "circles" the shape, calling it out.
    if (arrivalRingRef.current && arrivalRingMatRef.current) {
      const es = earnState.current;
      const earningMesh = meshRefs.current[es.shape];
      const earningForm = forms[es.shape];
      if (earningMesh && earningForm) {
        // Stick to the mesh's world position (includes wobble — ring wobbles with it)
        arrivalRingRef.current.position.copy(earningMesh.position);
        // Nudge ring slightly forward (toward camera) so it never gets buried inside the shape
        arrivalRingRef.current.position.z += 0.02;
        // Ring world radius = shape.size * multiplier * normalized phase (0..1+)
        const worldRadius =
          earningForm.size * cfg.p01RingScale * es.ringRadius;
        arrivalRingRef.current.scale.setScalar(Math.max(0.001, worldRadius));
      }
      arrivalRingMatRef.current.opacity = es.ringOp * (idxA === 0 ? 1 - blend : blend);
      if (!p01Active) arrivalRingMatRef.current.opacity = 0;
      arrivalRingRef.current.visible = arrivalRingMatRef.current.opacity > 0.01;
      arrivalRingMatRef.current.color.copy(amberColor);
    }

    // Body indicator (P02)
    if (bodyIndicatorRef.current && bodyIndicatorMatRef.current) {
      const p02Weight = (idxA === 1 ? 1 - blend : 0) + (idxB === 1 ? blend : 0);
      bodyIndicatorRef.current.visible = p02Weight > 0.01;
      bodyIndicatorRef.current.position.set(
        smooth.x * 0.3,
        smooth.y * 0.2,
        -4
      );
      const pulse = 1 + Math.sin(t * 1.5) * 0.05;
      bodyIndicatorRef.current.scale.setScalar(pulse);
      bodyIndicatorMatRef.current.opacity = 0.25 * p02Weight;
      bodyIndicatorMatRef.current.color.copy(amberColor);
    }

    // Tether lines (P02): each shape -> origin
    const p02Weight = (idxA === 1 ? 1 - blend : 0) + (idxB === 1 ? blend : 0);
    for (let i = 0; i < forms.length; i++) {
      const line = tetherLines[i];
      if (!line) continue;
      const mesh = meshRefs.current[i];
      if (!mesh) continue;
      const mat = line.material as THREE.LineBasicMaterial;
      const geo = line.geometry;
      const positions = geo.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, mesh.position.x, mesh.position.y, mesh.position.z);
      positions.setXYZ(1, smooth.x * 0.3, smooth.y * 0.2, -4);
      positions.needsUpdate = true;
      line.visible = p02Weight > 0.01;
      mat.opacity = cfg.p02TetherOp * p02Weight;
      mat.color.copy(amberColor);
    }

    // Attention brackets (P04): 4 L-shapes around focused shape
    const p04Weight = (idxA === 3 ? 1 - blend : 0) + (idxB === 3 ? blend : 0);
    const as = attnState.current;
    const focusedShape = forms[as.shape];
    let focusedMesh: THREE.Mesh | null = null;
    if (focusedShape) {
      focusedMesh = meshRefs.current[as.shape] || null;
    }
    for (let b = 0; b < 4; b++) {
      const line = bracketLines[b];
      if (!line || !focusedMesh) continue;
      const mat = line.material as THREE.LineBasicMaterial;
      const geo = line.geometry;
      // Brackets at 4 corners of a square around focused shape
      const corners = [
        [-1, 1],
        [1, 1],
        [1, -1],
        [-1, -1],
      ];
      const armLen = 0.35 * cfg.p04BracketSize;
      const halfSize = cfg.p04BracketSize;
      const [cx, cy] = corners[b];
      const cornerX = focusedMesh.position.x + cx * halfSize;
      const cornerY = focusedMesh.position.y + cy * halfSize;
      const cornerZ = focusedMesh.position.z;
      const positions = geo.attributes.position as THREE.BufferAttribute;
      // L-bracket: 3 points forming an L oriented outward from the shape
      positions.setXYZ(0, cornerX - cx * armLen, cornerY, cornerZ);
      positions.setXYZ(1, cornerX, cornerY, cornerZ);
      positions.setXYZ(2, cornerX, cornerY - cy * armLen, cornerZ);
      positions.needsUpdate = true;
      line.visible = as.bracketOp * p04Weight > 0.01;
      mat.opacity = as.bracketOp * p04Weight;
      mat.color.copy(amberColor);
    }

    // Context wash (P05): background plane tinted with current context color
    if (washRef.current && washMatRef.current) {
      const p05Weight = (idxA === 4 ? 1 - blend : 0) + (idxB === 4 ? blend : 0);
      washRef.current.visible = p05Weight > 0.01;
      washRef.current.position.set(0, 0, -13);
      const ctxColors = [
        new THREE.Color(cfg.p05HomeColor),
        new THREE.Color(cfg.p05WorkColor),
        new THREE.Color(cfg.p05TravelColor),
      ];
      const from = ctxColors[ctxStateRef.current.idx];
      const to = ctxColors[(ctxStateRef.current.idx + 1) % 3];
      const blended = new THREE.Color().lerpColors(
        from,
        to,
        ctxStateRef.current.blend
      );
      washMatRef.current.color.copy(blended);
      washMatRef.current.opacity = cfg.p05WashOp * p05Weight;
    }

    // Handoff thread (P06)
    {
      const p06Weight = (idxA === 5 ? 1 - blend : 0) + (idxB === 5 ? blend : 0);
      const ho = handoffRef.current;
      const mat = threadLine.material as THREE.LineBasicMaterial;
      const positions = threadLine.geometry.attributes
        .position as THREE.BufferAttribute;
      if (ho.fromIdx >= 0 && ho.toIdx >= 0) {
        const mA = meshRefs.current[ho.fromIdx];
        const mB = meshRefs.current[ho.toIdx];
        if (mA && mB) {
          positions.setXYZ(0, mA.position.x, mA.position.y, mA.position.z);
          positions.setXYZ(1, mB.position.x, mB.position.y, mB.position.z);
          positions.needsUpdate = true;
        }
      }
      mat.opacity = ho.threadOp * p06Weight;
      threadLine.visible = mat.opacity > 0.01;
      mat.color.copy(amberColor);
    }

    // Agent beam (P07)
    {
      const p07Weight = (idxA === 6 ? 1 - blend : 0) + (idxB === 6 ? blend : 0);
      const ag = agentState.current;
      const agentShapeIdx = cfg.p07AgentIdx;
      const agentMesh = meshRefs.current[agentShapeIdx];
      const respMesh =
        ag.activeResponder >= 0
          ? meshRefs.current[ag.activeResponder]
          : null;
      const mat = beamLine.material as THREE.LineBasicMaterial;
      if (agentMesh && respMesh) {
        const positions = beamLine.geometry.attributes
          .position as THREE.BufferAttribute;
        positions.setXYZ(
          0,
          agentMesh.position.x,
          agentMesh.position.y,
          agentMesh.position.z
        );
        const ext = ag.beamExtent;
        positions.setXYZ(
          1,
          lerp(agentMesh.position.x, respMesh.position.x, ext),
          lerp(agentMesh.position.y, respMesh.position.y, ext),
          lerp(agentMesh.position.z, respMesh.position.z, ext)
        );
        positions.needsUpdate = true;
      }
      mat.opacity = ag.beamOp * p07Weight;
      beamLine.visible = mat.opacity > 0.01;
      mat.color.copy(amberColor);
    }

    // Witness rings (P08): orbit around scene center on different axes.
    // Ring index cfg.p08AltWitnessIdx is the "alt-perception" witness —
    // amber, rotating on a perpendicular axis at different speed.
    {
      const p08Weight = (idxA === 7 ? 1 - blend : 0) + (idxB === 7 ? blend : 0);
      const altIdx = cfg.p08AltWitnessIdx;
      for (let k = 0; k < witnessRings.length; k++) {
        const ring = witnessRings[k];
        const mat = ring.material as THREE.MeshBasicMaterial;
        const isAlt = k === altIdx;

        // Scene center (roughly where shapes live)
        const cx = smooth.x * 0.4;
        const cy = smooth.y * 0.3;
        const cz = -7;

        // Orbit parameters per ring
        const radius = cfg.p08WitnessBaseRadius + k * 0.55;
        const speed = cfg.p08OrbitSpeed * (isAlt ? 1.6 : 1) * (1 + k * 0.08);
        const angle = t * speed + k * (Math.PI / 2.5);

        if (isAlt) {
          // Alt witness: rotates on Y/Z plane (perpendicular to standard XY)
          ring.position.set(
            cx + Math.cos(angle) * radius * 0.55,
            cy + Math.sin(angle * 1.3) * radius * 0.4,
            cz + Math.sin(angle) * radius * 0.55
          );
          ring.rotation.set(Math.PI / 2, angle * 0.7, angle * 0.4);
          mat.color.copy(amberColor);
          mat.opacity = cfg.p08WitnessOp * 1.2 * p08Weight;
        } else {
          // Standard witnesses: tilted XY orbits around the scene
          const tilt = 0.2 + k * 0.08;
          ring.position.set(
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius * Math.cos(tilt),
            cz + Math.sin(angle) * radius * Math.sin(tilt)
          );
          ring.rotation.set(tilt, angle * 0.3, angle * 0.5);
          mat.color.set("#8faad0");
          mat.opacity = cfg.p08WitnessOp * p08Weight;
        }
        ring.scale.setScalar(cfg.p08WitnessRingScale);
        ring.visible = mat.opacity > 0.01;
      }
    }

    // Witness flash beams (P08): re-purposed halo lines — each becomes a
    // brief connection from a witness ring to a flashed shape.
    {
      const p08Weight = (idxA === 7 ? 1 - blend : 0) + (idxB === 7 ? blend : 0);
      const wf = witnessFlashState.current;
      const flashActive = p08Weight > 0.01 && wf.flashShape >= 0 && wf.flashAmp > 0.01;
      for (let k = 0; k < haloLines.length; k++) {
        const line = haloLines[k];
        if (!line) continue;
        const mat = line.material as THREE.LineBasicMaterial;
        const geo = line.geometry;
        // Only the active witness line draws; others fade out
        const isActive = flashActive && k === wf.flashWitness;
        if (isActive) {
          const witnessRing = witnessRings[k];
          const shapeMesh = meshRefs.current[wf.flashShape];
          if (witnessRing && shapeMesh) {
            const positions = geo.attributes.position as THREE.BufferAttribute;
            const segCount = positions.count;
            for (let s = 0; s < segCount; s++) {
              const ft = s / (segCount - 1);
              const x = lerp(witnessRing.position.x, shapeMesh.position.x, ft);
              const y =
                lerp(witnessRing.position.y, shapeMesh.position.y, ft) +
                Math.sin(ft * Math.PI) * 0.2;
              const z = lerp(witnessRing.position.z, shapeMesh.position.z, ft);
              positions.setXYZ(s, x, y, z);
            }
            positions.needsUpdate = true;
          }
          const isAltWitness = k === cfg.p08AltWitnessIdx;
          if (isAltWitness) {
            mat.color.copy(amberColor);
          } else {
            mat.color.set("#a8b8d8");
          }
          mat.opacity = cfg.p08HaloOp * wf.flashAmp * p08Weight;
          line.visible = mat.opacity > 0.01;
        } else {
          mat.opacity *= 0.85;
          line.visible = mat.opacity > 0.01;
        }
      }
    }
  });

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <>
      <ambientLight intensity={0.18} />
      <directionalLight position={[5, 5, 5]} intensity={0.35} color="#c8d4f2" />
      <directionalLight position={[-3, -2, 4]} intensity={0.14} color="#f0c080" />
      <fog attach="fog" args={["#141828", 6, 28]} />

      {/* Background particles */}
      <points ref={particleRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.03}
          color="#8090b0"
          transparent
          opacity={0.2}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      {/* Context wash (behind everything) */}
      <mesh ref={washRef} visible={false}>
        <primitive object={washGeo} attach="geometry" />
        <meshBasicMaterial
          ref={washMatRef}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Main shapes */}
      {forms.map((f, i) => (
        <mesh
          key={`p-${i}`}
          ref={(el) => {
            if (el) meshRefs.current[i] = el;
          }}
          geometry={geometries[i]}
        >
          <meshStandardMaterial
            ref={(el) => {
              if (el) matRefs.current[i] = el;
            }}
            color={f.color}
            transparent
            opacity={0.5}
            roughness={DEFAULTS.baseRoughness}
            metalness={DEFAULTS.baseMetalness}
            emissive={f.color}
            emissiveIntensity={0}
          />
        </mesh>
      ))}

      {/* Alt shapes (P06 flat counterparts, P08 viewer rings) */}
      {forms.map((f, i) => (
        <mesh
          key={`a-${i}`}
          ref={(el) => {
            if (el) altMeshRefs.current[i] = el;
          }}
          geometry={altGeometries[i]}
          visible={false}
        >
          <meshStandardMaterial
            ref={(el) => {
              if (el) altMatRefs.current[i] = el;
            }}
            color={f.color}
            transparent
            opacity={0}
            roughness={0.5}
            metalness={0.3}
            emissive={f.color}
            emissiveIntensity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* Edge wireframe overlays (P03) */}
      {forms.map((_, i) => (
        <lineSegments
          key={`e-${i}`}
          ref={(el) => {
            if (el) edgeSegRefs.current[i] = el;
          }}
          geometry={edgeGeometries[i]}
          visible={false}
        >
          <lineBasicMaterial
            ref={(el) => {
              if (el) edgeMatRefs.current[i] = el;
            }}
            color={DEFAULTS.amberAccent}
            transparent
            opacity={0}
          />
        </lineSegments>
      ))}

      {/* Arrival ring (P01) */}
      <mesh ref={arrivalRingRef} visible={false}>
        <primitive object={arrivalRingGeo} attach="geometry" />
        <meshBasicMaterial
          ref={arrivalRingMatRef}
          color={DEFAULTS.amberAccent}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* Body indicator ring (P02) */}
      <mesh ref={bodyIndicatorRef} visible={false}>
        <primitive object={bodyIndicatorGeo} attach="geometry" />
        <meshBasicMaterial
          ref={bodyIndicatorMatRef}
          color={DEFAULTS.amberAccent}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Tether lines (P02) */}
      {tetherLines.map((line, i) => (
        <primitive key={`t-${i}`} object={line} />
      ))}

      {/* Attention brackets (P04) */}
      {bracketLines.map((line, b) => (
        <primitive key={`br-${b}`} object={line} />
      ))}

      {/* Handoff thread (P06) */}
      <primitive object={threadLine} />

      {/* Agent beam (P07) */}
      <primitive object={beamLine} />

      {/* Witness rings (P08) */}
      {witnessRings.map((ring, k) => (
        <primitive key={`wr-${k}`} object={ring} />
      ))}

      {/* Witness flash beams (P08) */}
      {haloLines.map((line, k) => (
        <primitive key={`h-${k}`} object={line} />
      ))}
    </>
  );
}

// Small helper to build a THREE.BufferGeometry with N empty points
function buildLineGeo(pointCount: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(pointCount * 3);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return geo;
}
