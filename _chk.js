var fs = require('fs');
var SLUGS = ['tool-cron','tool-json','tool-timestamp','tool-base64','tool-password','tool-qrcode','tool-uuid','tool-regex','tool-sha','tool-markdown','tool-image','tool-color','tool-diff','tool-urlparam','tool-jsoncsv','tool-radix','tool-lineops','tool-htmlescape','tool-numfmt','tool-datediff','tool-sshkey'];
var bad = 0;
fs.readdirSync('.').filter(function(f){ return /^tool-.*\.html$/.test(f); }).forEach(function(f){
  var slug = f.replace(/\.html$/, '');
  var s = fs.readFileSync(f, 'utf8');
  var nav = s.match(/<nav class="toolsnav">[\s\S]*?<\/nav>/);
  if(!nav){ console.log('BAD ' + f + ': no nav'); bad++; return; }
  var links = (nav[0].match(/<a /g) || []).length;
  var on = nav[0].match(/<a class="on" href="([^"]+)"/);
  var hasCss = s.indexOf('.toolsnav a.on') !== -1;
  if(links !== 22 || !on || on[1] !== slug || !hasCss){
    console.log('BAD ' + f + ': links=' + links + ' on=' + (on ? on[1] : 'none') + ' css=' + hasCss); bad++;
  }
});
console.log('nav pages bad=' + bad + ' (expect 0, 22 links each = 工具箱+21)');
// sitemap
var sm = fs.readFileSync('sitemap.xml','utf8');
var locs = sm.match(/<loc>([^<]+)<\/loc>/g).map(function(x){ return x.slice(5,-6); });
console.log('sitemap urls=' + locs.length + ' uniq=' + new Set(locs).size + ' 含sshkey=' + (locs.indexOf('https://keting.eu.org/tool-sshkey') !== -1));
// payload
var p = JSON.parse(fs.readFileSync('indexnow-payload.json','utf8'));
console.log('payload urls=' + p.urlList.length + ' 含sshkey=' + (p.urlList.indexOf('https://keting.eu.org/tool-sshkey') !== -1));
// 索引页
var t = fs.readFileSync('tools.html','utf8');
console.log('tools.html 卡片=' + (t.match(/class="card[" ]/g) || []).length + ' 计数21=' + (t.indexOf('21 个') !== -1));
// 内联脚本语法快检
var ssh = fs.readFileSync('tool-sshkey.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
try{ new Function(ssh); console.log('tool-sshkey 内联脚本语法 OK'); }
catch(e){ console.log('tool-sshkey 内联脚本语法错误: ' + e.message); bad++; }
console.log('bad=' + bad);
