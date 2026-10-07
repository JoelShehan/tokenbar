// Run against the packaged executable after a release build. No sign-in is performed.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const executable = path.resolve(process.argv[2] ?? 'src-tauri/target/release/tokenbar.exe');
const profile = path.resolve(`test-results/native-profile-${Date.now()}`);
await mkdir(profile, { recursive: true });
const child = spawn(executable, [], {
  cwd: path.dirname(executable), windowsHide: true, stdio: 'ignore',
  env: { ...process.env, PATH: '', WEBVIEW2_USER_DATA_FOLDER: profile,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9229 --remote-debugging-address=127.0.0.1' },
});
let browser;
let page;
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Widget exited with ${child.exitCode}`);
    try { if ((await fetch('http://127.0.0.1:9229/json/version')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.connectOverCDP('http://127.0.0.1:9229');
  for (let attempt = 0; attempt < 80; attempt++) {
    page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('tauri.localhost'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!page) throw new Error('Widget WebView not found');
  await page.getByText('TokenBar', { exact: true }).waitFor();
  const status = await page.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    return { helper: await invoke('get_codex_version'), available: await invoke('is_codex_installed'), connected: await invoke('codex_account_connected') };
  });
  if (status.helper !== 'codex-cli 0.161.0' || !status.available) throw new Error('Bundled helper did not resolve from the packaged app');
  if (!status.connected) await page.getByRole('button', { name: 'Connect Codex', exact: true }).waitFor();
  if (await page.getByText('OpenAI API', { exact: true }).count()) throw new Error('Optional API provider shown on a fresh installation');
  await page.screenshot({ path: 'test-results/native-first-run.png' });
  console.log('Native widget smoke passed: bundled helper loads with empty PATH; first-run screen renders. No real sign-in performed.');
} finally {
  if (page) await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('quit_app')).catch(() => {});
  await browser?.close().catch(() => {});
  if (child.exitCode === null) {
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill();
  }
}
