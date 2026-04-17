import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface EnvironmentProps {
  activeIndex: number;
  progress: number;
  onContextPhase?: (phase: number) => void;
  continuousIndex: number;
}

const mouse = { x: 0, y: 0 };
const smooth = { x: 0, y: 0 };

if (typeof window !== "undefined") {
  window.addEventListener("mousemove", (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

// Compute per-form targets for a given principle index
function getBehavior(
  idx: number,
  i: number,
  t: number,
  f: { pos: number[]; size: number },
  earnedSlots: number[],
  agentIdx: number,
  agentGlow: number[],
  ctxPhase: number,
  mat: THREE.MeshStandardMaterial | null
) {
  let op = 0.5;
  let em = 0;
  let altOp = 0;
  let altScale = 0;
  let offX = 0;
  let offY = 0;
  let scale = f.size;

  if (idx === 0) {
    // P01: SPATIAL IS EARNED
    const earned = earnedSlots.includes(i);
    op = earned ? 0.8 : 0.02;
    em = earned ? 0.35 : 0;
    scale = earned ? f.size * 1.1 : f.size * 0.8;
  } else if (idx === 1) {
    // P02: BODY IS THE ANCHOR — seek toward center, loop
    const cycle = ((t * 0.6 + i * 0.8) % 3) / 3;
    const ease = cycle * cycle;
    offX = -f.pos[0] * ease * 0.7;
    offY = -f.pos[1] * ease * 0.7;
    op = 0.15 + ease * 0.6;
    em = ease * 0.2;
  } else if (idx === 2) {
    // P03: DIEGETIC FIRST
    const pulse = Math.sin(t * 1.2 + i * 1.5) * 0.5 + 0.5;
    op = 0.5;
    em = pulse * 0.3;
    if (i < 3) {
      altOp = pulse * 0.5;
      altScale = 0.5 + pulse * 0.5;
    }
  } else if (idx === 3) {
    // P04: ATTENTION IS THE BUDGET
    const cycle = Math.floor(t * 0.8) % 6;
    const focused = i === cycle;
    op = focused ? 0.9 : 0.05;
    em = focused ? 0.5 : 0;
    scale = focused ? f.size * 1.15 : f.size * 0.9;
  } else if (idx === 4) {
    // P05: CONTEXT IS EVERYTHING
    offX = Math.sin(ctxPhase * Math.PI * 2) * (i % 2 === 0 ? 2 : -2);
    offY = Math.cos(ctxPhase * Math.PI * 2) * (i % 2 === 0 ? -1.2 : 1.2);
    em = 0.4;
    op = 0.65;
    // Color handled separately in main loop
  } else if (idx === 5) {
    // P06: TRANSITIONS — morph 3D ↔ flat
    const morph = Math.sin(t * 0.8 + i * 0.9) * 0.5 + 0.5;
    scale = f.size * (1 - morph * 0.7);
    altOp = morph * 0.7;
    altScale = morph * 1.3;
    op = 0.55 * (1 - morph * 0.5);
    em = 0.15 + morph * 0.15;
  } else if (idx === 6) {
    // P07: AGENT EARNS TRUST
    const isCurrent = i === agentIdx;
    const glow = agentGlow[i] || 0;
    op = isCurrent ? 0.9 : 0.03 + glow * 0.4;
    em = isCurrent ? 0.6 : glow * 0.25;
    scale = isCurrent ? f.size * 1.15 : f.size * (0.85 + glow * 0.15);
  } else if (idx === 7) {
    // P08: BEYOND THE WEARER
    const isLeft = f.pos[0] < 0;
    const wave = Math.sin(t * 0.7 + i * 1.3) * 0.5 + 0.5;
    if (isLeft) {
      offX = -f.pos[0] * wave * 0.35;
      offY = -f.pos[1] * wave * 0.25;
      op = 0.3 + wave * 0.45;
      em = wave * 0.2;
    } else {
      offX = f.pos[0] * wave * 0.2;
      offY = f.pos[1] * wave * 0.15;
      op = 0.35 - wave * 0.2;
    }
  }

  return { op, em, altOp, altScale, offX, offY, scale };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function Environment({
  activeIndex,
  onContextPhase,
  continuousIndex,
}: EnvironmentProps) {
  const meshRefs = useRef<THREE.Mesh[]>([]);
  const matRefs = useRef<THREE.MeshStandardMaterial[]>([]);
  const particleRef = useRef<THREE.Points>(null!);
  const meshAltRefs = useRef<THREE.Mesh[]>([]);
  const matAltRefs = useRef<THREE.MeshStandardMaterial[]>([]);

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
      new THREE.RingGeometry(0.5, 0.9, 24),
      new THREE.PlaneGeometry(1, 1.4),
      new THREE.BoxGeometry(1, 1, 0.05),
    ],
    []
  );

  const fs = useRef(
    forms.map(() => ({
      op: 0.5,
      em: 0,
      altOp: 0,
      altScale: 0,
      offX: 0,
      offY: 0,
      scale: 0.5,
    }))
  );

  const earnedTimer = useRef(0);
  const earnedSlots = useRef<number[]>([0]);
  const agentIdx = useRef(0);
  const agentTimer = useRef(0);
  const agentGlow = useRef([0, 0, 0, 0, 0, 0]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const dt = state.clock.getDelta();

    smooth.x += (mouse.x - smooth.x) * 0.02;
    smooth.y += (mouse.y - smooth.y) * 0.02;

    if (particleRef.current) {
      particleRef.current.rotation.y = t * 0.004 + smooth.x * 0.05;
      particleRef.current.rotation.x = t * 0.002 + smooth.y * 0.04;
    }

    // Earned timer
    earnedTimer.current += dt;
    if (earnedTimer.current > 1.5) {
      earnedTimer.current = 0;
      const count = Math.random() > 0.6 ? 2 : 1;
      const picks: number[] = [];
      while (picks.length < count) {
        const r = Math.floor(Math.random() * forms.length);
        if (!picks.includes(r)) picks.push(r);
      }
      earnedSlots.current = picks;
    }

    // Agent timer
    agentTimer.current += dt;
    if (agentTimer.current > 2) {
      agentTimer.current = 0;
      agentGlow.current[agentIdx.current] = 1;
      agentIdx.current = (agentIdx.current + 1) % forms.length;
    }
    for (let j = 0; j < 6; j++) {
      agentGlow.current[j] *= 0.95;
    }

    // Context phase
    const ctxPhase = Math.sin(t * 0.5) * 0.5 + 0.5;
    if (onContextPhase) {
      onContextPhase(ctxPhase);
    }

    // Crossfade: compute blend between current and next principle
    const idxA = Math.min(Math.floor(continuousIndex), 7);
    const idxB = Math.min(idxA + 1, 7);
    const blend = continuousIndex - Math.floor(continuousIndex); // 0..1 within section

    for (let i = 0; i < forms.length; i++) {
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      const altMesh = meshAltRefs.current[i];
      const altMat = matAltRefs.current[i];
      if (!mesh || !mat) continue;

      const f = forms[i];
      const s = fs.current[i];

      // Get targets from BOTH adjacent principles
      const a = getBehavior(
        idxA, i, t, f,
        earnedSlots.current, agentIdx.current, agentGlow.current,
        ctxPhase, mat
      );
      const b = getBehavior(
        idxB, i, t, f,
        earnedSlots.current, agentIdx.current, agentGlow.current,
        ctxPhase, mat
      );

      // Crossfade targets
      const tOp = lerp(a.op, b.op, blend);
      const tEm = lerp(a.em, b.em, blend);
      const tAltOp = lerp(a.altOp, b.altOp, blend);
      const tAltScale = lerp(a.altScale, b.altScale, blend);
      const tOffX = lerp(a.offX, b.offX, blend);
      const tOffY = lerp(a.offY, b.offY, blend);
      const tScale = lerp(a.scale, b.scale, blend);

      // Lerp toward crossfaded targets
      const rate = 0.1;
      s.op += (tOp - s.op) * rate;
      s.em += (tEm - s.em) * rate;
      s.altOp += (tAltOp - s.altOp) * rate;
      s.altScale += (tAltScale - s.altScale) * rate;
      s.offX += (tOffX - s.offX) * 0.08;
      s.offY += (tOffY - s.offY) * 0.08;
      s.scale += (tScale - s.scale) * rate;

      // Position
      mesh.position.x = f.pos[0] + smooth.x * f.depth * 0.7 + s.offX;
      mesh.position.y =
        f.pos[1] +
        smooth.y * f.depth * 0.5 +
        Math.sin(t * 0.2 + i * 2.5) * 0.1 +
        s.offY;
      mesh.position.z = f.pos[2] + Math.cos(t * 0.12 + i) * 0.06;

      mesh.rotation.x = smooth.y * 0.05 + t * 0.02;
      mesh.rotation.y = smooth.x * 0.07 + t * 0.025;
      mesh.scale.setScalar(s.scale);

      // Material
      mat.opacity = s.op;

      // P05 color: apply when either side is P05
      if (idxA === 4 || idxB === 4) {
        const colorBlend = idxA === 4 ? 1 - blend : blend;
        const warm = new THREE.Color(0.9, 0.6, 0.3);
        const cool = new THREE.Color(0.3, 0.5, 0.9);
        const baseColor = new THREE.Color(f.color);
        const ctxColor = new THREE.Color().lerpColors(warm, cool, ctxPhase);
        mat.emissive.lerpColors(baseColor, ctxColor, colorBlend);
        mat.emissiveIntensity = lerp(0, 0.4, colorBlend);
      } else {
        mat.emissiveIntensity = s.em;
      }

      // Alt mesh
      if (altMesh && altMat) {
        altMesh.position.copy(mesh.position);
        altMesh.rotation.copy(mesh.rotation);
        altMesh.scale.setScalar(f.size * s.altScale);
        altMat.opacity = s.altOp;
        altMat.emissiveIntensity = s.em * 0.5;
        altMesh.visible = s.altOp > 0.01;
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} color="#c0d0f0" />
      <directionalLight position={[-3, -2, 4]} intensity={0.1} color="#f0c080" />
      <fog attach="fog" args={["#0a0a0f", 6, 28]} />

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

      {forms.map((f, i) => (
        <mesh
          key={`p-${i}`}
          ref={(el) => { if (el) meshRefs.current[i] = el; }}
          geometry={geometries[i]}
        >
          <meshStandardMaterial
            ref={(el) => { if (el) matRefs.current[i] = el; }}
            color={f.color}
            transparent
            opacity={0.5}
            roughness={0.3}
            metalness={0.6}
            emissive={f.color}
            emissiveIntensity={0}
          />
        </mesh>
      ))}

      {forms.map((f, i) => (
        <mesh
          key={`a-${i}`}
          ref={(el) => { if (el) meshAltRefs.current[i] = el; }}
          geometry={altGeometries[i]}
          visible={false}
        >
          <meshStandardMaterial
            ref={(el) => { if (el) matAltRefs.current[i] = el; }}
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
    </>
  );
}
