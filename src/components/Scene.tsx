import { Canvas } from "@react-three/fiber";
import { Environment } from "./Environment";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

interface SceneProps {
  activeIndex: number;
  progress: number;
  onContextPhase?: (phase: number) => void;
  continuousIndex: number;
}

export function Scene({
  activeIndex,
  progress,
  onContextPhase,
  continuousIndex,
}: SceneProps) {
  return (
    <div className="scene-container">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#08080c"]} />
        <Environment
          activeIndex={activeIndex}
          progress={progress}
          onContextPhase={onContextPhase}
          continuousIndex={continuousIndex}
        />
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.4}
            luminanceThreshold={0.4}
            luminanceSmoothing={0.9}
            mipmapBlur
          />
          <Vignette offset={0.3} darkness={0.6} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
