// 模型接入：校验用户提交的模型配置，并在“每次运行独享”的 ModelRuntime 上落地。
// 用户的 key 只经过这里一次：校验 → setRuntimeApiKey（内存）→ 随运行结束被丢弃。
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { InMemoryCredentialStore, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import { validateBaseUrl } from './netguard.mjs';

// 直接使用 Pi 内置目录的供应商：地址固定，由 Pi 维护兼容细节。
const BUILTIN = [
  { id: 'deepseek', label: 'DeepSeek', keyHint: 'platform.deepseek.com' },
  { id: 'moonshotai-cn', label: 'Kimi · 月之暗面（中国大陆）', keyHint: 'platform.moonshot.cn' },
  { id: 'moonshotai', label: 'Kimi · Moonshot（国际）', keyHint: 'platform.moonshot.ai' },
  { id: 'anthropic', label: 'Anthropic', keyHint: 'console.anthropic.com' },
  { id: 'openai', label: 'OpenAI', keyHint: 'platform.openai.com' },
  { id: 'google', label: 'Google Gemini', keyHint: 'aistudio.google.com' },
  { id: 'openrouter', label: 'OpenRouter', keyHint: 'openrouter.ai' },
  { id: 'xai', label: 'xAI', keyHint: 'console.x.ai' },
  { id: 'groq', label: 'Groq', keyHint: 'console.groq.com' },
];

// 走“自定义 OpenAI 兼容地址”的常见服务，只是替用户把地址填好。
const CUSTOM_PRESETS = [
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { label: '硅基流动 SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1' },
  { label: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
];

const CUSTOM_APIS = new Set(['openai-completions', 'anthropic-messages']);
const KEY_PATTERN = /^[A-Za-z0-9_\-.=:+/]{8,400}$/;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,119}$/;

async function newRuntime() {
  return ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
}

let catalogCache;
/** 给前端的供应商与模型清单（不含任何凭据）。 */
export async function getCatalog() {
  if (!catalogCache) {
    const runtime = await newRuntime();
    catalogCache = {
      builtin: BUILTIN.map((provider) => ({
        ...provider,
        models: runtime.getModels(provider.id).map((model) => model.id),
      })).filter((provider) => provider.models.length > 0),
      customPresets: CUSTOM_PRESETS,
      customApis: [...CUSTOM_APIS],
    };
  }
  return catalogCache;
}

export class ConfigError extends Error {}

/** 只做形状与字符集校验，不发任何请求。返回规范化后的配置。 */
export function validateModelConfig(input) {
  if (!input || typeof input !== 'object') throw new ConfigError('缺少模型配置');
  if (input.mode === 'puppet') return { mode: 'puppet' };
  const key = typeof input.key === 'string' ? input.key.trim() : '';
  if (!KEY_PATTERN.test(key)) throw new ConfigError('API key 格式不对：只接受字母、数字和 _ - . = : + / ，长度 8–400');
  const modelId = typeof input.model === 'string' ? input.model.trim() : '';
  if (!MODEL_ID_PATTERN.test(modelId)) throw new ConfigError('模型 ID 格式不对');
  if (input.mode === 'builtin') {
    const provider = BUILTIN.find((p) => p.id === input.provider);
    if (!provider) throw new ConfigError('不支持的供应商');
    return { mode: 'builtin', provider: provider.id, model: modelId, key };
  }
  if (input.mode === 'custom') {
    if (!CUSTOM_APIS.has(input.api)) throw new ConfigError('不支持的接口类型');
    let baseUrl;
    try {
      baseUrl = validateBaseUrl(input.baseUrl);
    } catch (error) {
      throw new ConfigError(error.message);
    }
    return { mode: 'custom', api: input.api, baseUrl, model: modelId, key };
  }
  throw new ConfigError('未知的模型模式');
}

/**
 * 为一次运行建立独享的模型运行时。
 * @returns {Promise<{runtime: ModelRuntime, model: any, label: string}>}
 */
export async function buildModel(config, puppetSteps) {
  const runtime = await newRuntime();
  if (config.mode === 'puppet') {
    const faux = fauxProvider({ provider: 'puppet', models: [{ id: 'puppet-1', name: '提线木偶', contextWindow: 32000, maxTokens: 4096 }], tokensPerSecond: 900 });
    faux.setResponses(
      puppetSteps.map((step) => {
        const blocks = [];
        if (step.text) blocks.push(fauxText(step.text));
        for (const call of step.calls ?? []) blocks.push(fauxToolCall(call.name, call.args));
        return fauxAssistantMessage(blocks, { stopReason: step.calls?.length ? 'toolUse' : 'stop' });
      }),
    );
    runtime.registerNativeProvider(faux.provider);
    return { runtime, model: faux.getModel(), label: '提线木偶（剧本模型）' };
  }
  if (config.mode === 'builtin') {
    const model = runtime.getModel(config.provider, config.model);
    if (!model) throw new ConfigError(`供应商 ${config.provider} 的目录里没有模型 ${config.model}`);
    await runtime.setRuntimeApiKey(config.provider, config.key);
    return { runtime, model, label: `${config.provider}/${config.model}` };
  }
  runtime.registerProvider('byok', {
    baseUrl: config.baseUrl,
    api: config.api,
    models: [
      {
        id: config.model,
        name: config.model,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });
  const model = runtime.getModel('byok', config.model);
  if (!model) throw new ConfigError('自定义模型注册失败');
  await runtime.setRuntimeApiKey('byok', config.key);
  return { runtime, model, label: `${new URL(config.baseUrl).hostname}/${config.model}` };
}
