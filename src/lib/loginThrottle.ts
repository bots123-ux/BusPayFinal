// Per-email login throttle — each email has its own attempt counter
const MAX = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

interface State {
  attempts: number[];
  lockedUntil: number | null;
}

function key(email: string) {
  return `buspay.loginAttempts.${email.toLowerCase().trim()}`;
}

function read(email: string): State {
  try {
    const raw = localStorage.getItem(key(email));
    if (!raw) return { attempts: [], lockedUntil: null };
    return JSON.parse(raw) as State;
  } catch {
    return { attempts: [], lockedUntil: null };
  }
}

function write(email: string, s: State) {
  localStorage.setItem(key(email), JSON.stringify(s));
}

export function getLockRemainingMs(email = ""): number {
  if (!email) return 0;
  const s = read(email);
  if (!s.lockedUntil) return 0;
  const r = s.lockedUntil - Date.now();
  if (r <= 0) {
    write(email, { attempts: [], lockedUntil: null });
    return 0;
  }
  return r;
}

export function recordFailedAttempt(email: string): { locked: boolean; remainingMs: number } {
  const now = Date.now();
  const s = read(email);
  if (s.lockedUntil && s.lockedUntil > now) {
    return { locked: true, remainingMs: s.lockedUntil - now };
  }
  s.attempts = s.attempts.filter((t) => now - t < WINDOW_MS);
  s.attempts.push(now);
  if (s.attempts.length >= MAX) {
    s.lockedUntil = now + LOCK_MS;
    write(email, s);
    return { locked: true, remainingMs: LOCK_MS };
  }
  write(email, s);
  return { locked: false, remainingMs: 0 };
}

export function clearAttempts(email: string) {
  write(email, { attempts: [], lockedUntil: null });
}

export function attemptsRemaining(email: string): number {
  if (!email) return MAX;
  const now = Date.now();
  const s = read(email);
  const recent = s.attempts.filter((t) => now - t < WINDOW_MS);
  return Math.max(0, MAX - recent.length);
}
