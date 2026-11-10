// Assemble the submission cut: parts A → B → C with 0.5 s crossfades, the narration over a quiet original
// music bed, captions (sentence chunks from Argo's .srt, TTS spellings restored) burned in, loudness -14 LUFS.
//   node assemble.mjs            → out/helix-demo.mp4 (+ out/helix-demo.srt, out/contact-sheet.jpg)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const FF = new URL('./bin/ffmpeg', import.meta.url).pathname, FP = new URL('./bin/ffprobe', import.meta.url).pathname;
const V = (p) => new URL(`./videos/${p}`, import.meta.url).pathname, O = (p) => new URL(`./out/${p}`, import.meta.url).pathname;
mkdirSync(O(''), { recursive: true });
const parts = ['helix-a', 'helix-b', 'helix-c'];
const XF = 0.5;
const dur = (f) => Number(execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const D = parts.map((p) => dur(V(`${p}.mp4`)));
const offsets = [0, D[0] - XF, D[0] + D[1] - 2 * XF];
const total = D[0] + D[1] + D[2] - 2 * XF;
console.log('parts', D.map((d) => d.toFixed(1)).join(' + '), '→ total', total.toFixed(1), 's');

// ---- captions: sentence-sized chunks, timed in proportion to their length inside each Argo cue
const fix = (s) => s.replace(/\bA I\b/g, 'AI').replace(/\bg R P C\b/g, 'gRPC').replace(/\bH T T P\b/g, 'HTTP');
const ts = (s) => { const [h, m, r] = s.split(':'); const [sec, ms] = r.split(','); return +h * 3600 + +m * 60 + +sec + +ms / 1000; };
const fmt = (t) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), ms = Math.round((t % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
const cues = [];
parts.forEach((p, i) => {
  const srt = readFileSync(V(`${p}.srt`), 'utf8').trim().split(/\n\s*\n/);
  for (const block of srt) {
    const lines = block.split('\n'); const [a, b] = lines[1].split(' --> ').map(ts); const text = fix(lines.slice(2).join(' '));
    const chunks = text.match(/[^.!?:]+[.!?:]?/g).map((c) => c.trim()).filter(Boolean).flatMap((c) => {
      if (c.length <= 70) return [c];
      const words = c.split(' '), out = []; let cur = '';
      for (const w of words) { if ((cur + ' ' + w).trim().length > 62 && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
      if (cur) out.push(cur); return out;
    });
    const totalLen = chunks.reduce((n, c) => n + c.length, 0); let t = a + offsets[i];
    for (const c of chunks) { const d = (b - a) * (c.length / totalLen); cues.push([t, t + d - 0.04, c]); t += d; }
  }
});
writeFileSync(O('helix-demo.srt'), cues.map(([a, b, c], k) => `${k + 1}\n${fmt(a)} --> ${fmt(b)}\n${c}\n`).join('\n'));

// ---- music bed
execFileSync('node', [new URL('./music-bed.mjs', import.meta.url).pathname, String(Math.ceil(total + 1))], { stdio: 'inherit' });

// ---- the cut
const style = "FontName=Ubuntu,FontSize=15,PrimaryColour=&H00F2EEE6,OutlineColour=&H00100E0B,BackColour=&H99100E0B,BorderStyle=4,Outline=0,Shadow=0,MarginV=34,Alignment=2";
const fc = [
  `[0:v][1:v]xfade=transition=fade:duration=${XF}:offset=${offsets[1].toFixed(3)}[v01]`,
  `[v01][2:v]xfade=transition=fade:duration=${XF}:offset=${offsets[2].toFixed(3)}[vx]`,
  `[vx]subtitles=${O('helix-demo.srt')}:force_style='${style}'[v]`,
  `[0:a][1:a]acrossfade=d=${XF}[a01]`, `[a01][2:a]acrossfade=d=${XF}[ax]`,
  `[3:a]volume=0.16[m]`, `[ax][m]amix=inputs=2:duration=first:normalize=0[am]`,
  `[am]loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
].join(';');
execFileSync(FF, ['-v', 'error', '-y', ...parts.flatMap((p) => ['-i', V(`${p}.mp4`)]), '-i', O('music-bed.wav'),
  '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', O('helix-demo.mp4')], { stdio: 'inherit' });

// ---- contact sheet (one frame every ~12 s)
const n = 12, step = total / n;
const frames = Array.from({ length: n }, (_, k) => (k * step + step / 2).toFixed(2));
frames.forEach((t, k) => execFileSync(FF, ['-v', 'error', '-y', '-ss', t, '-i', O('helix-demo.mp4'), '-frames:v', '1', '-vf', 'scale=480:-1', O(`cs_${k}.jpg`)]));
execFileSync(FF, ['-v', 'error', '-y', ...frames.flatMap((_, k) => ['-i', O(`cs_${k}.jpg`)]), '-filter_complex',
  `[0][1][2][3]hstack=4[r0];[4][5][6][7]hstack=4[r1];[8][9][10][11]hstack=4[r2];[r0][r1][r2]vstack=3`, O('contact-sheet.jpg')]);
console.log('wrote out/helix-demo.mp4', total.toFixed(1) + 's', '· captions', cues.length);
