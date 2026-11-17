import React, { useEffect, useRef, useState } from 'react';
import highwayBackdropImg from '../assets/images/chicken_asphalt_highway_bg_1794930488431.jpg';
import { AsphaltChickenPhase } from './ChickenAsphaltStage';

interface ChickenVideoBackdropProps {
  phase: AsphaltChickenPhase;
  enabled: boolean;
}

interface LightStreak {
  lanePos: number; // 0..1 across highway angle
  progress: number; // 0..1 depth
  speed: number;
  isHeadlight: boolean; // white/amber oncoming vs red taillight receding
  length: number;
}

export const ChickenVideoBackdrop: React.FC<ChickenVideoBackdropProps> = ({
  phase,
  enabled,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const phaseRef = useRef<AsphaltChickenPhase>(phase);
  const [streamReady, setStreamReady] = useState(false);

  phaseRef.current = phase;

  useEffect(() => {
    if (!enabled) {
      setStreamReady(false);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setStreamReady(false);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;

    const canCapture =
      typeof canvas.captureStream === 'function' && videoRef.current !== null;
    if (!canCapture) {
      setStreamReady(false);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = highwayBackdropImg;
    let imgLoaded = false;
    img.onload = () => {
      imgLoaded = true;
    };

    const streaks: LightStreak[] = Array.from({ length: 18 }, (_, i) => ({
      lanePos: ((i * 0.19) % 0.72) + 0.14,
      progress: (i * 0.13) % 1,
      speed: 0.25 + (i % 5) * 0.08,
      isHeadlight: i % 2 === 0,
      length: 22 + (i % 4) * 12,
    }));

    let stream: MediaStream | null = null;
    try {
      stream = canvas.captureStream(24);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {
          // Ignore autoplay promise rejections if muted policy blocks
        });
        setStreamReady(true);
      }
    } catch {
      setStreamReady(false);
      return;
    }

    let rafId = 0;
    let lastMs = performance.now();

    const drawLoop = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const t = nowMs / 1000;
      const activePhase = phaseRef.current;
      const speedBoost =
        activePhase === 'JUMPING' ? 2.1 : activePhase === 'STEP_SAFE' ? 1.25 : 1;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Subtle breathing camera zoom on photorealistic highway backdrop
      if (imgLoaded) {
        const zoom = 1.03 + Math.sin(t * 0.6) * 0.015;
        const dw = w * zoom;
        const dh = h * zoom;
        const dx = (w - dw) / 2 + Math.sin(t * 0.4) * 4;
        const dy = (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#0f172a');
        bgGrad.addColorStop(0.55, '#1e293b');
        bgGrad.addColorStop(1, '#090d14');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
      }

      // Soft warm streetlamp halo shimmer
      const lampPulse = 0.14 + Math.sin(t * 2.2) * 0.04;
      const lampGrad = ctx.createRadialGradient(w * 0.48, h * 0.18, 8, w * 0.48, h * 0.18, 170);
      lampGrad.addColorStop(0, `rgba(251, 191, 36, ${lampPulse})`);
      lampGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = lampGrad;
      ctx.fillRect(0, 0, w, h);

      // Perspective moving traffic light streaks along asphalt highway
      const horizonY = h * 0.44;
      const vanishX = w * 0.48;

      for (const st of streaks) {
        st.progress += st.speed * speedBoost * dt;
        if (st.progress > 1) {
          st.progress = 0.05;
        }

        const p = st.progress;
        const spread = (st.lanePos - 0.5) * 1.45;
        const y1 = horizonY + p * (h - horizonY);
        const x1 = vanishX + spread * p * w * 0.85;
        const pTail = Math.max(0.02, p - st.length / 420);
        const y0 = horizonY + pTail * (h - horizonY);
        const x0 = vanishX + spread * pTail * w * 0.85;

        ctx.save();
        ctx.strokeStyle = st.isHeadlight
          ? `rgba(254, 243, 199, ${0.42 * p})`
          : `rgba(244, 63, 94, ${0.52 * p})`;
        ctx.lineWidth = 1.5 + p * 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.restore();
      }

      // Red alert vignette flash when chicken hits traffic
      if (activePhase === 'CRASHED') {
        const flash = 0.18 + Math.sin(t * 10) * 0.1;
        ctx.fillStyle = `rgba(225, 29, 72, ${flash})`;
        ctx.fillRect(0, 0, w, h);
      }

      rafId = window.requestAnimationFrame(drawLoop);
    };

    rafId = window.requestAnimationFrame(drawLoop);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((tr) => tr.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl sm:rounded-3xl">
      {/* Resilient photorealistic fallback backdrop image */}
      <img
        src={highwayBackdropImg}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-35 scale-105"
      />

      {/* Dynamic HTML5 Video layer streaming real-time moving highway light & atmosphere */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        poster={highwayBackdropImg}
        aria-hidden="true"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          streamReady ? 'opacity-45' : 'opacity-0'
        }`}
      />

      {/* Measured contrast scrim to preserve WCAG AA readability on all cockpit controls */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/65 to-slate-950/92" />
    </div>
  );
};
