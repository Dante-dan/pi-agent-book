// 明暗两套配色。页面用 CSS 变量，3D 场景用这里的同名颜色，两边保持一致。
export const PALETTES = {
  dark: {
    space: '#05070d',
    hull: '#8794b0',
    hullDim: '#3a4560',
    line: '#3d4d70',
    text: '#dbe4f3',
    dim: '#6f7d9b',
    system: '#b69cff',
    user: '#ffb454',
    assistant: '#5ce1e6',
    toolResult: '#8be28b',
    error: '#ff6b7a',
  },
  light: {
    space: '#e9eef8',
    hull: '#7f8ca8',
    hullDim: '#b3bdd2',
    line: '#9aa7c2',
    text: '#17202f',
    dim: '#6a7690',
    system: '#6d4fe0',
    user: '#c96a00',
    assistant: '#06929c',
    toolResult: '#2c8a3c',
    error: '#d63649',
  },
};

/** 当前配色。切换主题时原地更新，所以别处 import 的引用始终是最新的。 */
export const COLORS = { ...PALETTES.dark };

const STORAGE_KEY = 'pi-workshop-theme';

export function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  Object.assign(COLORS, PALETTES[theme]);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* 存不了就只在本次访问内生效 */
    }
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
}

export function initTheme() {
  applyTheme(currentTheme());
  // 没有手动选过时，跟随系统。
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* 忽略 */
    }
    if (!saved) applyTheme(event.matches ? 'light' : 'dark');
  });
}
