/**
 * 妨害音の mp3 を base64 の TypeScript モジュールへ変換する。
 *
 * mp3 をリポジトリへそのまま置かない方針のため、音源はこのスクリプトで
 * src/infrastructure/audio/sounds/data.ts を再生成して取り込む。
 *
 *   node scripts/encode-sounds.mjs <mp3 を置いたディレクトリ>
 *
 * ディレクトリには SOUNDS の file 名と一致するファイルを置くこと。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** key と表示名の対応。ボタン名を直すならここだけ変えればよい */
const SOUNDS = [
  { key: 'knock', file: 'knock.mp3', label: 'ノック' },
  { key: 'drop', file: 'drop.mp3', label: '落とす' },
  { key: 'footsteps', file: 'footsteps.mp3', label: '足音' },
  { key: 'roll', file: 'roll.mp3', label: '転がす' },
  { key: 'glass', file: 'glass.mp3', label: 'ガラス' },
];

const srcDir = process.argv[2];
if (!srcDir) {
  console.error('使い方: node scripts/encode-sounds.mjs <mp3 を置いたディレクトリ>');
  process.exit(1);
}

const lines = [
  '/**',
  ' * 妨害音の音源データ。',
  ' *',
  ' * mp3 をそのまま配置せず base64 で埋め込んでいる（要件による）。',
  ' * このモジュールは動的 import で読み込まれ、音を鳴らすホスト側でのみ',
  ' * 取得される。妨害側は音源データを必要としない。',
  ' *',
  ' * 差し替えは scripts/encode-sounds.mjs で再生成する。',
  ' */',
  '',
  '/* eslint-disable */',
  '// prettier-ignore-start',
  '',
];

for (const { key, file, label } of SOUNDS) {
  const raw = readFileSync(join(srcDir, file));
  const b64 = raw.toString('base64');
  lines.push(`/** ${label} — ${(raw.length / 1024).toFixed(1)}KB */`);
  // 1 本の文字列リテラルにする。+ で連結すると AST が深くなり、
  // 構文解析がスタックを使い果たす
  lines.push('// prettier-ignore');
  lines.push(`export const ${key} = '${b64}';`);
  lines.push('');
}

lines.push('// prettier-ignore-end');

const out = join(here, '..', 'src', 'infrastructure', 'audio', 'sounds', 'data.ts');
writeFileSync(out, lines.join('\n'));
console.log(`生成しました: ${out}`);
