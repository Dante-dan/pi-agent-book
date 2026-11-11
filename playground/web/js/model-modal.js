// “接入模型”弹窗：选择模型来源、填写 key、可选的本地加密保存。
import { h } from './util.js';
import { forget, saveEncrypted, savedHint, unlock } from './vault.js';

export function openModelModal(ctx) {
  const modalRoot = document.getElementById('modal-root');
  const closeModal = () => modalRoot.replaceChildren();
  const cat = ctx.catalog;
  const current = ctx.config;
  const saved = savedHint();
  const error = h('p', { class: 'form-error', role: 'alert' });

  const modeSelect = h(
    'select',
    { id: 'm-mode' },
    h('option', { value: 'puppet' }, '提线木偶（不需要 key，按剧本演）'),
    cat.builtin.map((p) => h('option', { value: `builtin:${p.id}` }, p.label)),
    h('option', { value: 'custom' }, '自定义地址（OpenAI / Anthropic 兼容）'),
  );
  modeSelect.value = current.mode === 'builtin' ? `builtin:${current.provider}` : current.mode;

  const modelInput = h('input', { id: 'm-model', type: 'text', autocomplete: 'off', spellcheck: 'false', list: 'm-models', value: current.model ?? '' });
  const modelList = h('datalist', { id: 'm-models' });
  const baseInput = h('input', { id: 'm-base', type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://…/v1', value: current.baseUrl ?? '' });
  const apiSelect = h('select', { id: 'm-api' }, h('option', { value: 'openai-completions' }, 'OpenAI 兼容（/chat/completions）'), h('option', { value: 'anthropic-messages' }, 'Anthropic 兼容（/v1/messages）'));
  if (current.api) apiSelect.value = current.api;
  const presetRow = h(
    'div',
    { class: 'preset-row' },
    cat.customPresets.map((preset) =>
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-ghost btn-small',
          onclick: () => {
            baseInput.value = preset.baseUrl;
            apiSelect.value = 'openai-completions';
          },
        },
        preset.label,
      ),
    ),
  );
  const keyInput = h('input', { id: 'm-key', type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'sk-…', value: current.key ?? '' });
  const keyHint = h('p', { class: 'form-hint' });
  const remember = h('input', { id: 'm-remember', type: 'checkbox' });
  const passInput = h('input', { id: 'm-pass', type: 'password', autocomplete: 'new-password', placeholder: '至少 8 位，用来加密 key' });

  const realFields = h(
    'div',
    { class: 'form-group' },
    h('div', { class: 'field', dataset: { only: 'custom' } }, h('label', { for: 'm-base' }, '服务地址'), baseInput, presetRow),
    h('div', { class: 'field', dataset: { only: 'custom' } }, h('label', { for: 'm-api' }, '接口类型'), apiSelect),
    h('div', { class: 'field' }, h('label', { for: 'm-model' }, '模型 ID'), modelInput, modelList),
    h('div', { class: 'field' }, h('label', { for: 'm-key' }, 'API key'), keyInput, keyHint),
    h('label', { class: 'check-row' }, remember, h('span', {}, '在这台设备上记住（用口令加密后保存，不存明文）')),
    h('div', { class: 'field', dataset: { only: 'remember' } }, h('label', { for: 'm-pass' }, '加密口令'), passInput),
  );

  const sync = () => {
    const value = modeSelect.value;
    const isPuppet = value === 'puppet';
    const isCustom = value === 'custom';
    realFields.hidden = isPuppet;
    for (const el of realFields.querySelectorAll('[data-only="custom"]')) el.hidden = !isCustom;
    for (const el of realFields.querySelectorAll('[data-only="remember"]')) el.hidden = !remember.checked;
    modelList.replaceChildren();
    if (value.startsWith('builtin:')) {
      const provider = cat.builtin.find((p) => p.id === value.slice(8));
      modelList.append(...provider.models.map((id) => h('option', { value: id })));
      modelInput.placeholder = provider.models[0] ?? '';
      keyHint.textContent = `到 ${provider.keyHint} 申请。`;
    } else {
      modelInput.placeholder = '该平台的模型 ID';
      keyHint.textContent = '';
    }
  };
  modeSelect.addEventListener('change', () => {
    modelInput.value = '';
    sync();
  });
  remember.addEventListener('change', sync);
  sync();

  const unlockBox = saved
    ? h(
        'div',
        { class: 'unlock-box' },
        h('p', {}, '这台设备上存着一份加密的配置：', h('strong', {}, saved)),
        h(
          'div',
          { class: 'unlock-row' },
          h('input', { id: 'm-unlock', type: 'password', placeholder: '输入口令解锁', autocomplete: 'current-password' }),
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              onclick: async () => {
                try {
                  const restored = await unlock(document.getElementById('m-unlock').value);
                  closeModal();
                  ctx.onChange(restored);
                } catch {
                  error.textContent = '口令不对，或保存的数据已损坏。';
                }
              },
            },
            '解锁',
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-ghost',
              onclick: () => {
                forget();
                openModelModal(ctx);
              },
            },
            '删除',
          ),
        ),
      )
    : null;

  const submit = async (event) => {
    event.preventDefault();
    error.textContent = '';
    const value = modeSelect.value;
    let config;
    if (value === 'puppet') config = { mode: 'puppet' };
    else {
      const key = keyInput.value.trim();
      const model = modelInput.value.trim();
      if (!model) return void (error.textContent = '请填写模型 ID。');
      if (key.length < 8) return void (error.textContent = '请填写 API key。');
      config = value === 'custom' ? { mode: 'custom', baseUrl: baseInput.value.trim(), api: apiSelect.value, model, key } : { mode: 'builtin', provider: value.slice(8), model, key };
      if (value === 'custom' && !/^https:\/\//.test(config.baseUrl)) return void (error.textContent = '服务地址必须以 https:// 开头。');
      if (remember.checked) {
        if (passInput.value.length < 8) return void (error.textContent = '加密口令至少 8 位。');
        try {
          await saveEncrypted(config, passInput.value);
        } catch {
          return void (error.textContent = '这个浏览器不支持本地加密，无法保存。');
        }
      }
    }
    closeModal();
    ctx.onChange(config);
  };

  const dialog = h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    h('header', { class: 'modal-head' }, h('h2', { id: 'modal-title' }, '接入模型'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '关闭', onclick: closeModal }, '×')),
    h(
      'div',
      { class: 'modal-body' },
      h(
        'ul',
        { class: 'promise-list' },
        h('li', {}, h('strong', {}, '本站不提供 key。'), '没有 key 也能玩：提线木偶会按剧本驱动真实的 Pi 循环。'),
        h('li', {}, h('strong', {}, 'key 会经过服务器，但不落盘。'), '它随请求转发给模型服务，用完即丢，不写日志。'),
        h('li', {}, h('strong', {}, '默认不保存。'), '刷新页面就没了；想记住，需要你自己设一个加密口令。'),
        h('li', {}, h('strong', {}, '代码开源。'), '不放心就去读：', h('a', { href: ctx.source, target: '_blank', rel: 'noopener noreferrer' }, 'playground/server'), '。'),
      ),
      unlockBox,
      h('form', { class: 'form', onsubmit: submit }, h('div', { class: 'field' }, h('label', { for: 'm-mode' }, '模型来源'), modeSelect), realFields, error, h('div', { class: 'modal-actions' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: closeModal }, '取消'), h('button', { type: 'submit', class: 'btn btn-primary' }, '使用这个模型'))),
    ),
  );
  const overlay = h('div', { class: 'overlay', onclick: (e) => e.target === overlay && closeModal() }, dialog);
  modalRoot.replaceChildren(overlay);
  modeSelect.focus();
}
