import { ScheduledMatch } from './footballSchedule';

export const PRE_MATCH_ALERT_WINDOW_MS = 15 * 60 * 1000;

const STORAGE_KEYS = {
  enabled: 'edilbet_prematch_push_enabled_v1',
  remindIds: 'edilbet_remind_match_ids_v1',
  notifiedMap: 'edilbet_notified_matches_v1',
};

export interface PreMatchAlertItem {
  id: string;
  matchId: string;
  home: string;
  away: string;
  leagueLabel: string;
  minutesRemaining: number;
  reason: 'bet_placed' | 'remind_me' | 'preview';
  triggeredAt: number;
}

export function loadPushEnabledFlag(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.enabled);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

export function savePushEnabledFlag(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.enabled, enabled ? '1' : '0');
  } catch {
    // Ignore storage quota errors
  }
}

export function loadRemindMatchIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.remindIds);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export function saveRemindMatchIds(ids: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.remindIds, JSON.stringify(ids.slice(-200)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadNotifiedMatchMap(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.notifiedMap);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const now = Date.now();
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      if (typeof v === 'number' && now - v < 24 * 3600_000) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

export function saveNotifiedMatchMap(map: Record<string, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.notifiedMap, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function getMinutesUntilKickoff(match: ScheduledMatch, nowMs = Date.now()): number | null {
  if (match.isLive || !match.kickoffIso) return null;
  const kickoffMs = new Date(match.kickoffIso).getTime();
  if (!Number.isFinite(kickoffMs)) return null;
  const diffMs = kickoffMs - nowMs;
  if (diffMs <= 0) return null;
  return Math.ceil(diffMs / 60_000);
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function dispatchBrowserMatchNotification(params: {
  title: string;
  body: string;
  tag: string;
}): boolean {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(params.title, {
      body: params.body,
      tag: params.tag,
    });
    return true;
  } catch {
    return false;
  }
}
