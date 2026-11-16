// LUMEN & SALT — the entrypoint (Node 22, standard library only).
//
// The game is game/: plain static files, no build step, no network request at runtime.
// This program hands it in: it copies game/ and screenshots/ from this repository to the
// output directory (the grader's /output, or MAKEFUN_OUTPUT_DIR elsewhere) and writes
// dossier.json with the vendored make.fun library, using the same caps the scorer checks.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//   node serve.ts        # play it at http://localhost:8080

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// reference/gate.json's limits: only text_max_bytes shapes the dossier's bytes; the rest
// refuse an entry the scorer would refuse, here rather than at submission.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`wrote ${join(out, 'dossier.json')}`);
