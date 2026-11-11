// 在首屏绘制前定下主题，避免闪一下。单独成文件是因为本站的 CSP 不允许内联脚本。
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('pi-workshop-theme');
  } catch (e) {
    /* 忽略 */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
