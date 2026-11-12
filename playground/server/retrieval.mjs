// 检索：关键词（BM25）、语义（向量）、融合（RRF）与关系图谱。
// 全部是确定性的纯函数，不联网、不调模型。语义这一路用的是一张手工编的概念表，
// 不是神经网络嵌入模型：维度只有几十个，但“意思相近则向量相近”的原理和盲区都是真的。

/** 粗略估算 token 数，只用于画刻度和限制舱容量。真实数字以供应商返回的 usage 为准。 */
export function estimateTokens(text) {
  let cjk = 0;
  for (const ch of text) if (ch.charCodeAt(0) > 0x2e7f) cjk++;
  return Math.ceil(cjk * 1.1 + (text.length - cjk) / 3.6);
}

// ---------- 关键词：BM25 ----------
const isCjk = (ch) => ch.charCodeAt(0) > 0x2e7f && !/[　-〿＀-￯]/.test(ch);

/** 英文和数字按词切，中文按相邻两个字切（bigram）。没有分词词典，所以它只认字面。 */
export function tokenize(text) {
  const tokens = [];
  let run = '';
  let word = '';
  const flushRun = () => {
    if (run.length === 1) tokens.push(run);
    for (let i = 0; i + 1 < run.length; i++) tokens.push(run.slice(i, i + 2));
    run = '';
  };
  const flushWord = () => {
    if (word) tokens.push(word.toLowerCase());
    word = '';
  };
  for (const ch of text) {
    if (/[A-Za-z0-9]/.test(ch)) {
      flushRun();
      word += ch;
    } else if (isCjk(ch)) {
      flushWord();
      run += ch;
    } else {
      flushRun();
      flushWord();
    }
  }
  flushRun();
  flushWord();
  return tokens;
}

const K1 = 1.5;
const B = 0.75;

function bm25(docs, query) {
  const docTokens = docs.map((doc) => tokenize(doc.indexText));
  const avgLen = docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(1, docs.length);
  const df = new Map();
  for (const tokens of docTokens) for (const token of new Set(tokens)) df.set(token, (df.get(token) ?? 0) + 1);
  const terms = [...new Set(tokenize(query))];
  return docs
    .map((doc, i) => {
      const tokens = docTokens[i];
      let score = 0;
      for (const term of terms) {
        const tf = tokens.filter((token) => token === term).length;
        if (!tf) continue;
        const n = df.get(term);
        // 加 1 的写法保证 IDF 不为负：一个词出现在过半文档里时，原始公式会给出负分。
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * tokens.length) / avgLen));
      }
      return { id: doc.id, score, order: i };
    })
    .filter((hit) => hit.score > 0);
}

// ---------- 语义：概念向量 + 余弦相似度 ----------
// 每一行是一个维度：同一行里的说法被当成“同一个意思”。
const CONCEPTS = [
  ['番茄', ['番茄', '西红柿']],
  ['鸡蛋', ['鸡蛋', '炒蛋']],
  ['能否供应', ['停用', '下架', '能上', '供应', '到货', '恢复']],
  ['水培', ['水培']],
  ['豆制品', ['豆制品', '豆腐']],
  ['守则', ['守则']],
  ['食堂', ['食堂']],
  ['调班', ['调班']],
  ['出舱', ['出舱']],
  ['审批', ['申请', '审批', '找谁批']],
  ['深潜组', ['深潜组']],
  ['部门', ['外勤部', '部门']],
  ['负责人', ['主管', '组长']],
  ['用水', ['用水']],
  ['用电', ['用电']],
  ['月报', ['月报']],
  ['上升', ['上升', '涨了']],
  ['下降', ['下降', '降了']],
  ['穿梭机', ['穿梭机']],
  ['座位', ['座位', '订座']],
  ['体检', ['体检']],
  ['行李', ['行李']],
  ['夜班', ['夜班', '夜里']],
  ['加餐', ['加餐']],
  ['时间', ['几点', '截止', '开放时间']],
];
// “第十四条”和“第四十条”在意思上都是“某一条条款”：编号在这个维度里不留痕迹。
const CLAUSE = /第[零一二三四五六七八九十百\d]+条/g;

