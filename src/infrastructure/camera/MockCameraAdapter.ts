import type { CameraPort } from '@/application/ports';

/** カメラの代わりに暗い背景を敷く（設計書 05.8） */
export class MockCameraAdapter implements CameraPort {
  private active = false;

  constructor(private readonly video: HTMLVideoElement) {}

  start(): Promise<HTMLVideoElement> {
    document.body.classList.add('mock-camera');
    this.active = true;
    return Promise.resolve(this.video);
  }

  stop(): void {
    document.body.classList.remove('mock-camera');
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  getTrack(): MediaStreamTrack | null {
    return null;
  }

  describe(): string {
    return this.active ? 'mock' : 'inactive';
  }
}
