import React, { useEffect, useRef } from 'react';

interface WinConfettiProps {
  triggerKey: number;
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vr: number;
  color: string;
  alpha: number;
  shape: 'rect' | 'circle';
}

const CONFETTI_COLORS = ['#0E8A38', '#9AD84B', '#F59E0B', '#10B981', '#FDE047', '#FFFFFF'];

export const WinConfetti: React.FC<WinConfettiProps> = ({ triggerKey }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (triggerKey <= 0) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const originX = width * 0.5;
    const originY = Math.min(height * 0.34, 280);
    const pieces: ConfettiPiece[] = Array.from({ length: 56 }, (_, idx) => {
      const spread = ((idx / 56) - 0.5) * Math.PI * 0.92 + (Math.random() - 0.5) * 0.35;
      const speed = 3.2 + Math.random() * 5.6;
      return {
        x: originX + (Math.random() - 0.5) * Math.min(width * 0.35, 220),
        y: originY + (Math.random() - 0.5) * 30,
        vx: Math.sin(spread) * speed + (Math.random() - 0.5) * 2.2,
        vy: -Math.cos(spread) * speed * 0.85 - Math.random() * 2.5,
        size: 5 + Math.random() * 5,
        rotation: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.2,
        color: CONFETTI_COLORS[idx % CONFETTI_COLORS.length],
        alpha: 0.95,
        shape: idx % 4 === 0 ? 'circle' : 'rect',
      };
    });

    const startTime = performance.now();
    const durationMs = 1900;

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
    }

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      ctx.clearRect(0, 0, width, height);

      for (const p of pieces) {
        p.vy += 0.16; // gentle gravity
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;

        const fade = progress > 0.65 ? Math.max(0, 1 - (progress - 0.65) / 0.35) : 1;
        ctx.save();
        ctx.globalAlpha = p.alpha * fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
        }
        ctx.restore();
      }

      if (elapsed < durationMs) {
        rafRef.current = window.requestAnimationFrame(renderFrame);
      } else {
        ctx.clearRect(0, 0, width, height);
        rafRef.current = null;
      }
    };

    rafRef.current = window.requestAnimationFrame(renderFrame);

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [triggerKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-50"
    />
  );
};
