import React, { useEffect, useRef } from 'react';
import { ChickenHazardKind } from '../lib/gameEngine';

export type AsphaltChickenPhase = 'READY' | 'JUMPING' | 'STEP_SAFE' | 'CRASHED' | 'FINISHED';

interface ChickenAsphaltStageProps {
  multipliers: number[];
  lockedBet: number;
  currentStep: number;
  targetStep: number;
  phase: AsphaltChickenPhase;
  crashedLane: number | null;
  maxSafeStep: number | null;
  laneHazards: ChickenHazardKind[];
  currencyLabel: string;
  showVideoOverlay?: boolean;
  actionCamLabel?: string;
  onTapNextLane: () => void;
}

type VehicleStyle = 'taxi' | 'truck' | 'sedan' | 'suv';

interface RoadVehicle {
  laneIndex: number; // 1..N
  y: number; // normalized -0.4 .. 1.4
  speed: number;
  lengthPx: number;
  widthPx: number;
  style: VehicleStyle;
  isInterceptor?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'dust' | 'feather' | 'spark';
  rot: number;
  vRot: number;
}

const LANE_WIDTH = 108;
const SIDEWALK_WIDTH = 94;

function buildAsphaltPatternCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const off = document.createElement('canvas');
  off.width = 96;
  off.height = 96;
  const ctx = off.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#20242c';
  ctx.fillRect(0, 0, 96, 96);

  // Fine mineral asphalt aggregate speckling
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 420; i += 1) {
    const x = Math.floor(rand() * 96);
    const y = Math.floor(rand() * 96);
    const shade = rand();
    if (shade > 0.65) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
    } else if (shade > 0.3) {
      ctx.fillStyle = 'rgba(148,163,184,0.045)';
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
    }
    ctx.fillRect(x, y, shade > 0.85 ? 2 : 1, 1);
  }
  return off;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawVehicle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  v: RoadVehicle,
  braking: boolean,
  timeSec: number,
) {
  const w = v.widthPx;
  const h = v.lengthPx;
  const x = cx - w / 2;
  const y = cy - h / 2;

  ctx.save();

  // Headlight beams projected downward onto asphalt
  const beamGrad = ctx.createLinearGradient(cx, cy + h / 2 - 4, cx, cy + h / 2 + 54);
  beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.34)');
  beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = beamGrad;
  ctx.beginPath();
  ctx.moveTo(x + 6, cy + h / 2 - 2);
  ctx.lineTo(x + w - 6, cy + h / 2 - 2);
  ctx.lineTo(x + w + 10, cy + h / 2 + 54);
  ctx.lineTo(x - 10, cy + h / 2 + 54);
  ctx.closePath();
  ctx.fill();

  // Ground drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  drawRoundedRect(ctx, x + 4, y + 6, w, h, 9);
  ctx.fill();

  // Tires protruding slightly
  ctx.fillStyle = '#090d14';
  const wheelW = 5;
  const wheelH = 12;
  ctx.fillRect(x - 2, y + 10, wheelW, wheelH);
  ctx.fillRect(x + w - 3, y + 10, wheelW, wheelH);
  ctx.fillRect(x - 2, y + h - 22, wheelW, wheelH);
  ctx.fillRect(x + w - 3, y + h - 22, wheelW, wheelH);

  // Body colors by realistic vehicle style
  let bodyColor = '#0284c7'; // Addis blue taxi
  let accentColor = '#f8fafc';
  if (v.style === 'truck') {
    bodyColor = '#dc2626';
    accentColor = '#f1f5f9';
  } else if (v.style === 'suv') {
    bodyColor = '#d97706';
    accentColor = '#fef3c7';
  } else if (v.style === 'sedan') {
    bodyColor = '#334155';
    accentColor = '#cbd5e1';
  }

  // Main chassis
  const bodyGrad = ctx.createLinearGradient(x, y, x + w, y);
  bodyGrad.addColorStop(0, bodyColor);
  bodyGrad.addColorStop(0.5, bodyColor);
  bodyGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bodyColor;
  drawRoundedRect(ctx, x, y, w, h, 8);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  if (v.style === 'truck') {
    // Cargo container box (top 65%)
    ctx.fillStyle = accentColor;
    drawRoundedRect(ctx, x + 2, y + 3, w - 4, h * 0.64, 5);
    ctx.fill();
    // Ribbed roof lines on cargo box
    ctx.strokeStyle = 'rgba(148,163,184,0.45)';
    ctx.lineWidth = 1;
    for (let ry = y + 10; ry < y + h * 0.62; ry += 8) {
      ctx.beginPath();
      ctx.moveTo(x + 5, ry);
      ctx.lineTo(x + w - 5, ry);
      ctx.stroke();
    }
    // Red hazard chevron stripe on cab front
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x + 4, y + h * 0.72, w - 8, 3);
  } else if (v.style === 'taxi') {
    // White roof for Addis blue-white taxi
    ctx.fillStyle = '#f8fafc';
    drawRoundedRect(ctx, x + 4, y + h * 0.22, w - 8, h * 0.44, 5);
    ctx.fill();
    // Yellow TAXI roof sign
    ctx.fillStyle = '#facc15';
    drawRoundedRect(ctx, cx - 8, y + h * 0.36, 16, 6, 2);
    ctx.fill();
  } else {
    // Roof panel with subtle reflection
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    drawRoundedRect(ctx, x + 5, y + h * 0.25, w - 10, h * 0.4, 5);
    ctx.fill();
  }

  // Front windshield (bottom side, facing downward)
  const windGrad = ctx.createLinearGradient(x, y + h * 0.66, x + w, y + h * 0.82);
  windGrad.addColorStop(0, '#0f172a');
  windGrad.addColorStop(0.6, '#38bdf8');
  windGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = windGrad;
  drawRoundedRect(ctx, x + 4, y + h * 0.68, w - 8, h * 0.15, 3);
  ctx.fill();

  // Rear window
  ctx.fillStyle = '#0f172a';
  drawRoundedRect(ctx, x + 6, y + h * 0.1, w - 12, h * 0.09, 2);
  ctx.fill();

  // Headlights (front bottom edge)
  ctx.fillStyle = '#fef9c3';
  ctx.fillRect(x + 4, y + h - 4, 8, 4);
  ctx.fillRect(x + w - 12, y + h - 4, 8, 4);

  // Tail / brake lights (top edge)
  const hazardBlink = v.isInterceptor && Math.floor(timeSec * 6) % 2 === 0;
  ctx.fillStyle = hazardBlink ? '#fbbf24' : braking ? '#ff2d55' : '#b91c1c';
  ctx.fillRect(x + 4, y, 8, 3.5);
  ctx.fillRect(x + w - 12, y, 8, 3.5);

  ctx.restore();
}

