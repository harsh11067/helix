// Original ambient bed for the HELIX walkthrough: A minor pad (Am–F–C–G, 8 s per chord), slow swell,
// soft low pulse; meant to sit ~20 dB under the voice. Writes music-bed.wav of the requested length.
//   node music-bed.mjs <seconds>
import { writeFileSync } from 'node:fs';
const SR = 44100, DUR = Number(process.argv[2] ?? 180), N = Math.ceil(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CH = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 52, 55, 60], [55, 59, 62, 67]];
const ROOT = [45, 41, 36, 43];
const tri = (ph) => 2 * Math.abs(2 * (ph - Math.floor(ph + 0.5))) - 1;
let lpL = 0, lpR = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, k = Math.floor(t / 8) % 4, u = (t % 8) / 8;
  const env = 0.55 + 0.45 * Math.sin(Math.PI * u);                       // slow swell per chord
  let sl = 0, sr = 0;
  for (const m of CH[k]) { const f = mtof(m); sl += tri(t * f * 0.996) + 0.4 * Math.sin(2 * Math.PI * f * 2.001 * t); sr += tri(t * f * 1.004) + 0.4 * Math.sin(2 * Math.PI * f * 1.999 * t); }
  const bass = Math.sin(2 * Math.PI * mtof(ROOT[k]) * t) * 0.9;
  const beat = t % 1.0, pulse = Math.exp(-beat * 6) * Math.sin(2 * Math.PI * 55 * beat) * 0.35;   // soft 60 bpm heartbeat
  lpL += 0.02 * (sl - lpL); lpR += 0.02 * (sr - lpR);
  const fade = Math.min(1, t / 3) * Math.min(1, (DUR - t) / 3);
  L[i] = (lpL * 0.09 * env + bass * 0.05 + pulse * 0.06) * fade;
  R[i] = (lpR * 0.09 * env + bass * 0.05 + pulse * 0.06) * fade;
}
let peak = 0; for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const g = 0.7 / peak, buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { buf.writeInt16LE(Math.round(L[i] * g * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * g * 32767), 46 + i * 4); }
writeFileSync(new URL('./out/music-bed.wav', import.meta.url), buf);
console.log('music-bed.wav', DUR + 's');
