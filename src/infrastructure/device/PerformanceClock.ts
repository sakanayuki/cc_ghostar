import type { ClockPort } from '@/application/ports';

export class PerformanceClock implements ClockPort {
  now(): number {
    return performance.now();
  }
}
