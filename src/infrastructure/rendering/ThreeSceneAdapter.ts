import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { GhostViewModel, ScenePort } from '@/application/ports';
import type { GameConfig } from '@/domain/config/GameConfig';
import type { GhostId, Vector3Like } from '@/shared/types';
import { createLighting } from './Lighting';
import type { Lighting } from './Lighting';
import type { GhostView, GhostViewFactory } from './GhostView';

/** 近年の端末は devicePixelRatio が 3 を超えることがある。描画面積が 9 倍になる */
const MAX_PIXEL_RATIO = 2;

const _forward = new Vector3();
const _up = new Vector3();

export class ThreeSceneAdapter implements ScenePort {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly lighting: Lighting;
  private readonly views = new Map<GhostId, GhostView>();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly config: GameConfig,
    private readonly factory: GhostViewFactory,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      // 背景を透過させ、下の video を見せる
      alpha: true,
      // モバイルでは負荷に見合わない
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

    this.camera = new PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, config.eyeHeight, 0);

    this.lighting = createLighting(this.camera, config);
    this.scene.add(this.lighting.ambient);
    // カメラ自身もシーンに入れないと、子であるライトが機能しない
    this.scene.add(this.camera);

    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(width: number, height: number): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setCameraQuaternion(q: { x: number; y: number; z: number; w: number }): void {
    this.camera.quaternion.set(q.x, q.y, q.z, q.w);
  }

  syncGhosts(views: readonly GhostViewModel[], dtSec: number): void {
    for (const vm of views) {
      let view = this.views.get(vm.id);
      if (view === undefined) {
        view = this.factory();
        this.views.set(vm.id, view);
        this.scene.add(view.object);
      }

      const visible = vm.opacity > 0.01;
      view.object.visible = visible;
      // 視野外の個体はアニメーション更新も行わない（設計書 05.6）
      if (!visible) continue;

      view.object.position.set(vm.position.x, vm.position.y, vm.position.z);
      // 常にプレイヤーの方を向く。y にゴースト自身の高さを渡す点に注意。
      // カメラの高さを渡すと近距離で前傾・後傾して不自然になる
      view.object.lookAt(this.camera.position.x, vm.position.y, this.camera.position.z);
      view.setOpacity(vm.opacity);
      view.playAnimation(vm.animation, dtSec);
    }
  }

  setBeamEnabled(enabled: boolean): void {
    this.lighting.setBeamEnabled(enabled);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  cameraForward(): Vector3Like {
    _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return { x: _forward.x, y: _forward.y, z: _forward.z };
  }

  cameraUp(): Vector3Like {
    _up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
    return { x: _up.x, y: _up.y, z: _up.z };
  }

  fieldOfView(): number {
    return this.camera.fov;
  }

  /** 後続フェーズでの FOV キャリブレーションに備えた口（原典 §17） */
  setFieldOfView(deg: number): void {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  clearGhosts(): void {
    for (const view of this.views.values()) {
      this.scene.remove(view.object);
      view.dispose();
    }
    this.views.clear();
  }

  dispose(): void {
    this.clearGhosts();
    this.lighting.dispose();
    this.renderer.dispose();
  }

  get configRef(): GameConfig {
    return this.config;
  }
}
