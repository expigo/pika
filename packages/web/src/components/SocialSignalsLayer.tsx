"use client";

import { useEffect, useRef } from "react";
import type { LikeHandler } from "@/hooks/live/useSocialSignals";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  scale: number;
  emoji: string;
  rotation: number;
  rotationSpeed: number;
}

const EMOJIS = ["❤️", "💜", "🔥", "🦄", "✨", "💃", "🕺"];
const MAX_PARTICLES = 50;

interface Props {
  onLikeReceived: (callback: LikeHandler) => () => void;
}

export function SocialSignalsLayer({ onLikeReceived }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const handleResize = () => {
      const width = window.visualViewport?.width || window.innerWidth;
      const height = window.visualViewport?.height || window.innerHeight;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      ctx.scale(dpr, dpr);

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    // Animation loop - only runs when there are particles to animate
    const loop = () => {
      if (!canvas || !ctx) return;

      // 🔋 Battery optimization: Stop loop when no particles exist
      if (particlesRef.current.length === 0) {
        animationFrameRef.current = null;
        return;
      }

      const width = window.visualViewport?.width || window.innerWidth;
      const height = window.visualViewport?.height || window.innerHeight;

      ctx.clearRect(0, 0, width, height);

      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.01;
        p.rotation += p.rotationSpeed;
        p.x += Math.sin(p.y * 0.05) * 0.5;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(p.scale, p.scale);
        ctx.font = "30px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.emoji, 0, 0);
        ctx.restore();

        return p.life > 0 && p.y > -100;
      });

      animationFrameRef.current = requestAnimationFrame(loop);
    };

    // Helper to ensure loop is running (starts on-demand)
    const ensureLoopRunning = () => {
      if (!animationFrameRef.current) {
        loop();
      }
    };

    // Spawner Function - now starts loop on-demand
    const spawnParticleWithLoop = (_track: unknown, count = 1) => {
      if (particlesRef.current.length >= MAX_PARTICLES) return;

      const spawnCount = Math.min(count || 1, 5);

      for (let i = 0; i < spawnCount; i++) {
        const width = window.visualViewport?.width || window.innerWidth;
        const height = window.visualViewport?.height || window.innerHeight;

        particlesRef.current.push({
          x: Math.random() * width,
          y: height + 50,
          vx: (Math.random() - 0.5) * 2,
          vy: -(Math.random() * 4 + 3),
          life: 1.0,
          scale: Math.random() * 0.5 + 1.0,
          emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
          rotation: (Math.random() - 0.5) * 0.5,
          rotationSpeed: (Math.random() - 0.5) * 0.05,
        });
      }

      // 🔋 Start loop on-demand only when particles exist
      ensureLoopRunning();
    };

    const unsubscribe = onLikeReceived(spawnParticleWithLoop);

    // Don't start loop immediately - wait for first particle

    return () => {
      window.removeEventListener("resize", handleResize);
      unsubscribe();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [onLikeReceived]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
      aria-hidden="true"
    />
  );
}