function drawRealisticChicken(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  jumpProgress: number,
  isJumping: boolean,
  isCrashed: boolean,
  timeSec: number,
  reducedMotion: boolean,
) {
  // Parabolic height arc during jump
  const jumpHeight = isJumping ? Math.sin(jumpProgress * Math.PI) * 44 : 0;
  const idleBob = !isJumping && !isCrashed && !reducedMotion ? Math.sin(timeSec * 5.2) * 1.6 : 0;
  const headPeck = !isJumping && !isCrashed && !reducedMotion ? Math.sin(timeSec * 4.4) * 1.8 : 0;

  // Landing squash & stretch
  let scaleX = 1;
  let scaleY = 1;
  if (isJumping) {
    if (jumpProgress < 0.2) {
      scaleX = 1.08;
      scaleY = 0.9;
    } else if (jumpProgress < 0.85) {
      scaleX = 0.94;
      scaleY = 1.1;
    } else {
      scaleX = 1.12;
      scaleY = 0.88;
    }
  }

  // 1. Ground shadow on asphalt (scales down as chicken rises)
  const shadowScale = Math.max(0.45, 1 - jumpHeight / 70);
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${0.46 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(x, groundY + 14, 21 * shadowScale, 7.5 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Chicken body rig positioned above ground
  ctx.save();
  ctx.translate(x, groundY - jumpHeight + idleBob);
  if (isCrashed) {
    ctx.translate(2, 8);
    ctx.rotate(1.18);
    ctx.globalAlpha = 0.92;
  } else if (isJumping) {
    // Tilt slightly forward while leaping
    const tilt = Math.cos(jumpProgress * Math.PI) * -0.18;
    ctx.rotate(tilt);
  }
  ctx.scale(scaleX, scaleY);

  // Back leg
  const legLift = isJumping ? Math.sin(jumpProgress * Math.PI) * 8 : 0;
  const drawLeg = (lx: number, offsetPhase: number, darkShade: boolean) => {
    const stride = isJumping ? Math.sin(jumpProgress * Math.PI * 2 + offsetPhase) * 4 : 0;
    ctx.strokeStyle = darkShade ? '#c2690a' : '#f59e0b';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, 6);
    ctx.lineTo(lx - 2 + stride, 13 - legLift * 0.6);
    ctx.lineTo(lx + 1 + stride, 18 - legLift);
    // Claws
    ctx.moveTo(lx + 1 + stride, 18 - legLift);
    ctx.lineTo(lx + 7 + stride, 19 - legLift);
    ctx.moveTo(lx + 1 + stride, 18 - legLift);
    ctx.lineTo(lx - 3 + stride, 19.5 - legLift);
    ctx.stroke();
  };

  drawLeg(-4, 0, true);
  drawLeg(5, Math.PI, false);

  // Layered Tail Feathers (warm cream/golden-brown tips)
  const tailWag = !reducedMotion ? Math.sin(timeSec * 6.5) * 0.08 : 0;
  ctx.save();
  ctx.translate(-15, -2);
  ctx.rotate(tailWag);
  const tailAngles = [-0.45, -0.15, 0.15];
  tailAngles.forEach((ang, idx) => {
    ctx.save();
    ctx.rotate(ang);
    ctx.fillStyle = idx === 1 ? '#f5ead6' : '#e2cfa8';
    ctx.strokeStyle = '#b48a54';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(-7, -3, 10, 4.2, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();

  // Plump Organic Hen Body (radial feather shading)
  const bodyGrad = ctx.createRadialGradient(-3, -6, 3, 0, 0, 22);
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.55, '#fbf4e4');
  bodyGrad.addColorStop(1, '#d8c5a3');
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#9c7848';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(-1, -1, 18, 14, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Subtle breast plumage contour lines
  ctx.strokeStyle = 'rgba(180, 142, 92, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(4, 1, 10, -0.4, 1.3);
  ctx.stroke();

  // Flapping Articulated Wing
  const wingFlap = isJumping
    ? Math.sin(jumpProgress * Math.PI * 6) * 0.65 - 0.55
    : !reducedMotion
      ? Math.sin(timeSec * 3.5) * 0.05
      : 0;
  ctx.save();
  ctx.translate(-3, -3);
  ctx.rotate(wingFlap);
  const wingGrad = ctx.createLinearGradient(-8, -4, 8, 8);
  wingGrad.addColorStop(0, '#fffdf9');
  wingGrad.addColorStop(1, '#d6bf96');
  ctx.fillStyle = wingGrad;
  ctx.strokeStyle = '#9c7848';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(-2, 3, 11, 6.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Wing feather notches
  ctx.strokeStyle = 'rgba(156,120,72,0.45)';
  ctx.beginPath();
  ctx.moveTo(-7, 4);
  ctx.lineTo(-1, 6);
  ctx.moveTo(-4, 2);
  ctx.lineTo(2, 4);
  ctx.stroke();
  ctx.restore();

  // Neck + Head
  ctx.save();
  ctx.translate(11 + headPeck * 0.6, -12);

  // Red Comb on crown
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-5, -8);
  ctx.quadraticCurveTo(-5, -16, 0, -13);
  ctx.quadraticCurveTo(3, -18, 6, -12);
  ctx.quadraticCurveTo(10, -15, 9, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Head sphere with soft shading
  const headGrad = ctx.createRadialGradient(-2, -3, 2, 0, 0, 11);
  headGrad.addColorStop(0, '#ffffff');
  headGrad.addColorStop(0.7, '#faf0dc');
  headGrad.addColorStop(1, '#d9c49e');
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = '#9c7848';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Red Wattle under beak
  ctx.fillStyle = '#ef4444';
  ctx.strokeStyle = '#991b1b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(6.5, 6.5, 2.8, 4.2, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Sharp Two-Part Golden Beak
  const beakOpen = isJumping ? 1.8 : 0;
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 1.1;
  // Upper beak
  ctx.beginPath();
  ctx.moveTo(8, -2.5);
  ctx.lineTo(17.5, 0.5 - beakOpen * 0.4);
  ctx.lineTo(8, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Lower beak
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.moveTo(8, 1.5);
  ctx.lineTo(15.5, 2.5 + beakOpen);
  ctx.lineTo(8, 4.2);
  ctx.closePath();
  ctx.fill();

  // Expressive Eye (blinks occasionally when idle, X when crashed)
  const blinkCycle = timeSec % 3.4;
  const isBlinking = !isJumping && !isCrashed && blinkCycle > 3.24;
  if (isCrashed) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(1.5, -4);
    ctx.lineTo(5.5, 0);
    ctx.moveTo(5.5, -4);
    ctx.lineTo(1.5, 0);
    ctx.stroke();
  } else if (isBlinking) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(1.5, -2);
    ctx.lineTo(5.8, -2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(3.8, -2, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4.5, -2.8, 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

function drawSafetyBarrier(ctx: CanvasRenderingContext2D, cx: number, y: number) {
  ctx.save();
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  drawRoundedRect(ctx, cx - 26, y + 4, 52, 10, 3);
  ctx.fill();

  // Orange & white striped road barrier bar
  ctx.fillStyle = '#f97316';
  drawRoundedRect(ctx, cx - 26, y - 5, 52, 11, 3);
  ctx.fill();
  ctx.strokeStyle = '#7c2d12';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Diagonal white reflective stripes
  ctx.fillStyle = '#f8fafc';
  for (let sx = cx - 20; sx < cx + 18; sx += 14) {
    ctx.beginPath();
    ctx.moveTo(sx, y - 4);
    ctx.lineTo(sx + 6, y - 4);
    ctx.lineTo(sx + 2, y + 5);
    ctx.lineTo(sx - 4, y + 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export const ChickenAsphaltStage: React.FC<ChickenAsphaltStageProps> = ({
  multipliers,
  lockedBet,
  currentStep,
  targetStep,
  phase,
  crashedLane,
  maxSafeStep,
  laneHazards,
  currencyLabel,
  showVideoOverlay = true,
  actionCamLabel = 'Chicken Cam',
  onTapNextLane,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayVideoRef = useRef<HTMLVideoElement | null>(null);
  const asphaltPatternRef = useRef<HTMLCanvasElement | null>(null);
  const [overlayStreamActive, setOverlayStreamActive] = React.useState(false);

  const stateRef = useRef({
    multipliers,
    lockedBet,
    currentStep,
    targetStep,
    phase,
    crashedLane,
    maxSafeStep,
    laneHazards,
    currencyLabel,
  });

  stateRef.current = {
    multipliers,
    lockedBet,
    currentStep,
    targetStep,
    phase,
    crashedLane,
    maxSafeStep,
    laneHazards,
    currencyLabel,
  };

  const animRef = useRef({
    chickenWorldX: SIDEWALK_WIDTH * 0.52,
    jumpStartX: SIDEWALK_WIDTH * 0.52,
    jumpEndX: SIDEWALK_WIDTH * 0.52,
    jumpStartTime: 0,
    lastPhase: 'READY' as AsphaltChickenPhase,
    lastStep: 0,
    cameraX: 0,
    shakeTime: 0,
    vehicles: [] as RoadVehicle[],
    particles: [] as Particle[],
    skidLanes: new Set<number>(),
    laneCountInit: 0,
  });

  // Helper to get world X center of a step (0 = start sidewalk, 1..N = asphalt lanes, N+1 = finish curb)
  const getStepCenterX = (step: number) => {
    if (step <= 0) return SIDEWALK_WIDTH * 0.52;
    return SIDEWALK_WIDTH + (step - 0.5) * LANE_WIDTH;
  };

  // Re-initialize vehicles whenever lane count changes
  useEffect(() => {
    const laneCount = multipliers.length;
    const anim = animRef.current;
    if (anim.laneCountInit === laneCount && anim.vehicles.length > 0) return;
    anim.laneCountInit = laneCount;

    const styles: VehicleStyle[] = ['taxi', 'truck', 'sedan', 'suv'];
    const vehicles: RoadVehicle[] = [];
    for (let lane = 1; lane <= laneCount; lane += 1) {
      const hazard = laneHazards[lane - 1] ?? 'truck';
      const primaryStyle: VehicleStyle =
        hazard === 'truck' ? 'truck' : hazard === 'cart' ? 'suv' : styles[lane % styles.length];
      const baseSpeed = 0.24 + ((lane * 37) % 19) * 0.011;
      const vLen = primaryStyle === 'truck' ? 68 : primaryStyle === 'suv' ? 54 : 50;
      const vWidth = primaryStyle === 'truck' ? 38 : 34;

      // Two nicely spaced cars cruising down each asphalt lane
      vehicles.push({
        laneIndex: lane,
        y: ((lane * 0.31) % 0.85) - 0.2,
        speed: baseSpeed,
        lengthPx: vLen,
        widthPx: vWidth,
        style: primaryStyle,
      });

      const secondaryStyle = styles[(lane + 2) % styles.length];
      vehicles.push({
        laneIndex: lane,
        y: ((lane * 0.31 + 0.52) % 0.95) - 0.35,
        speed: baseSpeed,
        lengthPx: secondaryStyle === 'truck' ? 66 : 48,
        widthPx: secondaryStyle === 'truck' ? 38 : 33,
        style: secondaryStyle,
      });
    }
    anim.vehicles = vehicles;
  }, [multipliers.length, laneHazards]);

  // Synchronize jump animation & crash FX when phase/step changes
  useEffect(() => {
    const anim = animRef.current;
    const now = performance.now();

    if (phase === 'READY' && currentStep === 0) {
      const startX = getStepCenterX(0);
      anim.chickenWorldX = startX;
      anim.jumpStartX = startX;
      anim.jumpEndX = startX;
      anim.skidLanes.clear();
      anim.particles = [];
      anim.shakeTime = 0;
      // Clear any leftover interceptor flags
      anim.vehicles = anim.vehicles.filter((v) => !v.isInterceptor);
    }

    if (phase === 'JUMPING' && anim.lastPhase !== 'JUMPING') {
      anim.jumpStartX = getStepCenterX(currentStep);
      anim.jumpEndX = getStepCenterX(targetStep);
      anim.jumpStartTime = now;

      // Take-off dust puff
      for (let i = 0; i < 6; i += 1) {
        anim.particles.push({
          x: anim.jumpStartX + (Math.random() - 0.5) * 14,
          y: 0.66, // normalized Y
          vx: (Math.random() - 0.5) * 45,
          vy: -15 - Math.random() * 25,
          size: 4 + Math.random() * 5,
          alpha: 0.75,
          life: 0,
          maxLife: 0.45,
          kind: 'dust',
          rot: 0,
          vRot: 0,
        });
      }

      // If this hop is destined to crash on targetStep, launch an interceptor car down that lane!
      if (maxSafeStep !== null && targetStep > maxSafeStep) {
        anim.vehicles = anim.vehicles.filter((v) => !v.isInterceptor);
        anim.vehicles.push({
          laneIndex: targetStep,
          y: -0.22,
          speed: 2.35,
          lengthPx: 62,
          widthPx: 38,
          style: laneHazards[targetStep - 1] === 'truck' ? 'truck' : 'sedan',
          isInterceptor: true,
        });
      }
    }

    // Landing on safe step -> dust puff
    if (
      (phase === 'STEP_SAFE' || phase === 'FINISHED') &&
      currentStep > anim.lastStep
    ) {
      const landX = getStepCenterX(currentStep);
      anim.chickenWorldX = landX;
      for (let i = 0; i < 7; i += 1) {
        anim.particles.push({
          x: landX + (Math.random() - 0.5) * 16,
          y: 0.67,
          vx: (Math.random() - 0.5) * 65,
          vy: -10 - Math.random() * 30,
          size: 4 + Math.random() * 5,
          alpha: 0.85,
          life: 0,
          maxLife: 0.5,
          kind: 'dust',
          rot: 0,
          vRot: 0,
        });
      }
    }

    // Crash impact -> feathers burst + skid marks + camera shake
    if (phase === 'CRASHED' && anim.lastPhase !== 'CRASHED' && crashedLane !== null) {
      const crashX = getStepCenterX(crashedLane);
      anim.chickenWorldX = crashX;
      anim.shakeTime = now;
      anim.skidLanes.add(crashedLane);

      for (let i = 0; i < 16; i += 1) {
        const isFeather = i < 11;
        anim.particles.push({
          x: crashX + (Math.random() - 0.5) * 18,
          y: 0.64,
          vx: (Math.random() - 0.5) * 170,
          vy: -55 - Math.random() * 110,
          size: isFeather ? 5 + Math.random() * 5 : 3 + Math.random() * 4,
          alpha: 1,
          life: 0,
          maxLife: isFeather ? 1.2 : 0.45,
          kind: isFeather ? 'feather' : 'spark',
          rot: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 8,
        });
      }
    }

    anim.lastPhase = phase;
    anim.lastStep = currentStep;
  }, [phase, currentStep, targetStep, crashedLane, maxSafeStep, laneHazards]);

  useEffect(() => {
    asphaltPatternRef.current = buildAsphaltPatternCanvas();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Set up close-up jumping chicken <video> Action-Cam overlay stream
    let camCanvas: HTMLCanvasElement | null = null;
    let camCtx: CanvasRenderingContext2D | null = null;
    let camStream: MediaStream | null = null;
    if (showVideoOverlay && !reducedMotion && overlayVideoRef.current) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 220;
      tempCanvas.height = 128;
      if (typeof tempCanvas.captureStream === 'function') {
        try {
          camCanvas = tempCanvas;
          camCtx = tempCanvas.getContext('2d');
          camStream = tempCanvas.captureStream(24);
          overlayVideoRef.current.srcObject = camStream;
          void overlayVideoRef.current.play().catch(() => {
            // Ignore autoplay promise rejections
          });
          setOverlayStreamActive(true);
        } catch {
          camCanvas = null;
          camCtx = null;
          setOverlayStreamActive(false);
        }
      }
    } else {
      setOverlayStreamActive(false);
    }

    let rafId = 0;
    let lastFrameMs = performance.now();
    let lastCamCopyMs = 0;

    const renderFrame = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - lastFrameMs) / 1000);
      lastFrameMs = nowMs;
      const timeSec = nowMs / 1000;

      const s = stateRef.current;
      const anim = animRef.current;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const viewW = Math.max(280, rect.width);
      const viewH = Math.max(200, rect.height);

      if (canvas.width !== Math.round(viewW * dpr) || canvas.height !== Math.round(viewH * dpr)) {
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const laneCount = s.multipliers.length;
      const totalWorldW = SIDEWALK_WIDTH + laneCount * LANE_WIDTH + SIDEWALK_WIDTH;

      // Compute chicken animated horizontal coordinate during jump
      let jumpProgress = 0;
      const isJumping = s.phase === 'JUMPING';
      if (isJumping) {
        const elapsed = nowMs - anim.jumpStartTime;
        jumpProgress = Math.min(1, Math.max(0, elapsed / 340));
        // Smooth easeOutCubic horizontal progress
        const eased = 1 - Math.pow(1 - jumpProgress, 2.2);
        anim.chickenWorldX = anim.jumpStartX + (anim.jumpEndX - anim.jumpStartX) * eased;
      } else {
        anim.chickenWorldX = getStepCenterX(s.currentStep);
      }

      // Smooth camera tracking
      const maxCameraX = Math.max(0, totalWorldW - viewW);
      const targetCamX = Math.max(
        0,
        Math.min(maxCameraX, anim.chickenWorldX - viewW * 0.36),
      );
      if (totalWorldW <= viewW) {
        anim.cameraX = -(viewW - totalWorldW) / 2;
      } else {
        anim.cameraX += (targetCamX - anim.cameraX) * Math.min(1, dt * 8.5);
      }

      // Screen shake on crash
      let shakeX = 0;
      let shakeY = 0;
      if (!reducedMotion && anim.shakeTime > 0) {
        const shakeElapsed = nowMs - anim.shakeTime;
        if (shakeElapsed < 420) {
          const amp = (1 - shakeElapsed / 420) * 6;
          shakeX = Math.sin(shakeElapsed * 0.09) * amp;
          shakeY = Math.cos(shakeElapsed * 0.11) * amp * 0.7;
        }
      }

      // Background dark asphalt void outside world
      ctx.fillStyle = '#12161c';
      ctx.fillRect(0, 0, viewW, viewH);

      ctx.save();
      ctx.translate(-anim.cameraX + shakeX, shakeY);

      // 1. START CONCRETE SIDEWALK & GRASS SHOULDER
      ctx.fillStyle = '#166534'; // grass verge
      ctx.fillRect(0, 0, SIDEWALK_WIDTH, viewH);
      // Sidewalk concrete slab
      const sidewalkGrad = ctx.createLinearGradient(14, 0, SIDEWALK_WIDTH, 0);
      sidewalkGrad.addColorStop(0, '#475569');
      sidewalkGrad.addColorStop(0.85, '#64748b');
      sidewalkGrad.addColorStop(1, '#334155');
      ctx.fillStyle = sidewalkGrad;
      ctx.fillRect(14, 0, SIDEWALK_WIDTH - 14, viewH);

      // Paving joint seams
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      ctx.lineWidth = 1.5;
      for (let py = 28; py < viewH; py += 46) {
        ctx.beginPath();
        ctx.moveTo(14, py);
        ctx.lineTo(SIDEWALK_WIDTH, py);
        ctx.stroke();
      }
      // Yellow curb safety line next to first asphalt lane
      ctx.fillStyle = '#facc15';
      ctx.fillRect(SIDEWALK_WIDTH - 6, 0, 6, viewH);
      // Black curb stripes
      ctx.fillStyle = '#1e293b';
      for (let cy = 0; cy < viewH; cy += 28) {
        ctx.fillRect(SIDEWALK_WIDTH - 6, cy, 6, 12);
      }

      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '800 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START', SIDEWALK_WIDTH * 0.54, 24);

      // 2. ASPHALT HIGHWAY SURFACE (Lanes 1..N)
      const roadStartX = SIDEWALK_WIDTH;
      const roadW = laneCount * LANE_WIDTH;
      if (asphaltPatternRef.current) {
        const pat = ctx.createPattern(asphaltPatternRef.current, 'repeat');
        if (pat) {
          ctx.fillStyle = pat;
          ctx.fillRect(roadStartX, 0, roadW, viewH);
        }
      } else {
        ctx.fillStyle = '#20242c';
        ctx.fillRect(roadStartX, 0, roadW, viewH);
      }

      // Subtle vertical tire-wear darker tracks in every asphalt lane
      for (let lane = 1; lane <= laneCount; lane += 1) {
        const lx = roadStartX + (lane - 1) * LANE_WIDTH;
        ctx.fillStyle = 'rgba(10, 12, 16, 0.25)';
        ctx.fillRect(lx + LANE_WIDTH * 0.25, 0, 14, viewH);
        ctx.fillRect(lx + LANE_WIDTH * 0.62, 0, 14, viewH);

        // Next target highlight tint
        const isNextTarget = s.phase === 'STEP_SAFE' && lane === s.currentStep + 1;
        if (isNextTarget) {
          const pulseAlpha = 0.08 + Math.sin(timeSec * 5) * 0.04;
          ctx.fillStyle = `rgba(250, 204, 21, ${pulseAlpha})`;
          ctx.fillRect(lx, 0, LANE_WIDTH, viewH);
        }

        // Crash skid marks
        if (anim.skidLanes.has(lane)) {
          ctx.strokeStyle = 'rgba(10, 10, 12, 0.78)';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(lx + LANE_WIDTH * 0.34, 10);
          ctx.lineTo(lx + LANE_WIDTH * 0.34, viewH * 0.56);
          ctx.moveTo(lx + LANE_WIDTH * 0.66, 10);
          ctx.lineTo(lx + LANE_WIDTH * 0.66, viewH * 0.56);
          ctx.stroke();
        }
      }

      // Dashed white asphalt lane divider markings
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.72)';
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 14]);
      for (let lane = 1; lane < laneCount; lane += 1) {
        const divX = roadStartX + lane * LANE_WIDTH;
        ctx.beginPath();
        ctx.moveTo(divX, 0);
        ctx.lineTo(divX, viewH);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Horizontal zebra-style crosswalk guide track along chicken's path (66% height)
      const crossingY = viewH * 0.66;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(roadStartX, crossingY - 26, roadW, 52);

      // 3. FINISH CONCRETE CURB & CHECKERED TROPHY ZONE
      const finishStartX = roadStartX + roadW;
      ctx.fillStyle = '#facc15';
      ctx.fillRect(finishStartX, 0, 6, viewH);
      ctx.fillStyle = '#1e293b';
      for (let cy = 0; cy < viewH; cy += 28) {
        ctx.fillRect(finishStartX, cy + 12, 6, 12);
      }
      ctx.fillStyle = '#475569';
      ctx.fillRect(finishStartX + 6, 0, SIDEWALK_WIDTH - 6, viewH);
      // Finish checkered strip
      for (let row = 0; row < Math.ceil(viewH / 16); row += 1) {
        for (let col = 0; col < 2; col += 1) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#0f172a';
          ctx.fillRect(finishStartX + 10 + col * 10, row * 16, 10, 16);
        }
      }
      ctx.fillStyle = '#fde047';
      ctx.font = '900 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('FINISH', finishStartX + SIDEWALK_WIDTH * 0.56, 24);

      // 4. ASPHALT MANHOLE / MULTIPLIER PLATES ON EACH LANE
      for (let lane = 1; lane <= laneCount; lane += 1) {
        const cx = getStepCenterX(lane);
        const mult = s.multipliers[lane - 1];
        const isCleared = s.currentStep > lane || (s.currentStep === lane && s.phase !== 'CRASHED');
        const isCrashSpot = s.crashedLane === lane;
        const isNextTarget = s.phase === 'STEP_SAFE' && lane === s.currentStep + 1;
        const isChickenOnLane =
          (s.phase !== 'JUMPING' && s.currentStep === lane) ||
          (s.phase === 'JUMPING' && s.targetStep === lane);

        // Asphalt plate rim
        ctx.save();
        ctx.fillStyle = isCrashSpot
          ? '#450a0a'
          : isCleared
            ? '#064e3b'
            : isNextTarget
              ? '#451a03'
              : '#181c23';
        ctx.strokeStyle = isCrashSpot
          ? '#f43f5e'
          : isCleared
            ? '#34d399'
            : isNextTarget
              ? '#fbbf24'
              : '#475569';
        ctx.lineWidth = isNextTarget ? 2.8 : 2;
        ctx.beginPath();
        ctx.ellipse(cx, crossingY + 8, 30, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hide text inside plate if chicken is standing right on top of it, or render below
        if (!isChickenOnLane) {
          ctx.fillStyle = isCrashSpot
            ? '#fda4af'
            : isCleared
              ? '#6ee7b7'
              : isNextTarget
                ? '#fde68a'
                : '#f8fafc';
          ctx.font = '800 12px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${mult}x`, cx, crossingY + 8);
        }

        // Payout label directly underneath the manhole plate on the asphalt
        const payoutVal = Math.round(s.lockedBet * mult);
        ctx.fillStyle = isCrashSpot
          ? '#fda4af'
          : isCleared
            ? '#6ee7b7'
            : isNextTarget
              ? '#fde047'
              : 'rgba(203, 213, 225, 0.85)';
        ctx.font = '700 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${payoutVal.toLocaleString()} ${s.currencyLabel}`, cx, crossingY + 33);

        // Next target arrow indicator above lane
        if (isNextTarget) {
          const bounceY = Math.sin(timeSec * 7) * 3;
          ctx.fillStyle = '#fbbf24';
          ctx.font = '800 10px "Plus Jakarta Sans", sans-serif';
          ctx.fillText(`TAP #${lane}`, cx, crossingY - 46 + bounceY);
        }

        ctx.restore();
      }

      // 5. UPDATE & DRAW LIVE TRAFFIC VEHICLES + SAFETY BARRIERS
      const barrierY = crossingY - 44;
      for (let lane = 1; lane <= laneCount; lane += 1) {
        const isSafeCleared =
          (s.currentStep >= lane && s.crashedLane !== lane) ||
          (s.phase === 'JUMPING' &&
            s.targetStep === lane &&
            s.maxSafeStep !== null &&
            lane <= s.maxSafeStep);

        if (isSafeCleared) {
          drawSafetyBarrier(ctx, getStepCenterX(lane), barrierY);
        }
      }

      for (const v of anim.vehicles) {
        const lane = v.laneIndex;
        const laneCenterX = getStepCenterX(lane);
        const isSafeCleared =
          (s.currentStep >= lane && s.crashedLane !== lane) ||
          (s.phase === 'JUMPING' &&
            s.targetStep === lane &&
            s.maxSafeStep !== null &&
            lane <= s.maxSafeStep);

        const isCrashedHere = s.crashedLane === lane && v.isInterceptor;
        const stopNormY = (barrierY - v.lengthPx * 0.62) / viewH;
        const crashStopNormY = (crossingY - 10) / viewH;

        let braking = false;
        if (isCrashedHere) {
          if (v.y < crashStopNormY) {
            v.y = Math.min(crashStopNormY, v.y + v.speed * dt);
          } else {
            braking = true;
          }
        } else if (s.crashedLane === lane && !v.isInterceptor) {
          // Other traffic in crashed lane pauses politely
          braking = true;
        } else if (isSafeCleared) {
          // If above the safety barrier, brake and wait above the barrier; if already past crossing, drive off screen
          if (v.y <= stopNormY + 0.02) {
            if (v.y < stopNormY) {
              v.y = Math.min(stopNormY, v.y + v.speed * dt);
            } else {
              braking = true;
            }
          } else {
            v.y += v.speed * 1.45 * dt;
            if (v.y > 1.35) {
              v.y = -0.3;
            }
          }
        } else {
          // Continuous live highway flow
          if (!reducedMotion) {
            v.y += v.speed * dt;
            if (v.y > 1.32) {
              v.y = -0.32;
            }
          }
        }

        drawVehicle(ctx, laneCenterX, v.y * viewH, v, braking, timeSec);
      }

      // 6. DRAW LIFELIKE ANIMATED CHICKEN ON THE ASPHALT
      drawRealisticChicken(
        ctx,
        anim.chickenWorldX,
        crossingY - 2,
        jumpProgress,
        isJumping,
        s.phase === 'CRASHED',
        timeSec,
        reducedMotion,
      );

      // 7. UPDATE & DRAW DUST / FEATHER PARTICLES
      for (let i = anim.particles.length - 1; i >= 0; i -= 1) {
        const p = anim.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          anim.particles.splice(i, 1);
          continue;
        }
        const progress = p.life / p.maxLife;
        p.x += p.vx * dt;
        const pyPx = p.y * viewH + p.vy * p.life + 140 * p.life * p.life * 0.5;
        p.rot += p.vRot * dt;

        ctx.save();
        ctx.globalAlpha = Math.max(0, (1 - progress) * p.alpha);
        ctx.translate(p.x, pyPx);
        ctx.rotate(p.rot);

        if (p.kind === 'feather') {
          ctx.fillStyle = '#fef3c7';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'spark') {
          ctx.fillStyle = '#f97316';
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          ctx.fillStyle = '#cbd5e1';
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (0.7 + progress * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.restore(); // end camera transform
      ctx.restore(); // end DPR scale

      // Update zoomed close-up Action-Cam <video> overlay frame (~24fps)
      if (camCanvas && camCtx && nowMs - lastCamCopyMs >= 40) {
        lastCamCopyMs = nowMs;
        const chickenScreenX = anim.chickenWorldX - anim.cameraX;
        const jumpHeightPx = isJumping ? Math.sin(jumpProgress * Math.PI) * 32 : 0;
        const focusY = crossingY - jumpHeightPx * 0.6;

        // Crop a tight ~150x88 CSS-px region centered on the jumping chicken
        const cropW = 152;
        const cropH = 88;
        const sxCss = Math.max(0, Math.min(viewW - cropW, chickenScreenX - cropW * 0.5));
        const syCss = Math.max(0, Math.min(viewH - cropH, focusY - cropH * 0.55));

        camCtx.clearRect(0, 0, camCanvas.width, camCanvas.height);
        camCtx.drawImage(
          canvas,
          sxCss * dpr,
          syCss * dpr,
          cropW * dpr,
          cropH * dpr,
          0,
          0,
          camCanvas.width,
          camCanvas.height,
        );
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
      if (camStream) {
        camStream.getTracks().forEach((tr) => tr.stop());
      }
      if (overlayVideoRef.current) {
        overlayVideoRef.current.srcObject = null;
      }
    };
  }, [showVideoOverlay]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'STEP_SAFE') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickWorldX = e.clientX - rect.left + animRef.current.cameraX;
    const nextCenterX = getStepCenterX(currentStep + 1);

    // Allow tapping anywhere on or near the next highlighted asphalt lane
    if (Math.abs(clickWorldX - nextCenterX) <= LANE_WIDTH * 0.85 || clickWorldX > nextCenterX - 30) {
      onTapNextLane();
    }
  };

  const activeLaneBadge =
    phase === 'JUMPING'
      ? `#${targetStep}`
      : currentStep > 0
        ? `#${currentStep}`
        : 'START';

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700/90 bg-[#12161c] shadow-inner select-none">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        aria-label="Chicken crossing animated asphalt road"
        className={`block w-full h-[240px] sm:h-[295px] touch-manipulation ${
          phase === 'STEP_SAFE' ? 'cursor-pointer' : 'cursor-default'
        }`}
      />

      {/* Live Video-Based Action-Cam Overlay of the Jumping Chicken */}
      {showVideoOverlay && (
        <div
          className={`pointer-events-none absolute top-2 right-2 w-[118px] h-[68px] sm:w-[154px] sm:h-[88px] rounded-xl overflow-hidden border border-white/25 bg-slate-950/90 shadow-lg transition-opacity duration-300 ${
            overlayStreamActive ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <video
            ref={overlayVideoRef}
            autoPlay
            muted
            playsInline
            aria-label={actionCamLabel}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-center justify-between text-[10px] font-bold text-white">
            <span className="truncate">{actionCamLabel}</span>
            <span className="font-mono-num text-amber-300 shrink-0">{activeLaneBadge}</span>
          </div>
        </div>
      )}
    </div>
  );
};