function count(text, term) {
  let n = 0;
  for (let at = text.indexOf(term); at >= 0; at = text.indexOf(term, at + term.length)) n++;
  return n;
}

export function embed(text) {
  const vector = CONCEPTS.map(([, terms]) => terms.reduce((sum, term) => sum + count(text, term), 0));
  vector.push((text.match(CLAUSE) ?? []).length);
  return vector;
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function dense(docs, query) {
  const q = embed(query);
  return docs.map((doc, i) => ({ id: doc.id, score: cosine(q, embed(doc.indexText)), order: i })).filter((hit) => hit.score > 0);
}

const ranked = (hits, digits = 3) => hits.sort((a, b) => b.score - a.score || a.order - b.order).map((hit, i) => ({ id: hit.id, score: Number(hit.score.toFixed(digits)), rank: i + 1 }));

// ---------- 融合：倒数排名融合（RRF）----------
export const RRF_K = 60;
const POOL = 10;

function fuse(lists) {
  const scores = new Map();
  for (const list of lists) for (const hit of list.slice(0, POOL)) scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (RRF_K + hit.rank));
  return [...scores.entries()].map(([id, score], order) => ({ id, score, order }));
}

/**
 * @param {{id: string, text: string, indexText?: string}[]} corpus
 * @param {string} query
 * @param {{vector?: boolean, fusion?: boolean, k?: number}} options
 */
export function search(corpus, query, { vector = false, fusion = false, k = 3 } = {}) {
  const docs = corpus.map((doc) => ({ ...doc, indexText: doc.indexText ?? doc.text }));
  const mode = !vector ? 'keyword' : fusion ? 'hybrid' : 'vector';
  const keyword = mode === 'vector' ? null : ranked(bm25(docs, query));
  const semantic = mode === 'keyword' ? null : ranked(dense(docs, query));
  const fused = mode === 'hybrid' ? ranked(fuse([keyword, semantic]), 4) : null;
  const final = fused ?? keyword ?? semantic;
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const rankIn = (list, id) => list?.find((hit) => hit.id === id)?.rank ?? null;
  return {
    mode,
    query,
    k,
    total: docs.length,
    // 给检索台看的榜单：最终名次靠前的几条，以及它们在每一路里各排第几。
    board: final.slice(0, 6).map((hit) => ({ id: hit.id, text: byId.get(hit.id).indexText, score: hit.score, keywordRank: rankIn(keyword, hit.id), vectorRank: rankIn(semantic, hit.id), picked: hit.rank <= k })),
    picked: final.slice(0, k).map((hit) => byId.get(hit.id)),
  };
}

// ---------- 关系图谱 ----------
/** 把 "- 甲 —关系→ 乙" 这样的行读成边。 */
export function parseEdges(text) {
  const edges = [];
  for (const line of (text ?? '').split('\n')) {
    const match = line.match(/^- (.+?) —(.+?)→ (.+)$/);
    if (match) edges.push({ from: match[1].trim(), relation: match[2].trim(), to: match[3].trim() });
  }
  return edges;
}

/** 从问题里提到的实体出发，顺着边往外走，最多走 depth 步，返回走过的每一条路径。 */
export function walkGraph(edges, query, depth = 3) {
  const starts = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].filter((name) => query.includes(name));
  const paths = [];
  const extend = (node, trail, seen) => {
    const next = edges.filter((edge) => edge.from === node && !seen.has(edge.to));
    if (!next.length || trail.length >= depth) {
      if (trail.length) paths.push(trail);
      return;
    }
    for (const edge of next) extend(edge.to, [...trail, edge], new Set([...seen, edge.to]));
  };
  for (const start of starts) extend(start, [], new Set([start]));
  return { starts, paths, lines: paths.map((trail) => `${trail[0].from}${trail.map((edge) => ` —${edge.relation}→ ${edge.to}`).join('')}`) };
}
