import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { latestJson, releaseNotes } from '../.github/scripts/latest-json.mjs';

// The assets of a release as stage-bundles.mjs names them, with the .sig a build with the updater key leaves.
const bundles = [
  'colautool_0.3.0_macos_aarch64.dmg', 'colautool_0.3.0_macos_aarch64.app.zip', 'colautool_0.3.0_macos_aarch64.app.tar.gz',
  'colautool_0.3.0_macos_x64.dmg', 'colautool_0.3.0_macos_x64.app.zip', 'colautool_0.3.0_macos_x64.app.tar.gz',
  'colautool_0.3.0_windows_x64-setup.exe', 'colautool_0.3.0_windows_x64.msi', 'colautool_0.3.0_windows_x64_portable.exe',
  'colautool_0.3.0_linux_x64.deb', 'colautool_0.3.0_linux_x64.rpm', 'colautool_0.3.0_linux_x64.AppImage',
];
const signed = bundles.filter(f => !/\.(dmg|app\.zip)$|_portable\.exe$/.test(f));
const release = (files: string[]) => ({
  files,
  signature: (name: string) => `sig of ${name}\n`,
  version: 'v0.3.0',
  repo: 'dactiennguyen/co-lau-loan-the-tool',
  tag: 'v0.3.0',
  notes: 'Nhật ký theo loại\n',
  date: '2026-11-01T02:00:00.000Z',
});

test('latest.json: every bundle the updater installs, by {os}-{arch}-{installer} and {os}-{arch}, with its .sig', () => {
  const m = latestJson(release([...bundles, ...signed.map(f => `${f}.sig`), 'SHA256SUMS.txt']));
  assert.equal(m.version, '0.3.0');
  assert.equal(m.notes, 'Nhật ký theo loại');
  assert.equal(m.pub_date, '2026-11-01T02:00:00.000Z');
  assert.deepEqual(Object.keys(m.platforms).sort(), [
    'darwin-aarch64', 'darwin-aarch64-app', 'darwin-x86_64', 'darwin-x86_64-app',
    'linux-x86_64', 'linux-x86_64-appimage', 'linux-x86_64-deb', 'linux-x86_64-rpm',
    'windows-x86_64', 'windows-x86_64-msi', 'windows-x86_64-nsis',
  ]);
  assert.deepEqual(m.platforms['darwin-aarch64-app'], {
    signature: 'sig of colautool_0.3.0_macos_aarch64.app.tar.gz.sig',
    url: 'https://github.com/dactiennguyen/co-lau-loan-the-tool/releases/download/v0.3.0/colautool_0.3.0_macos_aarch64.app.tar.gz',
  });
  // The portable exe has no bundle type, so the app turns its updates off; windows-x86_64 is the NSIS installer.
  assert.equal(m.platforms['windows-x86_64'].url.endsWith('_windows_x64-setup.exe'), true);
  assert.equal(m.platforms['linux-x86_64'], m.platforms['linux-x86_64-appimage']);
});

test('latest.json: the notes are the body of the release commit, without its trailers', () => {
  const body = 'Since 0.2.0: nhật ký theo loại,\ntab Thống kê.\n\n- Tự cập nhật\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n';
  assert.equal(releaseNotes(body), 'Since 0.2.0: nhật ký theo loại,\ntab Thống kê.\n\n- Tự cập nhật');
  assert.equal(releaseNotes('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n'), '');
  // Only git's "…-by:" trailers go; a last line that merely has a colon stays.
  assert.equal(releaseNotes('Tự cập nhật.\n\nGhi chú: cài tay bản này một lần'), 'Tự cập nhật.\n\nGhi chú: cài tay bản này một lần');
  assert.equal(releaseNotes('A\n\nSigned-off-by: phong <p@example.com>\nCo-authored-by: x <x@example.com>'), 'A');
  assert.equal(releaseNotes(''), '');
});

test('latest.json: a release built without the signing key fails, naming what has no signature', () => {
  assert.throws(() => latestJson(release(bundles)), /no signed bundle for \*_macos_aarch64\.app\.tar\.gz\.sig, .*TAURI_SIGNING_PRIVATE_KEY/);
  const noMsi = signed.filter(f => !f.endsWith('.msi')).map(f => `${f}.sig`);
  assert.throws(() => latestJson(release([...bundles, ...noMsi])), /no signed bundle for \*_windows_x64\.msi\.sig: /);
});

test('latest.json: the release workflow writes it before the release, and the app reads it from the latest release', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /latest-json\.mjs assets "\$VERSION" "\$GH_REPO" "\$TAG" commit-body\.txt > assets\/latest\.json/);
  assert.match(workflow, /secrets: inherit/);
  const config = JSON.parse(readFileSync(new URL('../app/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.plugins.updater.endpoints, ['https://github.com/dactiennguyen/colautool-releases/releases/latest/download/latest.json']);
  // Local builds stay unsigned; CI turns the updater files on when it has the key.
  assert.equal(config.bundle.createUpdaterArtifacts, undefined);
});

test('release-retry.yml runs a Release run again only when GitHub cancelled a job of it, at most twice', () => {
  const release = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  const retry = readFileSync(new URL('../.github/workflows/release-retry.yml', import.meta.url), 'utf8');
  assert.match(release, /^name: Release$/m);
  assert.match(retry, /workflows: \[Release\]/);
  // A run cancelled by hand ends "cancelled", not "failure"; the third attempt is the last.
  assert.match(retry, /conclusion == 'failure' && github\.event\.workflow_run\.run_attempt < 3/);
  // A job that failed by itself (a test, a build) is looked for before anything runs again.
  const failed = retry.indexOf("grep -q '^failure'");
  assert.ok(failed > 0 && failed < retry.indexOf("grep -q '^cancelled'") && failed < retry.indexOf('gh run rerun'));
  assert.match(retry, /gh run rerun "\$RUN" --failed/);
});
