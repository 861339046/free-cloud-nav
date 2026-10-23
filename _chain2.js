// 提交 Oracle 目标修正 -> 推送（自动重试）-> 等部署 -> 全链路复验
const cp = require('child_process');
const fs = require('fs');

const repo = 'C:/Users/Administrator/WorkBuddy/2026-09-30-11-22-00/free-cloud-nav';
const out = repo + '/_chain2.txt';
const TOKEN = 'Qfv0QtydQiSvxrfGoauh0hb0ysqs3FCL';
fs.writeFileSync(out, '');

function log(s) { fs.appendFileSync(out, s + '\n'); }
function curl(args) {
  const r = cp.spawnSync('curl', args, { encoding: 'utf8' });
  return String(r.stdout || '(no output)');
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function git(args) {
  const r = cp.spawnSync('git', ['-C', repo].concat(args), { encoding: 'utf8', timeout: 120000 });
  return r.status === 0 ? 'ok' : ('fail: ' + String((r.stdout || '') + (r.stderr || '')).split('\n')[0]);
}

// 1. 提交
log('add: ' + git(['add', 'status-probe.js']));
log('commit: ' + git(['commit', '-m', 'fix: Oracle Cloud 探测目标改用官方状态页（营销页被 Akamai 按 IP 拦 403，会误报宕机）']));

// 2. 推送（最多 10 次，每次间隔 20s）
let pushed = false;
for (let i = 1; i <= 10; i++) {
  const r = cp.spawnSync('git', ['-C', repo, 'push', 'origin', 'main'], { encoding: 'utf8', timeout: 120000 });
  log('push attempt ' + i + ' status=' + r.status + ' ' + String((r.stdout || '') + (r.stderr || '')).split('\n')[0]);
  if (r.status === 0) { pushed = true; break; }
  sleep(20000);
}
if (!pushed) { log('PUSH_FAILED'); process.exit(0); }
log('PUSH_OK');

// 3. 等部署：以线上 /status-probe.js 内容含 ocistatus 为判定（比 HTTP 200 更严格，旧版也是 200）
let deployed = false;
let newSha = curl(['-s', '-m', '25', 'https://api.github.com/repos/861339046/free-cloud-nav/commits/main']);
try { newSha = JSON.parse(newSha).sha; } catch (e) { newSha = 'main'; }
for (let i = 1; i <= 12; i++) {
  sleep(40000);
  const body = curl(['-s', '-m', '25', 'https://keting.eu.org/status-probe.js']);
  const live = body.indexOf('ocistatus.oraclecloud.com') !== -1;
  log(new Date().toISOString() + ' watch ' + i + ' live_new_version=' + live);
  if (live) { deployed = true; break; }
}

// 4. 全链路复验
log('--- FULL CHAIN VERIFY (deployed=' + deployed + ') ---');
log('static status-probe.js has ocistatus: ' + (curl(['-s', '-m', '25', 'https://keting.eu.org/status-probe.js']).indexOf('ocistatus.oraclecloud.com') !== -1));
log('cron-probe no token: HTTP_' + curl(['-s', '-m', '25', '-o', '/dev/null', '-w', '%{http_code}', 'https://keting.eu.org/api/cron-probe']).trim());
const withTok = curl(['-s', '-m', '90', '-w', '|HTTP_%{http_code}', '-H', 'x-cron-token: ' + TOKEN, 'https://keting.eu.org/api/cron-probe']);
log('cron-probe with token: ' + withTok.slice(0, 300));
const st = curl(['-s', '-m', '25', 'https://keting.eu.org/api/status']);
log('api/status: ' + st.slice(0, 900));
const runs = curl(['-s', '-m', '25', 'https://api.github.com/repos/861339046/free-cloud-nav/actions/runs?per_page=5']);
try {
  const j = JSON.parse(runs);
  log('actions runs total=' + j.total_count);
  for (const r of (j.workflow_runs || [])) log('  - ' + r.name + ' ' + r.status + ' ' + (r.conclusion || '') + ' ' + r.created_at);
} catch (e) { log('actions runs: parse_fail'); }
log('CHAIN2_DONE');
