import { useMemo } from "react";
import type { Principle } from "../data/principles";

interface GlassCardProps {
  principle: Principle;
  isActive: boolean;
  contextPhase?: number;
}

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${bl})`;
}

export function GlassCard({ principle, isActive, contextPhase }: GlassCardProps) {
  // P05: card accent and border shift with background
  const contextStyle = useMemo(() => {
    if (contextPhase === undefined) return {};
    const warmAccent = "#e6994d";
    const coolAccent = "#4d80e6";
    const color = lerpColor(warmAccent, coolAccent, contextPhase);
    return {
      borderColor: `${color}33`, // 20% opacity
      "--card-accent": color,
    } as React.CSSProperties;
  }, [contextPhase]);

  const accentColor =
    contextPhase !== undefined
      ? lerpColor("#e6994d", "#4d80e6", contextPhase)
      : undefined;

  return (
    <div
      className={`glass-card ${isActive ? "active" : ""}`}
      style={contextStyle}
    >
      <div className="card-inner">
        <div className="card-header">
          <span className="card-num">{principle.num}</span>
          <span className="card-label">PRINCIPLE</span>
        </div>

        <h2 className="card-title">{principle.title}</h2>

        <div
          className="card-accent"
          style={accentColor ? { background: accentColor } : undefined}
        />

        <p className="card-body">{principle.body}</p>

        <div className="card-footer">
          <span className="card-badge">{principle.num} OF 08</span>
        </div>
      </div>
    </div>
  );
}
