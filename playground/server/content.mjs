// 正文：启动时把 book-v2/ 下的 Markdown 渲染成 HTML，之后只读内存。
// 这些文件是仓库里的书稿，不含任何用户输入。
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const CONTENT_DIR = process.env.CONTENT_DIR ?? fileURLToPath(new URL('../../book-v2/', import.meta.url));
const SITE = 'https://pi.duanjl.com/';

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

function render(markdown) {
  const toc = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const plain = html.replace(/<[^>]+>/g, '');
        const id = `h-${toc.length + 1}`;
        if (depth === 2 || depth === 3) toc.push({ id, depth, text: plain });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        const safe = escapeHtml(href ?? '');
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        // 指向本站关卡的链接在站内直接跳转；其余外链新开窗口。
        if (safe.startsWith(SITE)) return `<a href="${safe.slice(SITE.length - 1)}" class="play-link"${titleAttr}>${text}</a>`;
        // 手册之间的相对链接：在工坊里没有对应页面，指到 GitHub 上的书稿。
        if (/^[\w-]+\.md(#.*)?$/.test(safe)) return `<a href="https://github.com/Dante-dan/pi-agent-book/blob/main/book-v2/${safe}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
        if (/^https?:/.test(safe)) return `<a href="${safe}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
        return `<a href="${safe}"${titleAttr}>${text}</a>`;
      },
      table(token) {
        const header = token.header.map((cell) => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join('');
        const rows = token.rows.map((row) => `<tr>${row.map((cell) => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  const html = marked.parse(markdown);
  return { html, toc };
}

/** @returns {Promise<Map<string, {id: string, title: string, html: string, toc: object[]}>>} */
export async function loadChapters() {
  const chapters = new Map();
  let names = [];
  try {
    names = (await readdir(CONTENT_DIR)).filter((name) => /^\d{2}-[a-z0-9-]+\.md$/.test(name) || /^s-[a-z0-9-]+\.md$/.test(name));
  } catch {
    console.warn('[content] 找不到正文目录，阅读栏将为空');
  }
  for (const name of names) {
    const markdown = await readFile(join(CONTENT_DIR, name), 'utf8');
    const id = name.replace(/\.md$/, '');
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? id;
    chapters.set(id, { id, title, ...render(markdown) });
  }
  return chapters;
}
