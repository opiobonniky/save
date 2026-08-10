import { canRun, getBundledExecutable, isExecutable } from './executables.js';
import { getManagedFfmpegPath as getManagedPath } from './managedFfmpeg.js';

export function getManagedFfmpegPath() {
  const managed = getManagedPath();
  return isExecutable(managed) ? managed : null;
}

export function getFfmpegOptions() {
  const ffmpegLocation = getBundledExecutable('ffmpeg') || getManagedFfmpegPath();
  return ffmpegLocation ? { ffmpegLocation } : {};
}

export function getFfmpegExecutablePath() {
  return (
    getBundledExecutable('ffmpeg') ||
    getManagedFfmpegPath() ||
    (canRun('ffmpeg', ['-version']) ? 'ffmpeg' : null)
  );
}
