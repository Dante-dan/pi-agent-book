// 声音：全部用 WebAudio 现场合成，不加载任何音频文件。
// 浏览器要求先有一次用户操作才能出声，所以第一次点击之前都是静音的。
// 三层：环境底噪（舱内的低频嗡鸣）、界面与事件音效、关键时刻的短乐句。
const STORAGE_KEY = 'pi-workshop-sound';
let ctx = null;
let master = null;
let ambient = null;
let enabled = true;
try {
  enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
} catch {
  /* 忽略 */
}

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.2;
    // 压一下峰值，几个音同时响的时候不刺耳。
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    master.connect(limiter).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

let noiseBuffer = null;
function noise(audio) {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const source = audio.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;
  return source;
}

function tone({ type = 'sine', from, to = from, at = 0, dur = 0.12, gain = 1, attack = 0.012 }) {
  const audio = ensure();
  if (!audio) return;
  const start = audio.currentTime + at;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** 一阵被滤波器扫过的噪声：呼啸、喷气、无线电底噪都靠它。 */
function whoosh({ from = 300, to = 2400, at = 0, dur = 0.4, gain = 0.4, q = 1.2, type = 'bandpass' }) {
  const audio = ensure();
  if (!audio) return;
  const start = audio.currentTime + at;
  const source = noise(audio);
  const filter = audio.createBiquadFilter();
  const amp = audio.createGain();
  filter.type = type;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + dur);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + dur * 0.25);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  source.connect(filter).connect(amp).connect(master);
  source.start(start);
  source.stop(start + dur + 0.05);
}

function startAmbient() {
  const audio = ensure();
  if (!audio || ambient) return;
  const bus = audio.createGain();
  bus.gain.value = 0.0001;
  bus.gain.exponentialRampToValueAtTime(0.5, audio.currentTime + 3);
  bus.connect(master);
  const nodes = [];
  // 两个略微失谐的低频正弦，叠出缓慢起伏的嗡鸣。
  for (const [freq, gain] of [
    [55, 0.5],
    [55.4, 0.4],
    [82.4, 0.22],
    [110.2, 0.1],
  ]) {
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp).connect(bus);
    osc.start();
    nodes.push(osc);
  }
  // 通风系统：低通滤过的噪声，音量被一个很慢的 LFO 推着走。
  const air = noise(audio);
  const lowpass = audio.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 420;
  const airGain = audio.createGain();
  airGain.gain.value = 0.16;
  const lfo = audio.createOscillator();
  const lfoGain = audio.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 0.07;
  lfo.connect(lfoGain).connect(airGain.gain);
  air.connect(lowpass).connect(airGain).connect(bus);
  air.start();
  lfo.start();
  nodes.push(air, lfo);
  ambient = { bus, nodes };
}

function stopAmbient() {
  if (!ambient || !ctx) return;
  const { bus, nodes } = ambient;
  ambient = null;
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
  setTimeout(() => {
    for (const node of nodes) {
      try {
        node.stop();
      } catch {
        /* 已停止 */
      }
    }
  }, 1600);
}

/** 和弦垫音：几个音同时缓慢淡入淡出。 */
function pad(freqs, { at = 0, dur = 2.4, gain = 0.16 } = {}) {
  for (const freq of freqs) {
    tone({ type: 'sine', from: freq, at, dur, gain, attack: dur * 0.35 });
    tone({ type: 'triangle', from: freq * 2, at, dur, gain: gain * 0.25, attack: dur * 0.4 });
  }
}

export const sfx = {
  isOn: () => enabled,
  toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      /* 忽略 */
    }
    if (enabled) {
      sfx.click();
      startAmbient();
    } else stopAmbient();
    return enabled;
  },
  ambient: startAmbient,
  silence: stopAmbient,
  click: () => tone({ type: 'triangle', from: 660, to: 880, dur: 0.06, gain: 0.5 }),
  tick: () => tone({ type: 'square', from: 1400, dur: 0.012, gain: 0.07 }),
  /** 地面指挥开口前的无线电“咔”。 */
  radio() {
    whoosh({ from: 2600, to: 1800, dur: 0.09, gain: 0.25, q: 4 });
    tone({ type: 'square', from: 1200, dur: 0.03, gain: 0.12 });
  },
  /** 任务片头：一个上行的五度。 */
  title() {
    pad([110, 164.8], { dur: 2.6, gain: 0.2 });
    pad([220, 329.6], { at: 0.5, dur: 2.2, gain: 0.1 });
    whoosh({ from: 200, to: 1600, dur: 1.6, gain: 0.12 });
  },
  launch() {
    whoosh({ from: 120, to: 3200, dur: 0.9, gain: 0.5 });
    tone({ type: 'sawtooth', from: 70, to: 420, dur: 0.8, gain: 0.35 });
    tone({ type: 'sine', from: 140, to: 880, dur: 0.8, gain: 0.3 });
  },
  packet() {
    whoosh({ from: 900, to: 3600, dur: 0.22, gain: 0.16, q: 3 });
    tone({ type: 'sine', from: 520, to: 980, dur: 0.14, gain: 0.28 });
  },
  call() {
    tone({ type: 'triangle', from: 300, to: 420, dur: 0.24, gain: 0.4 });
    whoosh({ from: 400, to: 1800, dur: 0.5, gain: 0.14, q: 2 });
  },
  result: () => tone({ type: 'sine', from: 880, to: 620, dur: 0.16, gain: 0.32 }),
  error() {
    tone({ type: 'square', from: 220, to: 150, dur: 0.22, gain: 0.28 });
    whoosh({ from: 1200, to: 200, dur: 0.25, gain: 0.2 });
  },
  /** 事故：一记低频撞击，接三声警报。 */
  alarm() {
    tone({ type: 'sine', from: 90, to: 34, dur: 0.7, gain: 0.9 });
    whoosh({ from: 800, to: 80, dur: 0.6, gain: 0.45, type: 'lowpass' });
    for (let i = 0; i < 3; i++) tone({ type: 'sawtooth', from: 440, to: 300, at: 0.15 + i * 0.26, dur: 0.22, gain: 0.32 });
  },
  wrong: () => tone({ type: 'square', from: 180, to: 110, dur: 0.25, gain: 0.28 }),
  unlock() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', from: f, at: i * 0.09, dur: 0.34, gain: 0.45 }));
    pad([261.6, 392], { at: 0.2, dur: 1.8, gain: 0.12 });
  },
  /** 装上零件：机械锁扣 + 充能。 */
  install() {
    tone({ type: 'sine', from: 160, to: 60, dur: 0.22, gain: 0.7 });
    whoosh({ from: 3000, to: 600, dur: 0.12, gain: 0.3, q: 2 });
    tone({ type: 'triangle', from: 400, to: 1300, at: 0.12, dur: 0.5, gain: 0.25 });
    whoosh({ from: 300, to: 2600, at: 0.1, dur: 0.6, gain: 0.14 });
  },
  pass() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', from: f, at: i * 0.1, dur: 0.46, gain: 0.45 }));
    pad([196, 261.6, 392], { at: 0.3, dur: 3.2, gain: 0.16 });
  },
};
