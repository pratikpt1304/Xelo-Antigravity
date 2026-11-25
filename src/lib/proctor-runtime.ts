import type { FaceDetector } from '@mediapipe/tasks-vision';

export type ProctorViolationKind =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'no_face'
  | 'multiple_faces'
  | 'copy_paste'
  | 'devtools'
  | 'disconnect'
  | 'camera_off';

let activeCameraStream: MediaStream | null = null;
let activeScreenStream: MediaStream | null = null;

export function getActiveStreams(): {
  camera: MediaStream | null;
  screen: MediaStream | null;
} {
  return { camera: activeCameraStream, screen: activeScreenStream };
}

export async function requestCameraStream(): Promise<MediaStream> {
  if (activeCameraStream && activeCameraStream.active) return activeCameraStream;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  activeCameraStream = stream;
  return stream;
}

export async function requestScreenShare(): Promise<MediaStream> {
  if (activeScreenStream && activeScreenStream.active) return activeScreenStream;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'monitor' } as MediaTrackConstraints,
    audio: false,
  });
  const track = stream.getVideoTracks()[0];
  const settings = track?.getSettings() as (MediaTrackSettings & { displaySurface?: string }) | undefined;
  if (settings?.displaySurface && settings.displaySurface !== 'monitor') {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('entire_screen_required');
  }
  activeScreenStream = stream;
  return stream;
}

export function stopAllStreams(): void {
  activeCameraStream?.getTracks().forEach((t) => t.stop());
  activeScreenStream?.getTracks().forEach((t) => t.stop());
  activeCameraStream = null;
  activeScreenStream = null;
}

export async function loadMediaPipeWasm(): Promise<boolean> {
  const { FilesetResolver } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe');
  return Boolean(fileset);
}

export async function initFaceDetector(): Promise<FaceDetector | null> {
  try {
    const { FaceDetector: MPFaceDetector, FilesetResolver } = await import(
      '@mediapipe/tasks-vision'
    );
    const fileset = await FilesetResolver.forVisionTasks('/vendor/mediapipe');
    return await MPFaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: '/models/blaze_face_short_range.tflite',
      },
      runningMode: 'VIDEO',
      minDetectionConfidence: 0.5,
    });
  } catch {
    return null;
  }
}

export async function captureSnapshot(video: HTMLVideoElement): Promise<Blob | null> {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7);
  });
}

export function attachExamLockdown(handlers: {
  onViolation: (kind: ProctorViolationKind) => void;
}): () => void {
  const onVisibility = () => {
    if (document.hidden) handlers.onViolation('tab_switch');
  };
  const onFullscreen = () => {
    if (!document.fullscreenElement) handlers.onViolation('fullscreen_exit');
  };
  const onClipboard = (e: ClipboardEvent) => {
    e.preventDefault();
    handlers.onViolation('copy_paste');
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const devKey =
      e.key === 'F12' ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key));
    if (devKey) {
      e.preventDefault();
      handlers.onViolation('devtools');
    }
  };
  const onOffline = () => {
    handlers.onViolation('disconnect');
  };

  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('fullscreenchange', onFullscreen);
  document.addEventListener('copy', onClipboard);
  document.addEventListener('paste', onClipboard);
  document.addEventListener('cut', onClipboard);
  document.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('offline', onOffline);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('fullscreenchange', onFullscreen);
    document.removeEventListener('copy', onClipboard);
    document.removeEventListener('paste', onClipboard);
    document.removeEventListener('cut', onClipboard);
    document.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('offline', onOffline);
  };
}
