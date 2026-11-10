import { defineConfig } from '@argo-video/cli';

// HELIX demo video (VIDEO_PIPELINE.md). Recorded from the LIVE site; every number on screen is live.
export default defineConfig({
  baseURL: 'https://helix-app-fovn.onrender.com',
  demosDir: 'demos',
  outputDir: 'videos',
  tts: { defaultVoice: 'am_michael', defaultSpeed: 1.0 },
  video: {
    width: 1920, height: 1080, fps: 30,
    browser: 'chromium',
    captureMode: 'jpeg-stitch',
    deviceScaleFactor: 1,
    cursorHighlight: true,
  },
  export: {
    preset: 'veryfast', crf: 18,
    transition: { type: 'fade-through-black', durationMs: 600 },
    audio: { loudnorm: true },
  },
  overlays: { autoBackground: true },
});
