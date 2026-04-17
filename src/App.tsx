import { useState, useCallback, useRef } from "react";
import { Scene } from "./components/Scene";
import { HeroSection } from "./components/HeroSection";
import { PrincipleSection } from "./components/PrincipleSection";
import { principles } from "./data/principles";
import { useScrollProgress } from "./hooks/useScrollProgress";
import "./App.css";

function App() {
  const totalSections = principles.length + 2; // hero + 8 principles + end
  const { progress, continuousIndex } = useScrollProgress(totalSections);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [contextPhase, setContextPhase] = useState(0);
  const phaseThrottle = useRef(0);

  const onPrincipleVisible = useCallback((index: number) => {
    setVisibleIndex(index);
  }, []);

  const onContextPhase = useCallback((phase: number) => {
    const now = Date.now();
    if (now - phaseThrottle.current > 80) {
      phaseThrottle.current = now;
      setContextPhase(phase);
    }
  }, []);

  // Continuous index offset by hero section
  // Hero is section 0, principles are 1-8
  const principleFloat = Math.max(0, continuousIndex - 1);

  return (
    <div className="app">
      <Scene
        activeIndex={visibleIndex}
        progress={progress}
        onContextPhase={onContextPhase}
        continuousIndex={principleFloat}
      />

      <div className="scroll-content">
        <HeroSection />
        {principles.map((p, i) => (
          <PrincipleSection
            key={p.num}
            principle={p}
            index={i}
            onVisible={onPrincipleVisible}
            contextPhase={visibleIndex === 4 ? contextPhase : undefined}
          />
        ))}

        <section className="end-section">
          <div className="end-content">
            <h2 className="end-title">Thinking Spatially Again</h2>
            <p className="end-body">
              300,000 years navigating landscapes, tracking prey, remembering
              where the water is. 60 years of screens.
            </p>
            <p className="end-body">
              Your spatial cognition system is the most tested, most robust,
              most deeply wired part of how you process the world.
            </p>
            <p className="end-body">
              Spatial cues work because they plug into the oldest, strongest
              system you have.
            </p>
          </div>
        </section>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ height: `${progress * 100}%` }}
        />
      </div>

      <div className="section-indicator">
        {principles.map((p, i) => (
          <div
            key={p.num}
            className={`indicator-dot ${visibleIndex === i ? "active" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

export default App;
