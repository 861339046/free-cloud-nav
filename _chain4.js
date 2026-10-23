// 提交 GitHub 目标修正 -> 推送（自动重试）-> 等部署 -> 全链路复验 + Actions 运行记录
const cp = require('child_process');
const fs = require('fs');

const repo = 'C:/Users/Administrator/WorkBuddy/2026-09-30-11-22-00/free-cloud-nav';
const out = repo + '/_chain4.txt';
const TOKEN = 'Qfv0QtydQiSvxrfGoauh0hb0ysqs3FCL';
fs.writeFileSync(out, '');

function log(s) { fs.appendFileSync(out, s + '\n'); }
function curl(args) {
  const r = cp.spawnSync('curl', args, { encoding: 'utf8' });
  return String(r.stdout || '(no output)');
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// 1. 提交
const add = cp.spawnSync('git', ['-C', repo, 'add', 'status-probe.js'], { encoding: 'utf8' });
const cm = cp.spawnSync('git', ['-C', repo, 'commit', '-m', 'fix: GitHub 探测目标改用 api.github.com（首页被间歇性 403，会误报宕机）'], { encoding: 'utf8', timeout: 120000 });
log('add status=' + add.status + ' commit status=' + cm.status + ' ' + String((cm.stdout || '') + (cm.stderr || '')).split('\n')[0]);

// 2. 推送（最多 15 次，每次间隔 25s）
let pushed = false;
for (let i = 1; i <= 15; i++) {
  const r = cp.spawnSync('git', ['-C', repo, 'push', 'origin', 'main'], { encoding: 'utf8', timeout: 120000 });
  log('push attempt ' + i + ' status=' + r.status + ' ' + String((r.stdout || '') + (r.stderr || '')).split('\n')[0]);
  if (r.status === 0) { pushed = true; break; }
  sleep(25000);
}
if (!pushed) { log('PUSH_FAILED'); process.exit(0); }
log('PUSH_OK');

// 3. 等部署：线上 /status-probe.js 含 api.github.com 即新版上线
let deployed = false;
for (let i = 1; i <= 12; i++) {
  sleep(40000);
  const body = curl(['-s', '-m', '25', 'https://keting.eu.org/status-probe.js']);
  const live = body.indexOf("'https://api.github.com/'") !== -1;
  log(new Date().toISOString() + ' watch ' + i + ' live_new_version=' + live);
  if (live) { deployed = true; break; }
}

// 4. 全链路复验（探测两次：确认 GitHub 与 Oracle 都稳定 200）
log('--- FULL CHAIN VERIFY (deployed=' + deployed + ') ---');
for (let round = 1; round <= 2; round++) {
  const withTok = curl(['-s', '-m', '90', '-w', '|HTTP_%{http_code}', '-H', 'x-cron-token: ' + TOKEN, 'https://keting.eu.org/api/cron-probe']);
  log('probe round ' + round + ': ' + withTok.slice(0, 200));
  if (round === 1) sleep(5000);
}
const st = curl(['-s', '-m', '25', 'https://keting.eu.org/api/status']);
log('api/status: ' + st.slice(0, 1400));
log('cron-probe no token: HTTP_' + curl(['-s', '-m', '25', '-o', '/dev/null', '-w', '%{http_code}', 'https://keting.eu.org/api/cron-probe']).trim());
const runs = curl(['-s', '-m', '25', 'https://api.github.com/repos/861339046/free-cloud-nav/actions/runs?per_page=5']);
try {
  const j = JSON.parse(runs);
  log('actions runs total=' + j.total_count);
  for (const r of (j.workflow_runs || [])) log('  - ' + r.name + ' ' + r.status + ' ' + (r.conclusion || '') + ' ' + r.created_at + ' event=' + r.event);
} catch (e) { log('actions runs: parse_fail'); }
log('CHAIN4_DONE');
