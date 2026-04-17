import { useEffect, useRef } from "react";
import * as THREE from "three";

export function useMouseParallax(damping = 0.05) {
  const mouse = useRef(new THREE.Vector2(0, 0));
  const smoothMouse = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Normalize to -1..1
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const update = () => {
    smoothMouse.current.x +=
      (mouse.current.x - smoothMouse.current.x) * damping;
    smoothMouse.current.y +=
      (mouse.current.y - smoothMouse.current.y) * damping;
  };

  return { mouse, smoothMouse, update };
}
