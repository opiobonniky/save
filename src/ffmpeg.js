import { accessSync, constants } from 'fs';
import ffmpegStatic from 'ffmpeg-static';
import { canRun, getBundledExecutable } from './executables.js';

export function getManagedFfmpegPath() {
  if (process.pkg || !ffmpegStatic) return null;

  try {
    accessSync(ffmpegStatic, constants.X_OK);
    return ffmpegStatic;
  } catch {
    return null;
  }
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
