import type { StageSnapshot } from '../src/sources/types';

declare global {
  interface Window {
    __nightShift?: { source: { getSnapshot(): StageSnapshot } };
  }
}
