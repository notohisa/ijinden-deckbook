import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const normalDir = 'dist-pages';
const previewDir = 'sync-preview-source/dist-pages';
const targetDir = join(normalDir, 'sync-test');
const normalIndex = readFileSync(join(normalDir, 'index.html'), 'utf8');
const previewIndex = readFileSync(join(previewDir, 'index.html'), 'utf8');
assert(normalIndex.includes('/ijinden-deckbook/assets/'));
assert(previewIndex.includes('/ijinden-deckbook/sync-test/assets/'));
assert(previewIndex.includes('<head>'));
assert(!existsSync(targetDir), 'Preview destination must be empty.');

cpSync(previewDir, targetDir, { recursive: true });
writeFileSync(
  join(targetDir, 'index.html'),
  previewIndex.replace(
    '<head>',
    '<head>\n    <meta name="robots" content="noindex, nofollow" />',
  ),
);
// The preview policy describes both versions. Only publish that version when
// the preview itself is present; a normal-only build keeps its original policy.
cpSync(join(previewDir, 'privacy.html'), join(normalDir, 'privacy.html'));
assert.equal(readFileSync(join(normalDir, 'index.html'), 'utf8'), normalIndex);
