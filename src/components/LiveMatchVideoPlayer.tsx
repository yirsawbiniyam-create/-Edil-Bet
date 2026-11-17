import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ExternalLink,
  Lock,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Radio,
  Tv,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ScheduledMatch } from '../lib/footballSchedule';
import { useLanguage } from '../lib/i18n';
import { playGameSound } from '../lib/sound';
import { FootballMarketKey, FootballTicketPick } from '../types';

export interface LiveBroadcastFeedItem {
  id: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  homeLogo?: string;
  awayLogo?: string;
  leagueLabel: string;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  htHomeGoals?: number;
  htAwayGoals?: number;
  homeCards?: number;
  awayCards?: number;
  homeCorners?: number;
  awayCorners?: number;
  isLive: boolean;
  besoccerUrl?: string;
  matchRef?: ScheduledMatch;
  ticketPickRef?: FootballTicketPick;
}

interface LiveMatchVideoPlayerProps {
  feeds: LiveBroadcastFeedItem[];
  activeFeedId: string;
  onSelectFeed: (id: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  mode?: 'inline' | 'modal';
  onClose?: () => void;
  onExpandTheater?: () => void;
  selectedMarket?: FootballMarketKey;
  getScaledOdd?: (baseOdd: number) => number;
  onQuickPick?: (match: ScheduledMatch, market: FootballMarketKey) => void;
  onOpenMarkets?: (match: ScheduledMatch) => void;
}

type CameraMode = 'broadcast' | 'tactical';

interface KitColors {
  primary: string;
  secondary: string;
  gk: string;
}

const KIT_PALETTES: KitColors[] = [
  { primary: '#dc2626', secondary: '#ffffff', gk: '#facc15' },
  { primary: '#2563eb', secondary: '#dbeafe', gk: '#f97316' },
  { primary: '#059669', secondary: '#fef08a', gk: '#a855f7' },
  { primary: '#f59e0b', secondary: '#1e293b', gk: '#06b6d4' },
  { primary: '#7c3aed', secondary: '#f8fafc', gk: '#84cc16' },
  { primary: '#0f172a', secondary: '#38bdf8', gk: '#fb7185' },
  { primary: '#e11d48', secondary: '#1e293b', gk: '#2dd4bf' },
];

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function getTeamKits(home: string, away: string): { homeKit: KitColors; awayKit: KitColors } {
  const hIdx = hashSeed(home) % KIT_PALETTES.length;
  let aIdx = hashSeed(away) % KIT_PALETTES.length;
  if (aIdx === hIdx) {
    aIdx = (hIdx + 2) % KIT_PALETTES.length;
  }
  return {
    homeKit: KIT_PALETTES[hIdx],
    awayKit: KIT_PALETTES[aIdx],
  };
}

interface PlayerAgent {
  team: 'home' | 'away';
  role: 'gk' | 'def' | 'mid' | 'fwd';
  baseX: number; // 0..1 pitch normalized
  baseY: number; // 0..1 pitch normalized
  x: number;
  y: number;
  number: number;
  phase: number;
}

function createFormationAgents(): PlayerAgent[] {
  const agents: PlayerAgent[] = [];
  // Home (attacking left -> right, 4-3-3)
  const homeCoords: Array<{ role: PlayerAgent['role']; bx: number; by: number; num: number }> = [
    { role: 'gk', bx: 0.05, by: 0.5, num: 1 },
    { role: 'def', bx: 0.2, by: 0.16, num: 2 },
    { role: 'def', bx: 0.18, by: 0.38, num: 4 },
    { role: 'def', bx: 0.18, by: 0.62, num: 5 },
    { role: 'def', bx: 0.2, by: 0.84, num: 3 },
    { role: 'mid', bx: 0.38, by: 0.25, num: 8 },
    { role: 'mid', bx: 0.35, by: 0.5, num: 6 },
    { role: 'mid', bx: 0.38, by: 0.75, num: 10 },
    { role: 'fwd', bx: 0.56, by: 0.2, num: 7 },
    { role: 'fwd', bx: 0.6, by: 0.5, num: 9 },
    { role: 'fwd', bx: 0.56, by: 0.8, num: 11 },
  ];
  // Away (attacking right -> left, 4-2-3-1)
  const awayCoords: Array<{ role: PlayerAgent['role']; bx: number; by: number; num: number }> = [
    { role: 'gk', bx: 0.95, by: 0.5, num: 1 },
    { role: 'def', bx: 0.8, by: 0.16, num: 2 },
    { role: 'def', bx: 0.82, by: 0.38, num: 5 },
    { role: 'def', bx: 0.82, by: 0.62, num: 6 },
    { role: 'def', bx: 0.8, by: 0.84, num: 3 },
    { role: 'mid', bx: 0.65, by: 0.34, num: 4 },
    { role: 'mid', bx: 0.65, by: 0.66, num: 8 },
    { role: 'mid', bx: 0.52, by: 0.22, num: 11 },
    { role: 'mid', bx: 0.52, by: 0.5, num: 10 },
    { role: 'mid', bx: 0.52, by: 0.78, num: 7 },
    { role: 'fwd', bx: 0.42, by: 0.5, num: 9 },
  ];

  homeCoords.forEach((c, idx) => {
    agents.push({
      team: 'home',
      role: c.role,
      baseX: c.bx,
      baseY: c.by,
      x: c.bx,
      y: c.by,
      number: c.num,
      phase: idx * 0.7,
    });
  });

  awayCoords.forEach((c, idx) => {
    agents.push({
      team: 'away',
      role: c.role,
      baseX: c.bx,
      baseY: c.by,
      x: c.bx,
      y: c.by,
      number: c.num,
      phase: idx * 0.9 + 1.4,
    });
  });

  return agents;
}

export function matchToBroadcastFeed(m: ScheduledMatch): LiveBroadcastFeedItem {
  return {
    id: m.id,
    home: m.home,
    away: m.away,
    homeCode: m.homeCode,
    awayCode: m.awayCode,
    homeLogo: m.homeLogo,
    awayLogo: m.awayLogo,
    leagueLabel: m.leagueLabel,
    minute: Math.max(1, m.liveMinute ?? 1),
    homeGoals: m.liveHomeGoals ?? 0,
    awayGoals: m.liveAwayGoals ?? 0,
    htHomeGoals: m.liveHtHomeGoals,
    htAwayGoals: m.liveHtAwayGoals,
    homeCards: m.liveHomeCards,
    awayCards: m.liveAwayCards,
    homeCorners: m.liveHomeCorners,
    awayCorners: m.liveAwayCorners,
    isLive: m.isLive,
    besoccerUrl: m.besoccerUrl,
    matchRef: m,
  };
}

export const LiveMatchVideoPlayer: React.FC<LiveMatchVideoPlayerProps> = ({
  feeds,
  activeFeedId,
  onSelectFeed,
  soundEnabled,
  onToggleSound,
  mode = 'inline',
  onClose,
  onExpandTheater,
  selectedMarket,
  getScaledOdd,
  onQuickPick,
  onOpenMarkets,
}) => {
  const { bi } = useLanguage();
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>('broadcast');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [goalBanner, setGoalBanner] = useState<{
    team: 'home' | 'away';
    teamName: string;
    scoreText: string;
  } | null>(null);
  const [liveTickerEvent, setLiveTickerEvent] = useState<string>('');

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeFeed = useMemo(
    () => feeds.find((f) => f.id === activeFeedId) || feeds[0] || null,
    [feeds, activeFeedId],
  );

  const prevScoreRef = useRef<{ id: string; hg: number; ag: number } | null>(null);
  const goalAnimationUntilRef = useRef<{ until: number; side: 'home' | 'away' } | null>(null);

  // Detect goal change -> dramatic goal celebration overlay + canvas net shot
  useEffect(() => {
    if (!activeFeed) return;
    const prev = prevScoreRef.current;
    if (prev && prev.id === activeFeed.id) {
      if (activeFeed.homeGoals > prev.hg) {
        goalAnimationUntilRef.current = { until: performance.now() + 3800, side: 'home' };
        setGoalBanner({
          team: 'home',
          teamName: activeFeed.home,
          scoreText: `${activeFeed.homeGoals} - ${activeFeed.awayGoals}`,
        });
        playGameSound('win', soundEnabled);
        window.setTimeout(() => setGoalBanner(null), 3800);
      } else if (activeFeed.awayGoals > prev.ag) {
        goalAnimationUntilRef.current = { until: performance.now() + 3800, side: 'away' };
        setGoalBanner({
          team: 'away',
          teamName: activeFeed.away,
          scoreText: `${activeFeed.homeGoals} - ${activeFeed.awayGoals}`,
        });
        playGameSound('win', soundEnabled);
        window.setTimeout(() => setGoalBanner(null), 3800);
      }
    }
    prevScoreRef.current = {
      id: activeFeed.id,
      hg: activeFeed.homeGoals,
      ag: activeFeed.awayGoals,
    };
  }, [activeFeed?.id, activeFeed?.homeGoals, activeFeed?.awayGoals, activeFeed?.home, activeFeed?.away, soundEnabled]);

  // Listen to native fullscreen state changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!stageRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await stageRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      if (mode === 'inline' && onExpandTheater) {
        onExpandTheater();
      }
    }
  };

  // Match telemetry derived cleanly from match id, minute, and live goals/corners/cards
  const telemetry = useMemo(() => {
    if (!activeFeed) {
      return {
        homePoss: 50,
        awayPoss: 50,
        homeShots: 0,
        awayShots: 0,
        homeOnTarget: 0,
        awayOnTarget: 0,
        homeCorners: 0,
        awayCorners: 0,
        homeCards: 0,
        awayCards: 0,
      };
    }
    const seed = hashSeed(activeFeed.id);
    const min = Math.max(1, activeFeed.minute);
    const goalBias = (activeFeed.homeGoals - activeFeed.awayGoals) * 4;
    const rawHomePoss = 44 + (seed % 15) + goalBias;
    const homePoss = Math.max(32, Math.min(68, rawHomePoss));
    const awayPoss = 100 - homePoss;

    const baseRate = Math.max(1, Math.floor(min / 8));
    const homeShots = Math.max(activeFeed.homeGoals + 1, Math.round(baseRate * (homePoss / 50)) + (seed % 3));
    const awayShots = Math.max(activeFeed.awayGoals + 1, Math.round(baseRate * (awayPoss / 50)) + ((seed >> 2) % 3));
    const homeOnTarget = Math.max(activeFeed.homeGoals, Math.min(homeShots, Math.ceil(homeShots * 0.45)));
    const awayOnTarget = Math.max(activeFeed.awayGoals, Math.min(awayShots, Math.ceil(awayShots * 0.45)));

    return {
      homePoss,
      awayPoss,
      homeShots,
      awayShots,
      homeOnTarget,
      awayOnTarget,
      homeCorners: activeFeed.homeCorners ?? Math.max(0, Math.floor((min * homePoss) / 900)),
      awayCorners: activeFeed.awayCorners ?? Math.max(0, Math.floor((min * awayPoss) / 950)),
      homeCards: activeFeed.homeCards ?? (min > 30 ? (seed % 3) : 0),
      awayCards: activeFeed.awayCards ?? (min > 25 ? ((seed >> 3) % 3) : 0),
    };
  }, [activeFeed]);

  // Dynamic Play-by-Play Commentary Events up to current minute
  const commentaryEvents = useMemo(() => {
    if (!activeFeed) return [];
    const min = Math.max(1, activeFeed.minute);
    const seed = hashSeed(activeFeed.id);
    const events: Array<{ min: number; kind: 'goal' | 'chance' | 'corner' | 'card' | 'kickoff'; text: string }> = [];

    events.push({
      min: 1,
      kind: 'kickoff',
      text: bi(
        `ጨዋታው ተጀምሯል — ${activeFeed.home} vs ${activeFeed.away}`,
        `Kick-off! ${activeFeed.home} vs ${activeFeed.away}`,
      ),
    });

    if (min >= 12) {
      const m1 = 7 + (seed % 7);
      const team = seed % 2 === 0 ? activeFeed.home : activeFeed.away;
      events.push({
        min: m1,
        kind: 'chance',
        text: bi(
          `${team} ጠንካራ ሙከራ ወደ ግብ አደረገ — በረኛው አዳነው`,
          `Dangerous shot on target by ${team} — sharp save!`,
        ),
      });
    }

    if (telemetry.homeCorners + telemetry.awayCorners > 0 && min >= 18) {
      events.push({
        min: Math.min(min, 16 + (seed % 11)),
        kind: 'corner',
        text: bi(
          `ለ${telemetry.homeCorners >= telemetry.awayCorners ? activeFeed.home : activeFeed.away} የኮርነር ምት`,
          `Corner kick won by ${telemetry.homeCorners >= telemetry.awayCorners ? activeFeed.home : activeFeed.away}`,
        ),
      });
    }

    for (let g = 1; g <= activeFeed.homeGoals; g += 1) {
      const gm = Math.min(min, Math.max(4, Math.round((min * g) / (activeFeed.homeGoals + activeFeed.awayGoals + 1))));
      events.push({
        min: gm,
        kind: 'goal',
        text: bi(
          `⚽ ጎል! ${activeFeed.home} አስቆጠረ!`,
          `⚽ GOAL! ${activeFeed.home} finds the back of the net!`,
        ),
      });
    }

    for (let g = 1; g <= activeFeed.awayGoals; g += 1) {
      const gm = Math.min(min, Math.max(6, Math.round((min * (g + 0.5)) / (activeFeed.homeGoals + activeFeed.awayGoals + 1))));
      events.push({
        min: gm,
        kind: 'goal',
        text: bi(
          `⚽ ጎል! ${activeFeed.away} አስቆጠረ!`,
          `⚽ GOAL! ${activeFeed.away} scores!`,
        ),
      });
    }

    if (telemetry.homeCards + telemetry.awayCards > 0 && min >= 28) {
      events.push({
        min: Math.min(min, 27 + (seed % 18)),
        kind: 'card',
        text: bi(
          `🟨 ቢጫ ካርድ — ከባድ ጥፋት ተሰርቷል`,
          `🟨 Yellow card shown following tactical foul`,
        ),
      });
    }

    if (min >= 45) {
      events.push({
        min: 45,
        kind: 'kickoff',
        text: bi(
          `የመጀመሪያ አጋማሽ እረፍት (HT ${activeFeed.htHomeGoals ?? Math.min(activeFeed.homeGoals, 1)}-${activeFeed.htAwayGoals ?? Math.min(activeFeed.awayGoals, 1)})`,
          `Halftime whistle (HT ${activeFeed.htHomeGoals ?? Math.min(activeFeed.homeGoals, 1)}-${activeFeed.htAwayGoals ?? Math.min(activeFeed.awayGoals, 1)})`,
        ),
      });
    }

    return events.sort((a, b) => b.min - a.min).slice(0, 6);
  }, [activeFeed, telemetry, bi]);

  // Real-time 60fps HTML5 Canvas Broadcast Simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeFeed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { homeKit, awayKit } = getTeamKits(activeFeed.home, activeFeed.away);
    const agents = createFormationAgents();

    // Ball state in normalized 0..1 pitch coordinates
    let ballX = 0.5;
    let ballY = 0.5;
    let ballZ = 0; // height for lobbed passes / shots
    let targetX = 0.64;
    let targetY = 0.36;
    let startX = 0.5;
    let startY = 0.5;
    let passProgress = 1;
    let passDuration = 1.1;
    let possession: 'home' | 'away' = hashSeed(activeFeed.id) % 2 === 0 ? 'home' : 'away';
    const ballTrail: Array<{ x: number; y: number }> = [];
    let lastTime = performance.now();
    let lastCommentaryAt = 0;
    let rafId = 0;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(320, Math.round(rect.width));
      const h = Math.max(180, Math.round(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeCanvas) : null;
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);

    // Project normalized pitch coords (px: 0..1, py: 0..1) into screen coords based on cameraMode
    const projectPoint = (
      px: number,
      py: number,
      pz: number,
      W: number,
      H: number,
      camXShift: number,
    ): { sx: number; sy: number; scale: number } => {
      if (cameraMode === 'tactical') {
        const marginX = W * 0.06;
        const marginY = H * 0.12;
        const pitchW = W - marginX * 2;
        const pitchH = H - marginY * 2;
        return {
          sx: marginX + px * pitchW,
          sy: marginY + py * pitchH - pz * 24,
          scale: 1,
        };
      }

      // Broadcast angled TV stadium perspective
      const topY = H * 0.22;
      const botY = H * 0.91;
      const depthScale = 0.78 + py * 0.26; // narrower at top, wider near bottom TV touchline
      const sy = topY + py * (botY - topY) - pz * 32;
      const centerX = W * 0.5 - camXShift * (W * 0.055);
      const halfSpan = W * 0.44 * depthScale;
      const sx = centerX + (px - 0.5) * 2 * halfSpan;
      return { sx, sy, scale: depthScale };
    };

    const pickNextBallAction = (now: number) => {
      const goalAnim = goalAnimationUntilRef.current;
      if (goalAnim && now < goalAnim.until) {
        // Shoot directly into goal!
        startX = ballX;
        startY = ballY;
        targetX = goalAnim.side === 'home' ? 0.985 : 0.015;
        targetY = 0.46 + Math.random() * 0.08;
        passProgress = 0;
        passDuration = 0.55;
        possession = goalAnim.side;
        return;
      }

      // Pick a realistic next pass, cross, or shot
      const roll = Math.random();
      startX = ballX;
      startY = ballY;

      if (roll < 0.18) {
        // Possession turnover
        possession = possession === 'home' ? 'away' : 'home';
      }

      const teamAgents = agents.filter((a) => a.team === possession && a.role !== 'gk');
      if (roll > 0.84) {
        // Shot attempt toward opponent goal!
        targetX = possession === 'home' ? 0.95 : 0.05;
        targetY = 0.42 + Math.random() * 0.16;
        passDuration = 0.72;
        if (now - lastCommentaryAt > 4500) {
          lastCommentaryAt = now;
          const shooter = possession === 'home' ? activeFeed.homeCode : activeFeed.awayCode;
          setLiveTickerEvent(
            bi(`🔥 ${shooter} ጠንካራ የግብ ሙከራ አደረገ!`, `🔥 Shot on goal by ${shooter}!`),
          );
        }
      } else {
        const chosen = teamAgents[Math.floor(Math.random() * teamAgents.length)];
        targetX = Math.max(0.08, Math.min(0.92, chosen.x + (Math.random() - 0.5) * 0.08));
        targetY = Math.max(0.08, Math.min(0.92, chosen.y + (Math.random() - 0.5) * 0.08));
        passDuration = 0.65 + Math.random() * 0.75;
        if (now - lastCommentaryAt > 5500) {
          lastCommentaryAt = now;
          const carrier = possession === 'home' ? activeFeed.homeCode : activeFeed.awayCode;
          setLiveTickerEvent(
            targetX > 0.65 || targetX < 0.35
              ? bi(`⚡ ${carrier} ወደ ፍፁም ቅጣት ክልል እየገባ ነው`, `⚡ ${carrier} attacking in the final third`)
              : bi(`⚽ ${carrier} ኳሱን በመሃል ሜዳ እየተቀባበለ ነው`, `⚽ ${carrier} building play through midfield`),
          );
        }
      }
      passProgress = 0;
    };

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const W = canvas.clientWidth || 640;
      const H = canvas.clientHeight || 360;

      if (isPlaying) {
        passProgress += dt / passDuration;
        if (passProgress >= 1) {
          ballX = targetX;
          ballY = targetY;
          ballZ = 0;
          pickNextBallAction(now);
        } else {
          const ease = 1 - Math.pow(1 - passProgress, 2);
          ballX = startX + (targetX - startX) * ease;
          ballY = startY + (targetY - startY) * ease;
          ballZ = Math.sin(passProgress * Math.PI) * (Math.hypot(targetX - startX, targetY - startY) * 1.4);
        }

        ballTrail.push({ x: ballX, y: ballY });
        if (ballTrail.length > 14) ballTrail.shift();

        // Shift players tactically toward ball X/Y
        const shiftX = (ballX - 0.5) * 0.24;
        const shiftY = (ballY - 0.5) * 0.14;
        agents.forEach((ag) => {
          if (ag.role === 'gk') {
            const desiredY = Math.max(0.38, Math.min(0.62, 0.5 + (ballY - 0.5) * 0.26));
            ag.y += (desiredY - ag.y) * Math.min(1, dt * 4);
            ag.x = ag.baseX;
          } else {
            const roleWeight = ag.role === 'def' ? 0.55 : ag.role === 'mid' ? 0.95 : 1.05;
            const wobbleX = Math.sin(now * 0.0018 + ag.phase) * 0.025;
            const wobbleY = Math.cos(now * 0.0021 + ag.phase) * 0.03;
            const desiredX = Math.max(0.09, Math.min(0.91, ag.baseX + shiftX * roleWeight + wobbleX));
            const desiredY = Math.max(0.07, Math.min(0.93, ag.baseY + shiftY * roleWeight + wobbleY));
            ag.x += (desiredX - ag.x) * Math.min(1, dt * 2.5);
            ag.y += (desiredY - ag.y) * Math.min(1, dt * 2.5);
          }
        });
      }

      const camShift = cameraMode === 'broadcast' ? (ballX - 0.5) * 0.9 : 0;

      // 1. Stadium Night Sky & Crowd Backdrop
      ctx.fillStyle = '#07111a';
      ctx.fillRect(0, 0, W, H);

      if (cameraMode === 'broadcast') {
        // Upper Stadium Crowd Stands + Floodlights
        const crowdGrad = ctx.createLinearGradient(0, 0, 0, H * 0.24);
        crowdGrad.addColorStop(0, '#0b1623');
        crowdGrad.addColorStop(1, '#162436');
        ctx.fillStyle = crowdGrad;
        ctx.fillRect(0, 0, W, H * 0.24);

        // Crowd dots
        for (let r = 0; r < 4; r += 1) {
          const rowY = H * (0.04 + r * 0.038);
          for (let c = 12; c < W - 12; c += 11) {
            const pulse = isPlaying ? Math.sin(now * 0.005 + c * 0.2 + r) * 0.8 : 0;
            ctx.fillStyle =
              (c + r) % 3 === 0
                ? homeKit.primary
                : (c + r) % 5 === 0
                  ? awayKit.primary
                  : 'rgba(148, 163, 184, 0.42)';
            ctx.beginPath();
            ctx.arc(c, rowY + pulse, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Stadium Floodlights
        [W * 0.16, W * 0.84].forEach((lx) => {
          const glow = ctx.createRadialGradient(lx, H * 0.04, 2, lx, H * 0.04, W * 0.22);
          glow.addColorStop(0, 'rgba(255, 255, 235, 0.35)');
          glow.addColorStop(1, 'rgba(255, 255, 235, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, W, H * 0.45);
        });

        // LED Perimeter Boards along top touchline
        const tl = projectPoint(0, 0, 0, W, H, camShift);
        const tr = projectPoint(1, 0, 0, W, H, camShift);
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(tl.sx - 8, tl.sy - 14, tr.sx - tl.sx + 16, 12);
        ctx.fillStyle = '#9AD84B';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `EDIL BET LIVE TV  •  ${activeFeed.leagueLabel.toUpperCase()}  •  135+ MARKETS  •  INSTANT CASHOUT`,
          (tl.sx + tr.sx) / 2,
          tl.sy - 5,
        );
      }

      // 2. Pitch Grass & Mowed Stripes
      const pTL = projectPoint(0, 0, 0, W, H, camShift);
      const pTR = projectPoint(1, 0, 0, W, H, camShift);
      const pBR = projectPoint(1, 1, 0, W, H, camShift);
      const pBL = projectPoint(0, 1, 0, W, H, camShift);

      // Outer grass apron
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.moveTo(pTL.sx - 24, pTL.sy - 4);
      ctx.lineTo(pTR.sx + 24, pTR.sy - 4);
      ctx.lineTo(pBR.sx + 36, pBR.sy + 18);
      ctx.lineTo(pBL.sx - 36, pBL.sy + 18);
      ctx.closePath();
      ctx.fill();

      // 10 Alternating Vertical Grass Stripes
      for (let i = 0; i < 10; i += 1) {
        const x0 = i / 10;
        const x1 = (i + 1) / 10;
        const sTL = projectPoint(x0, 0, 0, W, H, camShift);
        const sTR = projectPoint(x1, 0, 0, W, H, camShift);
        const sBR = projectPoint(x1, 1, 0, W, H, camShift);
        const sBL = projectPoint(x0, 1, 0, W, H, camShift);

        ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
        ctx.beginPath();
        ctx.moveTo(sTL.sx, sTL.sy);
        ctx.lineTo(sTR.sx, sTR.sy);
        ctx.lineTo(sBR.sx, sBR.sy);
        ctx.lineTo(sBL.sx, sBL.sy);
        ctx.closePath();
        ctx.fill();
      }

      // 3. Chalk Pitch Markings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.6;

      // Outer touchline rectangle
      ctx.beginPath();
      ctx.moveTo(pTL.sx, pTL.sy);
      ctx.lineTo(pTR.sx, pTR.sy);
      ctx.lineTo(pBR.sx, pBR.sy);
      ctx.lineTo(pBL.sx, pBL.sy);
      ctx.closePath();
      ctx.stroke();

      // Halfway line
      const midTop = projectPoint(0.5, 0, 0, W, H, camShift);
      const midBot = projectPoint(0.5, 1, 0, W, H, camShift);
      ctx.beginPath();
      ctx.moveTo(midTop.sx, midTop.sy);
      ctx.lineTo(midBot.sx, midBot.sy);
      ctx.stroke();

      // Center circle (sampled polygon for exact perspective ellipse)
      ctx.beginPath();
      for (let a = 0; a <= 36; a += 1) {
        const theta = (a / 36) * Math.PI * 2;
        const pt = projectPoint(0.5 + Math.cos(theta) * 0.085, 0.5 + Math.sin(theta) * 0.14, 0, W, H, camShift);
        if (a === 0) ctx.moveTo(pt.sx, pt.sy);
        else ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.stroke();

      // Left & Right Penalty Boxes
      const drawRectOnPitch = (x0: number, y0: number, x1: number, y1: number) => {
        const a = projectPoint(x0, y0, 0, W, H, camShift);
        const b = projectPoint(x1, y0, 0, W, H, camShift);
        const c = projectPoint(x1, y1, 0, W, H, camShift);
        const d = projectPoint(x0, y1, 0, W, H, camShift);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.lineTo(d.sx, d.sy);
        ctx.stroke();
      };
      drawRectOnPitch(0, 0.22, 0.16, 0.78);
      drawRectOnPitch(0, 0.37, 0.055, 0.63);
      drawRectOnPitch(1, 0.22, 0.84, 0.78);
      drawRectOnPitch(1, 0.37, 0.945, 0.63);

      // 4. Goals (Left & Right 3D Net Frames)
      const drawGoal = (isRight: boolean) => {
        const gx = isRight ? 1 : 0;
        const postTopBase = projectPoint(gx, 0.42, 0, W, H, camShift);
        const postTopBar = projectPoint(gx, 0.42, 0.45, W, H, camShift);
        const postBotBase = projectPoint(gx, 0.58, 0, W, H, camShift);
        const postBotBar = projectPoint(gx, 0.58, 0.45, W, H, camShift);
        const netOffset = isRight ? 10 : -10;

        // Net mesh
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.beginPath();
        ctx.moveTo(postTopBar.sx, postTopBar.sy);
        ctx.lineTo(postTopBar.sx + netOffset, postTopBar.sy + 3);
        ctx.lineTo(postBotBar.sx + netOffset, postBotBar.sy + 3);
        ctx.lineTo(postBotBase.sx + netOffset, postBotBase.sy);
        ctx.lineTo(postBotBase.sx, postBotBase.sy);
        ctx.lineTo(postTopBase.sx, postTopBase.sy);
        ctx.closePath();
        ctx.fill();

        // White frame
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(postTopBase.sx, postTopBase.sy);
        ctx.lineTo(postTopBar.sx, postTopBar.sy);
        ctx.lineTo(postBotBar.sx, postBotBar.sy);
        ctx.lineTo(postBotBase.sx, postBotBase.sy);
        ctx.stroke();
      };
      drawGoal(false);
      drawGoal(true);

      // 5. Ball Trajectory Trail
      if (ballTrail.length > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ballTrail.forEach((pt, idx) => {
          const p = projectPoint(pt.x, pt.y, 0, W, H, camShift);
          if (idx === 0) ctx.moveTo(p.sx, p.sy);
          else ctx.lineTo(p.sx, p.sy);
        });
        ctx.stroke();
      }

      // 6. Depth-sorted Players + Ball so closer (higher py) render on top
      const renderItems: Array<{ depthY: number; draw: () => void }> = [];

      agents.forEach((ag) => {
        renderItems.push({
          depthY: ag.y,
          draw: () => {
            const pos = projectPoint(ag.x, ag.y, 0, W, H, camShift);
            const kit = ag.team === 'home' ? homeKit : awayKit;
            const bodyFill = ag.role === 'gk' ? kit.gk : kit.primary;
            const r = (cameraMode === 'broadcast' ? 6.2 : 6.8) * pos.scale;

            // Shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
            ctx.beginPath();
            ctx.ellipse(pos.sx, pos.sy + r * 0.75, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();

            // Active highlight ring if near ball
            const distBall = Math.hypot(ag.x - ballX, ag.y - ballY);
            if (distBall < 0.08) {
              ctx.strokeStyle = '#9AD84B';
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.ellipse(pos.sx, pos.sy + r * 0.65, r * 1.45, r * 0.75, 0, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Jersey circle
            ctx.fillStyle = bodyFill;
            ctx.beginPath();
            ctx.arc(pos.sx, pos.sy, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = kit.secondary;
            ctx.lineWidth = 1.4;
            ctx.stroke();

            // Player number
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(7, Math.round(r * 1.05))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(ag.number), pos.sx, pos.sy + 0.5);
          },
        });
      });

      // Ball item
      renderItems.push({
        depthY: ballY + 0.01,
        draw: () => {
          const groundPos = projectPoint(ballX, ballY, 0, W, H, camShift);
          const airPos = projectPoint(ballX, ballY, ballZ, W, H, camShift);
          const br = 4.3 * airPos.scale;

          // Ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.beginPath();
          ctx.ellipse(groundPos.sx, groundPos.sy + 2, br * 0.9, br * 0.48, 0, 0, Math.PI * 2);
          ctx.fill();

          // Soccer ball
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(airPos.sx, airPos.sy, br, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        },
      });

      renderItems.sort((a, b) => a.depthY - b.depthY);
      renderItems.forEach((item) => item.draw());

      // Goal Flash Vignette
      const goalAnim = goalAnimationUntilRef.current;
      if (goalAnim && now < goalAnim.until) {
        ctx.fillStyle = 'rgba(154, 216, 75, 0.16)';
        ctx.fillRect(0, 0, W, H);
      }

      rafId = window.requestAnimationFrame(drawFrame);
    };

    rafId = window.requestAnimationFrame(drawFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [activeFeed, cameraMode, isPlaying, bi]);

  if (!activeFeed) return null;

  const { homeKit, awayKit } = getTeamKits(activeFeed.home, activeFeed.away);
  const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${activeFeed.home} vs ${activeFeed.away} live highlights`,
  )}`;
  const halfTag =
    activeFeed.minute >= 90
      ? 'FT'
      : activeFeed.minute === 45
        ? 'HT'
        : activeFeed.minute < 45
          ? '1H'
          : '2H';
  const matchRef = activeFeed.matchRef;
  const isBetLocked = Boolean(matchRef && matchRef.isLive && (matchRef.liveMinute ?? 0) >= 86);

  return (
    <div
      className={
        mode === 'modal'
          ? 'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4'
          : 'bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-md text-white'
      }
      role={mode === 'modal' ? 'dialog' : undefined}
      aria-modal={mode === 'modal' ? 'true' : undefined}
      aria-label={bi('የጨዋታ ቀጥታ ቪድዮ', 'Live Match Video Broadcast')}
    >
      <div
        className={
          mode === 'modal'
            ? 'w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[95dvh] flex flex-col text-white'
            : 'flex flex-col'
        }
      >
        {/* Top Broadcast Header */}
        <div className="bg-[#0B141D] border-b border-slate-800 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {mode === 'modal' && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-black flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#9AD84B]" />
                <span>{bi('ተመለስ', 'Back')}</span>
              </button>
            )}
            <div className="flex items-center gap-1.5 text-rose-400 font-mono-num text-[11px] font-black shrink-0">
              <Radio className="w-3.5 h-3.5" />
              <span>EDIL TV · LIVE</span>
            </div>
            <span className="text-slate-600">·</span>
            <span className="text-xs sm:text-sm font-black text-white truncate">
              {activeFeed.home} vs {activeFeed.away}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="hidden sm:inline text-[11px] text-slate-400 truncate max-w-[160px]">
              {activeFeed.leagueLabel}
            </span>
            {mode === 'inline' && onExpandTheater && (
              <button
                type="button"
                onClick={onExpandTheater}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-[#9AD84B] flex items-center gap-1 cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{bi('ትልቅ ስክሪን', 'Theater')}</span>
              </button>
            )}
            {mode === 'modal' && onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={bi('ዝጋ', 'Close')}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Multi-Channel Live Switcher */}
        {feeds.length > 1 && (
          <div className="bg-[#0F1924] border-b border-slate-800 px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[10px] font-extrabold text-slate-400 shrink-0 mr-1 flex items-center gap-1">
              <Tv className="w-3 h-3 text-[#9AD84B]" />
              {bi('ቻናሎች:', 'Channels:')}
            </span>
            {feeds.map((f, idx) => {
              const selected = f.id === activeFeed.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    onSelectFeed(f.id);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono-num font-bold whitespace-nowrap shrink-0 cursor-pointer transition border ${
                    selected
                      ? 'bg-[#0E8A38] border-[#9AD84B] text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  CH {idx + 1}: {f.homeCode} {f.homeGoals}-{f.awayGoals} {f.awayCode} ({f.minute}&apos;)
                </button>
              );
            })}
          </div>
        )}

        <div className={mode === 'modal' ? 'flex-1 overflow-y-auto' : ''}>
          {/* 16:9 Broadcast Video Canvas Stage */}
          <div
            ref={stageRef}
            className="relative w-full aspect-video bg-[#07111a] select-none overflow-hidden"
          >
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* Top-Left TV Scorebug HUD */}
            <div className="absolute top-2.5 left-2.5 sm:top-3.5 sm:left-3.5 z-10 flex items-center bg-slate-950/90 border border-slate-700/80 rounded-lg overflow-hidden shadow-lg text-xs font-mono-num">
              <div className="bg-[#0E8A38] text-white px-2 py-1.5 font-black flex items-center gap-1">
                <span>{halfTag}</span>
                <span>{activeFeed.minute}&apos;</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs border border-white/60 shrink-0"
                  style={{ backgroundColor: homeKit.primary }}
                />
                <span className="font-extrabold text-white">{activeFeed.homeCode}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 font-black text-[#9AD84B]">
                  {activeFeed.homeGoals} - {activeFeed.awayGoals}
                </span>
                <span className="font-extrabold text-white">{activeFeed.awayCode}</span>
                <span
                  className="w-2.5 h-2.5 rounded-xs border border-white/60 shrink-0"
                  style={{ backgroundColor: awayKit.primary }}
                />
              </div>
            </div>

            {/* Top-Right HD Video Status */}
            <div className="absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5 z-10 hidden sm:flex items-center gap-2 bg-slate-950/85 border border-slate-700/70 rounded-lg px-2.5 py-1 text-[10px] font-mono-num font-bold text-slate-200">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>HD 60FPS · {cameraMode === 'broadcast' ? 'STADIUM TV' : '2D TACTICAL'}</span>
            </div>

            {/* Dramatic GOAL! Broadcast Banner */}
            {goalBanner && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-20 flex justify-center px-4 pointer-events-none">
                <div className="bg-slate-950/95 border-2 border-[#9AD84B] rounded-xl px-6 py-3 text-center shadow-2xl">
                  <p className="text-xs font-mono-num font-black text-[#9AD84B] tracking-widest">
                    ⚽ GOAL! · {activeFeed.minute}&apos;
                  </p>
                  <p className="text-lg sm:text-2xl font-black text-white">{goalBanner.teamName}</p>
                  <p className="text-sm font-mono-num font-extrabold text-emerald-300">
                    {activeFeed.homeCode} {goalBanner.scoreText} {activeFeed.awayCode}
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Video Controls & Live Play-by-Play Overlay */}
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setIsPlaying((prev) => !prev);
                  }}
                  aria-label={isPlaying ? bi('አቁም', 'Pause') : bi('አጫውት', 'Play')}
                  className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={onToggleSound}
                  aria-label={soundEnabled ? bi('ድምጽ አጥፋ', 'Mute') : bi('ድምጽ አብራ', 'Unmute')}
                  className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-[#9AD84B]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                <span className="text-[11px] sm:text-xs font-semibold text-slate-200 truncate">
                  {liveTickerEvent ||
                    commentaryEvents[0]?.text ||
                    `${activeFeed.home} vs ${activeFeed.away} · ${activeFeed.minute}'`}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setCameraMode((prev) => (prev === 'broadcast' ? 'tactical' : 'broadcast'));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-[#9AD84B]" />
                  <span>
                    {cameraMode === 'broadcast'
                      ? bi('2D ራዳር', '2D View')
                      : bi('ቲቪ ካሜራ', 'TV Cam')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  aria-label={isFullscreen ? bi('አሳንስ', 'Exit Fullscreen') : bi('ሙሉ ስክሪን', 'Fullscreen')}
                  className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4" />
                  ) : (
                    <Maximize2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Live Match Stats & Possession Strip */}
          <div className="bg-[#0E1722] border-t border-slate-800 px-3 sm:px-4 py-3 space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono-num">
                <span className="font-bold text-white">
                  {activeFeed.homeCode} {telemetry.homePoss}%
                </span>
                <span className="text-slate-400 font-sans font-semibold">
                  {bi('የኳስ ቁጥጥር (Possession)', 'Ball Possession')}
                </span>
                <span className="font-bold text-white">
                  {telemetry.awayPoss}% {activeFeed.awayCode}
                </span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden bg-slate-800 flex">
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${telemetry.homePoss}%`, backgroundColor: homeKit.primary }}
                />
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${telemetry.awayPoss}%`, backgroundColor: awayKit.primary }}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-mono-num border-t border-slate-800/80 pt-2.5">
              <div>
                <span className="text-slate-400 block text-[10px] font-sans">
                  {bi('ሙከራዎች', 'Shots')}
                </span>
                <span className="font-extrabold text-white">
                  {telemetry.homeShots} - {telemetry.awayShots}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-sans">
                  {bi('በግብ ኢላማ', 'On Target')}
                </span>
                <span className="font-extrabold text-[#9AD84B]">
                  {telemetry.homeOnTarget} - {telemetry.awayOnTarget}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-sans">
                  {bi('ኮርነር', 'Corners')}
                </span>
                <span className="font-extrabold text-white">
                  {telemetry.homeCorners} - {telemetry.awayCorners}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] font-sans">
                  {bi('ካርዶች', 'Cards')}
                </span>
                <span className="font-extrabold text-amber-400">
                  {telemetry.homeCards} - {telemetry.awayCards}
                </span>
              </div>
            </div>

            {/* Live Quick Bet Bar (when watching a scheduled live match < 86') */}
            {matchRef && getScaledOdd && onQuickPick && (
              <div className="border-t border-slate-800 pt-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">
                    {bi('እየተመለከቱ ይወራረዱ (1 / X / 2)', 'Live Quick Bet While Watching')}
                  </span>
                  {onOpenMarkets && !isBetLocked && (
                    <button
                      type="button"
                      onClick={() => onOpenMarkets(matchRef)}
                      className="text-[11px] font-extrabold text-[#9AD84B] hover:underline cursor-pointer"
                    >
                      {bi('+135 ገበያዎች', '+135 Markets')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['1', activeFeed.homeCode],
                      ['X', bi('አቻ', 'Draw')],
                      ['2', activeFeed.awayCode],
                    ] as const
                  ).map(([mkt, label]) => {
                    const active = selectedMarket === mkt;
                    return (
                      <button
                        key={mkt}
                        type="button"
                        disabled={isBetLocked}
                        onClick={() => onQuickPick(matchRef, mkt)}
                        className={`min-h-[40px] px-3 rounded-lg text-xs font-mono-num flex items-center justify-between gap-1 transition cursor-pointer disabled:opacity-45 ${
                          active
                            ? 'bg-[#0E8A38] text-white font-black border border-[#9AD84B]'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold border border-slate-700'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        {isBetLocked ? (
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <span>{getScaledOdd(matchRef.odds[mkt]).toFixed(2)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Live Match Events Timeline + External Video Highlights Links */}
            <div className="border-t border-slate-800 pt-2.5 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-400">
                  {bi('የጨዋታው ቀጥታ ክስተቶች', 'Live Match Timeline')}
                </p>
                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {commentaryEvents.map((ev, i) => (
                    <div key={`${ev.min}_${i}`} className="flex items-start gap-2 text-[11px]">
                      <span className="font-mono-num font-black text-[#9AD84B] shrink-0">
                        {ev.min}&apos;
                      </span>
                      <span className="text-slate-300">{ev.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0">
                <a
                  href={youtubeSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-200 text-[11px] font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{bi('YouTube ቪድዮ', 'YouTube Highlights')}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                {activeFeed.besoccerUrl && (
                  <a
                    href={activeFeed.besoccerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#9AD84B]" />
                    <span>BeSoccer Live</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
