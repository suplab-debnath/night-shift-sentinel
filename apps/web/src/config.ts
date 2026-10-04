// Branding (config/branding.json) and URL parameters. No network access.
import type { Decision, GateDecision } from '@night-shift/engine';
import { fillPlaceholders, isUnfilled } from '@night-shift/engine';
import branding from '../../../config/branding.json';

export interface Branding {
  orgName: string;
  clientName: string;
  presenterName: string;
  humanSeatLabel: string;
  demoDate: string;
  defaultSpeed: number;
  showNotesStrip: boolean;
  /** Pacing factor (DECISIONS D-072): 1 is the authored timing; above 1 agents pause to think and lines get reading time. */
  pace: number;
  /** The approved AI platform shown in the inspector (D-079). */
  aiPlatform?: { model: string; region: string };
}

export const brand: Branding = branding;

/** Approved model and region for the inspector; set in config/branding.json. */
export const aiPlatform = {
  model: brand.aiPlatform?.model ?? 'Claude on Amazon Bedrock',
  region: brand.aiPlatform?.region ?? 'Region set by your deployment',
};

export const placeholders = {
  ORG_NAME: brand.orgName,
  CLIENT_NAME: brand.clientName,
  PRESENTER_NAME: brand.presenterName,
};

export function fill(text: string): string {
  return fillPlaceholders(text, placeholders);
}

/** Name recorded on gate decisions (SCENARIO §4 Act 5). */
export const approverName = isUnfilled(brand.presenterName) ? 'On-call engineer' : brand.presenterName;

export interface UrlOptions {
  speed: number | null;
  pauseAt: string | null;
  presenter: boolean;
  reducedMotion: boolean | null;
  autoplay: boolean;
  /** Decide gates automatically when reached, e.g. "g1:approved,g2:rejected". */
  autoDecide: Record<string, GateDecision>;
  /** Initial decision path, same syntax as autoDecide. */
  decisions: Decision[];
  seek: number | null;
  mode: string | null;
  notes: boolean | null;
  passcode: string | null;
  mockFail: string | null;
  /** Take to play (DECISIONS D-068); absent means a fresh take per page load. */
  take: number | null;
  /** Pacing override (1–3); absent means config/branding.json. */
  pace: number | null;
}

function bool(v: string | null): boolean | null {
  if (v === null) return null;
  return v === '' || v === '1' || v === 'true' || v === 'yes';
}

function num(v: string | null): number | null {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDecisionMap(v: string | null): Record<string, GateDecision> {
  const out: Record<string, GateDecision> = {};
  if (!v) return out;
  for (const part of v.split(',')) {
    const [gate, decision] = part.split(':').map((s) => s.trim());
    if (gate && (decision === 'approved' || decision === 'rejected')) out[gate] = decision;
  }
  return out;
}

function takeParam(v: string | null): number | null {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 0 ? n : null;
}

/** A fresh take for this page load: 1–9999, so two runs in a row differ (take 0 is the canonical script). */
export function freshTake(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 9999);
}

export function parseUrlOptions(search: string): UrlOptions {
  const p = new URLSearchParams(search);
  const decided = parseDecisionMap(p.get('decisions'));
  return {
    speed: num(p.get('speed')),
    pauseAt: p.get('pauseAt'),
    presenter: bool(p.get('presenter')) ?? false,
    reducedMotion: bool(p.get('reducedMotion')),
    autoplay: bool(p.get('autoplay')) ?? false,
    autoDecide: parseDecisionMap(p.get('autoDecide')),
    decisions: Object.entries(decided).map(([gateId, decision]) => ({ type: 'gate', gateId, decision, by: approverName })),
    seek: num(p.get('seek')),
    mode: p.get('mode'),
    notes: bool(p.get('notes')),
    passcode: p.get('passcode'),
    mockFail: p.get('mockFail'),
    take: takeParam(p.get('take')),
    pace: num(p.get('pace')),
  };
}
