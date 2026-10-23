// keting.eu.org 工具箱共享脚本：工具收藏 + 最近使用（localStorage，无网络请求）
// 用法：<script src="assets/fav.js" defer></script>
(function () {
  'use strict';
  var LS_FAV = 'kt-fav-tools';
  var LS_RECENT = 'kt-recent-tools';
  var MAX_RECENT = 8;

  function readArr(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeArr(key, arr) {
    try { localStorage.setItem(key, JSON.stringify(arr)); } catch (e) {}
  }
  function slug() {
    var m = location.pathname.match(/\/?(tool-[a-z0-9-]+)\/?$/i);
    return m ? m[1] : '';
  }
  function titleOf(el) {
    var a = document.querySelector('h1');
    return (a ? a.textContent.replace(/^[^\u4e00-\u9fa5A-Za-z]+/, '').trim() : '') || document.title.split(/[-|·]/)[0].trim() || '工具';
  }
  function isFav(s) { return readArr(LS_FAV).indexOf(s) !== -1; }
  function toggleFav(s) {
    var arr = readArr(LS_FAV);
    var i = arr.indexOf(s);
    if (i === -1) arr.push(s); else arr.splice(i, 1);
    writeArr(LS_FAV, arr);
    return i === -1;
  }
  function pushRecent(s) {
    var arr = readArr(LS_RECENT).filter(function (x) { return x !== s; });
    arr.unshift(s);
    writeArr(LS_RECENT, arr.slice(0, MAX_RECENT));
  }
  function nameFromNav(s) {
    var a = document.querySelector('.toolsnav a[href="' + s + '"]');
    return a ? a.textContent.trim() : s.replace(/^tool-/, '');
  }
  function renderBar() {
    var s = slug();
    if (!s) return;
    var nav = document.querySelector('.toolsnav');
    if (!nav || document.getElementById('favbar')) return;
    var favs = readArr(LS_FAV);
    var recents = readArr(LS_RECENT).filter(function (x) { return x !== s; }).slice(0, 6);
    var html = '<div class="favbar" id="favbar">';
    html += '<button type="button" class="favbtn' + (isFav(s) ? ' on' : '') + '" id="favBtn">' + (isFav(s) ? '★ 已收藏' : '☆ 收藏本页') + '</button>';
    if (favs.length) {
      html += '<span class="favlabel">收藏夹：</span>';
      for (var i = 0; i < favs.length; i++) {
        html += '<a class="favchip" href="' + favs[i] + '">' + nameFromNav(favs[i]) + '</a>';
      }
    }
    if (recents.length) {
      html += '<span class="favlabel">最近用过：</span>';
      for (var j = 0; j < recents.length; j++) {
        html += '<a class="favchip recent" href="' + recents[j] + '">' + nameFromNav(recents[j]) + '</a>';
      }
    }
    html += '</div>';
    nav.insertAdjacentHTML('afterend', html);
    var btn = document.getElementById('favBtn');
    btn.addEventListener('click', function () {
      var added = toggleFav(s);
      btn.textContent = added ? '★ 已收藏' : '☆ 收藏本页';
      btn.classList.toggle('on', added);
      var bar = document.getElementById('favbar');
      if (bar) bar.remove();
      renderBar();
    });
  }
  function boot() {
    var s = slug();
    if (s) pushRecent(s);
    renderBar();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // PWA：注册 Service Worker（离线可用；注册失败静默忽略）
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
})();
