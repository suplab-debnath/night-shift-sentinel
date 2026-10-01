import type { StageSnapshot } from '../src/sources/types';

declare global {
  interface Window {
    __nightShift?: {
      source: {
        getSnapshot(): StageSnapshot;
        seek(t: number): void;
        setSpeed(speed: number): void;
        triggerChaos(): boolean;
        play(): void;
        pause(): void;
      };
    };
  }
}
