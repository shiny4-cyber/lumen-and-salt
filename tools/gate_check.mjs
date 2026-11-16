// A local stand-in for the sealed gate rows, using the kit's own reference primitives from
// vendor/makefun-game.ts: the game tree's limits, every reference the page reaches, the
// screenshots' names and sizes, the dossier's bytes, and that every module parses as an ES
// module. Dimensions of the JPEGs are checked by tools/verify_shots.py (Pillow).
//
// Run: node tools/gate_check.mjs            (checks out/, i.e. run main.ts first)
//      node tools/gate_check.mjs --worktree (checks game/ and screenshots/ in the repo)

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFacts, isRelativeRef, readGameTree, resolveGamePath, sourceImports } from '../vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');
const worktree = process.argv.includes('--worktree');
const outDir = join(root, 'out');
const gameDir = worktree ? join(root, 'game') : join(outDir, 'game');
const shotsDir = worktree ? join(root, 'screenshots') : join(outDir, 'screenshots');
const dossierPath = join(outDir, 'dossier.json');

const results = [];
function check(name, ok, detail = '') {
  results.push({ ok, name, detail: ok ? '' : detail });
}

// --- game_files ---------------------------------------------------------------------------
const tree = readGameTree(gameDir, { game_max_files: 993, game_max_bytes: 50331648, game_path_max_bytes: 1000 });
check('game/ entry count within 993', tree.count <= 993, `${tree.count}`);
check('game/ bytes within 48 MiB', tree.totalBytes <= 50331648, `${tree.totalBytes}`);
check('every game/ path within 1000 bytes', tree.files.every((file) => Buffer.byteLength(file.path) <= 1000), 'a path is too long');
const index = statSync(join(gameDir, 'index.html'));
check('game/index.html is a file of at most 1 MiB', index.isFile() && index.size <= 1048576, `${index.size}`);

// --- references: everything index.html reaches, and everything those modules import --------
const failures = [];
const html = readFileSync(join(gameDir, 'index.html'), 'utf8');
const facts = htmlFacts(html);
const references = [];
for (const script of facts.scripts ?? []) if (script.src) references.push({ ref: script.src, from: 'index.html', kind: 'script' });
for (const link of facts.links ?? []) if (link.href) references.push({ ref: link.href, from: 'index.html', kind: 'link' });
for (const tag of ['images', 'sources', 'videos', 'audios', 'iframes']) {
  for (const entry of facts[tag] ?? []) if (entry.src) references.push({ ref: entry.src, from: 'index.html', kind: tag });
}

function resolveRef(ref, from) {
  if (ref.startsWith('data:')) return { ok: true, data: true };
  if (!isRelativeRef(ref)) {
    if (/^(?:[a-z]+:|\/\/)/i.test(ref)) return { ok: false, why: `absolute or protocol-relative URL ${ref}` };
    return { ok: false, why: `bare specifier ${ref}` };
  }
  const path = resolveGamePath(ref, from);
  if (!path) return { ok: false, why: `${ref} climbs out of game/` };
  const file = join(gameDir, path);
  if (!existsSync(file)) return { ok: false, why: `${ref} names no file inside game/` };
  return { ok: true, path, file };
}

const queue = [];
for (const entry of references) {
  const resolved = resolveRef(entry.ref, entry.from);
  if (!resolved.ok) failures.push(`${entry.kind} ${entry.ref}: ${resolved.why}`);
  else if (!resolved.data && /\.(?:m?js)$/.test(resolved.path)) queue.push(resolved.path);
}
const seen = new Set();
while (queue.length > 0) {
  const from = queue.pop();
  if (seen.has(from)) continue;
  seen.add(from);
  const source = readFileSync(join(gameDir, from), 'utf8');
  for (const specifier of sourceImports(source)) {
    const resolved = resolveRef(specifier, from);
    if (!resolved.ok) failures.push(`import '${specifier}' in ${from}: ${resolved.why}`);
    else if (!resolved.data && /\.(?:m?js)$/.test(resolved.path)) queue.push(resolved.path);
  }
}
check('every reference is a data: URI or a file inside game/', failures.length === 0, failures.slice(0, 5).join('; '));

// --- js_parses: every reachable module, plus every .js under game/, parses as an ES module --
const modules = new Set([...seen]);
for (const file of tree.files) if (/\.m?js$/.test(file.path)) modules.add(file.path);
let parseFailure = '';
for (const path of modules) {
  try {
    execFileSync(process.execPath, ['--check', join(gameDir, path)], { stdio: 'pipe' });
  } catch (error) {
    parseFailure = `${path}: ${String(error.stderr ?? error).split('\n')[0]}`;
    break;
  }
}
check('every module parses as an ES module', parseFailure === '', parseFailure);

// --- screenshots --------------------------------------------------------------------------
const shots = readdirSync(shotsDir)
  .filter((name) => !name.startsWith('.') && /\.(?:jpg|jpeg|png)$/i.test(name))
  .sort();
check('3 to 4 screenshots', shots.length >= 3 && shots.length <= 4, `${shots.length}`);
let shotProblem = '';
for (const name of shots) {
  const stats = statSync(join(shotsDir, name));
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name.startsWith('-')) shotProblem ||= `bad name ${name}`;
  if (stats.size > 262144) shotProblem ||= `${name} is ${stats.size} bytes`;
}
check('each screenshot at most 256 KiB with a legal name', shotProblem === '', shotProblem);

// --- dossier ------------------------------------------------------------------------------
if (worktree) {
  check('dossier present (checked only on a built output)', true, '');
} else {
  const dossier = readFileSync(dossierPath);
  check('dossier is at most 1.5 MiB', dossier.byteLength <= 1572864, `${dossier.byteLength}`);
  const parsed = JSON.parse(dossier.toString('utf8'));
  const text = Buffer.byteLength(parsed.text ?? '');
  check('dossier text within 163,840 bytes', text <= 163840, `${text}`);
  check('dossier embeds the four screenshots', (parsed.images ?? []).length === shots.length, `${(parsed.images ?? []).length} images`);
}

const width = Math.max(...results.map((row) => row.name.length));
console.log('');
console.log(`${'RESULT'}  ${'CHECK'.padEnd(width)}  DETAIL`);
console.log('-'.repeat(width + 30));
for (const row of results) console.log(`${row.ok ? 'PASS' : 'FAIL'}    ${row.name.padEnd(width)}  ${row.detail}`);
const failed = results.filter((row) => !row.ok);
console.log('-'.repeat(width + 30));
console.log(`${results.length - failed.length}/${results.length} gate checks passed${failed.length ? `, ${failed.length} failed` : ''}`);
console.log(`game/: ${tree.files.length} files, ${tree.count} entries, ${(tree.totalBytes / 1024).toFixed(0)} KiB; modules parsed: ${modules.size}`);
process.exitCode = failed.length ? 1 : 0;
