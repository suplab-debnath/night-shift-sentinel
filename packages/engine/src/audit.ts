// Audit evidence (D-079): every row is chained to the one before it, so a changed or removed row
// changes every hash after it. Pure and deterministic: the same run gives the same chain.
// FNV-1a is a checksum, not a signature; in production the chain would be anchored in an
// append-only store. Here it makes the trail verifiable on screen and in the export.
import type { AuditRow } from './reducer';

/** 64-bit FNV-1a over a string, as 16 hex digits (two 32-bit lanes; no BigInt needed). */
export function fnv1a64(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (h1 >>> 7), 0x01000193) >>> 0;
  }
  return h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0');
}

export const AUDIT_GENESIS = '0000000000000000';

/** The fields that make a row's content; the hash covers exactly these, in this order. */
export function auditContent(row: AuditRow): string {
  return [
    row.id,
    row.clock ?? '',
    row.act,
    row.overlayName ?? '',
    row.category,
    row.severity,
    row.agent ?? '',
    row.text,
    row.result ? `${row.result.status}:${row.result.summary}` : '',
  ].join('␟');
}

export interface ChainedAuditRow {
  row: AuditRow;
  /** Hash of the previous row (genesis for the first). */
  prev: string;
  hash: string;
}

export function auditChain(rows: readonly AuditRow[]): ChainedAuditRow[] {
  let prev = AUDIT_GENESIS;
  return rows.map((row) => {
    const hash = fnv1a64(`${prev}␞${auditContent(row)}`);
    const link = { row, prev, hash };
    prev = hash;
    return link;
  });
}

/** True when every link's prev matches the hash before it and every hash matches its content. */
export function verifyAuditChain(chain: readonly ChainedAuditRow[]): boolean {
  let prev = AUDIT_GENESIS;
  for (const link of chain) {
    if (link.prev !== prev) return false;
    if (fnv1a64(`${prev}␞${auditContent(link.row)}`) !== link.hash) return false;
    prev = link.hash;
  }
  return true;
}
