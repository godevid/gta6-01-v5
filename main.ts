// Palm Key Heat — the gta6-01 hand-in program (Node 22, stdlib only).
//
// The playable game is plain static files in game/ (game/index.html plus
// its ES modules, no library, no network request). This program stages it
// for the judge: it copies game/ and screenshots/ from this directory into
// the output directory and writes /output/dossier.json, the summary the
// judge reads, using the make.fun library vendored under vendor/.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The grader sets /output itself; outside the grader the env var above
// stands in for it. Serve the game with `node serve.ts` and open
// http://localhost:8080/game/ to play it.

import { cpSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countGameFiles(dir) {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) n += countGameFiles(full);
    else n += 1;
  }
  return n;
}

function stage() {
  mkdirSync(outDir, { recursive: true });

  const gameSrc = join(repoDir, 'game');
  const gameDst = join(outDir, 'game');
  cpSync(gameSrc, gameDst, { recursive: true });
  console.log(`staged ${countGameFiles(gameSrc)} game files -> ${gameDst}`);

  const shotsSrc = join(repoDir, 'screenshots');
  const shotsDst = join(outDir, 'screenshots');
  mkdirSync(shotsDst, { recursive: true });
  if (existsSync(shotsSrc)) {
    cpSync(shotsSrc, shotsDst, { recursive: true });
    console.log(`staged screenshots -> ${shotsDst}`);
  }

  // The scorer's own limits (reference/gate.json): text_max_bytes shapes
  // the dossier text; the rest refuse entries the scorer would refuse
  // (more than 4 screenshots or one over 256 KiB; more than 993 files in
  // game/ or 48 MiB of game files in all, or a game path over 1000 bytes).
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);
}

stage();
