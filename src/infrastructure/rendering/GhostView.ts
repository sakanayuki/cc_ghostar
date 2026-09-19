import type { Object3D } from 'three';
import type { GhostAnimation } from '@/domain/ghost/Ghost';

export interface GhostView {
  readonly object: Object3D;
  setOpacity(value: number): void;
  playAnimation(name: GhostAnimation, dtSec: number): void;
  dispose(): void;
}

export type GhostViewFactory = () => GhostView;
