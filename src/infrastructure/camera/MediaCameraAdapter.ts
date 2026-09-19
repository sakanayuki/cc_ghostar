import { CameraError } from '@/application/ports';
import type { CameraPort } from '@/application/ports';

/**
 * facingMode に exact ではなく ideal を使う。exact は背面カメラを持たない
 * 端末で OverconstrainedError となり起動不能になるため（設計書 05.1）。
 *
 * 解像度を抑えるのは、カメラ映像は全画面表示されるだけで解像度を上げても
 * 体験が向上しない一方、デコード負荷と発熱は確実に増えるため。
 */
const CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
  audio: false,
};

function classify(error: unknown): CameraError {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('カメラへのアクセスが許可されませんでした。', 'DENIED');
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new CameraError('利用できるカメラが見つかりません。', 'MISSING');
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError('カメラを使用できません。', 'BUSY');
    default:
      return new CameraError('カメラを起動できませんでした。', 'UNKNOWN');
  }
}

export class MediaCameraAdapter implements CameraPort {
  private stream: MediaStream | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  async start(): Promise<HTMLVideoElement> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play().catch(() => {
        // 一部端末では play() が中断されるが、srcObject が付いていれば表示される
      });
      return this.video;
    } catch (error) {
      throw classify(error);
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => {
      t.stop();
    });
    this.stream = null;
    this.video.srcObject = null;
  }

  isActive(): boolean {
    const track = this.getTrack();
    return track !== null && track.readyState === 'live';
  }

  getTrack(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  describe(): string {
    const track = this.getTrack();
    if (track === null) return 'inactive';
    const s = track.getSettings();
    return `active ${s.width ?? '?'}x${s.height ?? '?'}`;
  }
}
