// Renders frames + narration into out/soso-desk-demo.mp4, then checks it.   node video/render.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(`${dir}/script.json`, "utf8")).lines;
const F = JSON.parse(readFileSync(`${dir}/facts.json`, "utf8"));
mkdirSync(`${dir}/out/seg`, { recursive: true });
const ff = (args) => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const lufs = (f) => {
  const r = spawnSync("ffmpeg", ["-v", "info", "-nostats", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  return r.stderr;
};
const PAD = 0.7;

// 1. padded narration, concatenated, to measure loudness
const padded = S.map((l) => {
  const out = `${dir}/out/seg/${l.id}-pad.wav`;
  ff(["-i", `${dir}/audio/${l.id}.wav`, "-af", `apad=pad_dur=${PAD}`, "-ar", "48000", "-ac", "1", out]);
  return out;
});
writeFileSync(`${dir}/out/seg/list-a.txt`, padded.map((p) => `file '${p}'`).join("\n"));
ff(["-f", "concat", "-safe", "0", "-i", `${dir}/out/seg/list-a.txt`, "-c", "copy", `${dir}/out/narration.wav`]);
const m = lufs(`${dir}/out/narration.wav`).match(/I:\s+(-?[\d.]+) LUFS/g);
const measured = Number(m[m.length - 1].match(/-?[\d.]+/)[0]);
let gain = -16 - measured;
console.log("narration LUFS", measured, "gain dB", gain.toFixed(2));

// 2. segments: still frame + narration with compressor, gain, limiter
const filter = (g) => `acompressor=threshold=-24dB:ratio=2:attack=20:release=250,volume=${g.toFixed(2)}dB,alimiter=limit=0.89:level=false`;
function build(g) {
  const segs = S.map((l, i) => {
    const out = `${dir}/out/seg/${l.id}.mp4`;
    ff(["-loop", "1", "-framerate", "30", "-i", `${dir}/frames/${l.id}.png`, "-i", padded[i], "-af", filter(g),
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
      "-shortest", "-movflags", "+faststart", out]);
    return out;
  });
  writeFileSync(`${dir}/out/seg/list-v.txt`, segs.map((p) => `file '${p}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", `${dir}/out/seg/list-v.txt`, "-c", "copy", "-movflags", "+faststart", `${dir}/out/soso-desk-demo.mp4`]);
}
for (let k = 0; k < 3; k++) {
  build(gain);
  const r = lufs(`${dir}/out/soso-desk-demo.mp4`);
  const mm = r.match(/I:\s+(-?[\d.]+) LUFS/g);
  const got = Number(mm[mm.length - 1].match(/-?[\d.]+/)[0]);
  const tp = Number((r.match(/Peak:\s+(-?[\d.]+) dBFS/g) ?? []).pop()?.match(/-?[\d.]+/)?.[0]);
  console.log(`pass ${k}: output LUFS ${got}, true peak ${tp}`);
  if (Math.abs(got + 16) <= 0.7) break;
  gain += -16 - got;
}
const dur = probe(`${dir}/out/soso-desk-demo.mp4`);
console.log("duration s", dur.toFixed(1));
writeFileSync(`${dir}/out/render-log.json`, JSON.stringify({ duration: dur, gain, facts: F }, null, 1));
if (dur > 120) throw new Error("over 2 minutes");
