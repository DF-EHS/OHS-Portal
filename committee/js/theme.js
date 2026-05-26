/* =============================================
   theme.js — 深色/淺色模式切換
   大豐環保｜法務及環安課
   ============================================= */

(function () {
  // 讀取使用者偏好
  var stored = localStorage.getItem('theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = stored || (prefersDark ? 'dark' : 'light');

  // 立即套用（避免閃爍）
  document.documentElement.setAttribute('data-theme', theme);

  // 頁面載入後注入切換按鈕
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', '切換深色/淺色模式');
    btn.setAttribute('title', '切換深色/淺色模式');
    btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      btn.innerHTML = next === 'dark' ? '☀️' : '🌙';
    });
  });

  // 監聽系統主題變更（僅在使用者未手動設定時跟隨）
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem('theme')) {
      var next = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      var btn = document.querySelector('.theme-toggle');
      if (btn) btn.innerHTML = next === 'dark' ? '☀️' : '🌙';
    }
  });
})();
