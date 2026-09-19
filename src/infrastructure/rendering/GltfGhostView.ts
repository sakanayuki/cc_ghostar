import { AnimationMixer, Mesh, Material, Object3D } from 'three';
import type { AnimationClip } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GhostAnimation } from '@/domain/ghost/Ghost';
import type { GhostView, GhostViewFactory } from './GhostView';
import { ProceduralGhostView } from './ProceduralGhostView';

export interface LoadedGhostModel {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
}

/** アニメーション名のゆれを吸収する（設計書 05.6） */
const NAME_CANDIDATES: Record<GhostAnimation, readonly string[]> = {
  IDLE: ['Idle', 'idle', 'IDLE', 'Armature|Idle'],
  WALK: ['Walk', 'walk', 'WALK', 'Armature|Walk', 'Run'],
  ATTACK: ['Attack', 'attack', 'ATTACK', 'Armature|Attack'],
  APPEAR: ['Appear', 'appear', 'Spawn'],
  DISAPPEAR: ['Disappear', 'disappear', 'Death', 'Die'],
};

export class GltfGhostView implements GhostView {
  readonly object: Object3D;

  private readonly mixer: AnimationMixer;
  private readonly clips: readonly AnimationClip[];
  private readonly materials: Material[] = [];
  private currentAnimation: GhostAnimation | null = null;

  constructor(model: LoadedGhostModel) {
    this.object = cloneSkinned(model.scene);
    this.clips = model.clips;
    this.mixer = new AnimationMixer(this.object);

    this.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials: Material[] = Array.isArray(child.material)
        ? (child.material as Material[])
        : [child.material as Material];

      for (const original of materials) {
        const cloned = original.clone();
        cloned.transparent = true;
        cloned.opacity = 0;
        cloned.depthWrite = false;
        this.materials.push(cloned);
      }
      child.material = Array.isArray(child.material)
        ? this.materials.slice(-materials.length)
        : (this.materials[this.materials.length - 1] as Material);
    });

    this.object.visible = false;
  }

  setOpacity(value: number): void {
    for (const material of this.materials) {
      material.opacity = value;
    }
  }

  playAnimation(name: GhostAnimation, dtSec: number): void {
    if (name !== this.currentAnimation) {
      const clip = this.findClip(name);
      if (clip !== null) {
        this.mixer.stopAllAction();
        this.mixer.clipAction(clip).reset().play();
      }
      this.currentAnimation = name;
    }
    this.mixer.update(dtSec);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const material of this.materials) material.dispose();
  }

  private findClip(name: GhostAnimation): AnimationClip | null {
    for (const candidate of NAME_CANDIDATES[name]) {
      const found = this.clips.find((c) => c.name === candidate);
      if (found) return found;
    }
    // 見つからない場合は Idle にフォールバックする
    if (name !== 'IDLE') {
      console.warn(`[ghost] アニメーション ${name} が見つかりません。Idle を使います`);
      return this.findClip('IDLE');
    }
    return this.clips[0] ?? null;
  }
}

/**
 * GLB があれば GLB 実装を、なければプレースホルダ実装を返す。
 * 読み込みは起動時に 1 回だけ行い、各個体はクローンして使い回す。
 */
export async function createGhostViewFactory(): Promise<{
  factory: GhostViewFactory;
  usingGlb: boolean;
}> {
  try {
    // BASE_URL を必ず使う。Pages のプロジェクトページでは
    // 絶対パスだと 404 になる（設計書 07.1）
    const url = `${import.meta.env.BASE_URL}models/ghost.glb`;
    const gltf = await new GLTFLoader().loadAsync(url);
    const model: LoadedGhostModel = { scene: gltf.scene, clips: gltf.animations };
    return { factory: () => new GltfGhostView(model), usingGlb: true };
  } catch {
    console.info('[ghost] GLB が見つからないためプレースホルダを使用します');
    return { factory: () => new ProceduralGhostView(), usingGlb: false };
  }
}
