/**
 * 音频系统：魔性 BGM + 音效
 * 使用 Web Audio API 程序化生成 8-bit chiptune 音乐
 */
class GameAudio {
  constructor() {
    this.ctx = null;
    this.bgmPlaying = false;
    this.muted = false;
    this.bgmVolume = 0.35;
    this.sfxVolume = 0.5;
    this.bgmNodes = [];
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this._initialized = false;
    this._loopTimer = null;
  }

  /** 延迟初始化 AudioContext（需用户交互后调用） */
  init() {
    if (this._initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.bgmVolume;
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this._initialized = true;
    } catch (e) {
      console.warn("Web Audio API 不可用:", e);
    }
  }

  /** 恢复 AudioContext（某些浏览器需要） */
  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /** 切换静音 */
  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : 1,
        this.ctx.currentTime,
        0.05
      );
    }
    return this.muted;
  }

  /** 设置静音状态 */
  setMuted(val) {
    this.muted = val;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : 1,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  // ========== BGM ==========

  /** 魔性 BGM 旋律数据 */
  _getMelody() {
    // 音符频率表 (Hz)
    const N = {
      C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61,
      G3: 196.00, Ab3: 207.65, Bb3: 233.08, B3: 246.94,
      C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23,
      G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
      C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46,
      G5: 783.99, Ab5: 830.61, Bb5: 932.33,
      R: 0, // 休止符
    };

    // BPM = 142，一拍 = 60/142 ≈ 0.4225s
    // 用 16 分音符为基本单位
    const BPM = 142;
    const beat = 60 / BPM;
    const S = beat / 4; // 16分音符

    // 魔性主旋律（循环 32 个 16 分音符 = 8 拍）
    const melody = [
      // 小节 1-2: 上行琶音 + 跳跃（洗脑 hook）
      N.C5, N.Eb5, N.G5, N.C5, N.Eb5, N.G5, N.Bb5, N.G5,
      N.Eb5, N.C5, N.Eb5, N.G5, N.C5, N.Bb4, N.G4, N.Eb4,
      // 小节 3-4: 下行 + 切分节奏
      N.F4, N.Ab4, N.C5, N.F5, N.Eb5, N.C5, N.Ab4, N.F4,
      N.G4, N.Bb4, N.D5, N.G5, N.F5, N.D5, N.Bb4, N.G4,
    ];

    // 旋律节拍时值（1 = 16分音符）
    const rhythm = [
      1,1,1,1, 1,1,1,1,
      1,1,1,1, 2,1,1,1,
      1,1,1,1, 1,1,1,1,
      1,1,1,2, 1,1,1,1,
    ];

    // 高八度副旋律（第二遍叠加）
    const melody2 = [
      N.R, N.R, N.R, N.R, N.C5, N.Eb5, N.G5, N.C6,
      N.Bb5, N.G5, N.Eb5, N.C5, N.R, N.R, N.R, N.R,
      N.R, N.R, N.C5, N.F5, N.Ab5, N.F5, N.C5, N.R,
      N.R, N.R, N.D5, N.G5, N.Bb5, N.G5, N.D5, N.R,
    ];

    return { melody, melody2, rhythm, S, BPM };
  }

  /** 贝斯线 */
  _getBassline() {
    const N = {
      C2: 65.41, Eb2: 77.78, F2: 87.31, G2: 98.00, Ab2: 103.83,
      Bb2: 116.54,
      R: 0,
    };

    const BPM = 142;
    const beat = 60 / BPM;
    const S = beat / 4;

    // 贝斯循环（8 拍 = 32 个 16 分音符）
    const bass = [
      N.C2, N.R, N.C2, N.C2, N.R, N.C2, N.Eb2, N.R,
      N.F2, N.R, N.F2, N.F2, N.R, N.F2, N.R, N.R,
      N.Ab2, N.R, N.Ab2, N.Ab2, N.R, N.Ab2, N.R, N.R,
      N.G2, N.R, N.G2, N.Bb2, N.R, N.G2, N.R, N.R,
    ];

    const rhythm = [
      1,1,1,1, 1,1,1,1,
      1,1,1,1, 1,1,1,1,
      1,1,1,1, 1,1,1,1,
      1,1,1,1, 1,1,1,1,
    ];

    return { bass, rhythm, S };
  }

  /** 鼓组节奏 */
  _getDrumPattern() {
    const BPM = 142;
    const beat = 60 / BPM;
    const S = beat / 4;

    // 32 个 16 分音符
    // kick: 1, 9, 17, 25（每拍第一个）
    // snare: 5, 13, 21, 29（每拍第三个，即反拍）
    // hihat: 每个奇数位
    const kick =   [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
    const snare =  [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0];
    const hihat =  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];

    return { kick, snare, hihat, S };
  }

  /** 播放一个音符 */
  _playNote(freq, startTime, duration, type = "square", gainNode = null, volume = 0.3) {
    if (!this.ctx || freq <= 0) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    // 轻微的音高滑动（更有 8-bit 感）
    osc.frequency.setValueAtTime(freq * 1.005, startTime);
    osc.frequency.linearRampToValueAtTime(freq, startTime + 0.01);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
    gain.gain.setValueAtTime(volume, startTime + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    gain.connect(gainNode || this.bgmGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);

    return osc;
  }

  /** 播放鼓声 */
  _playDrum(type, startTime, volume = 0.25) {
    if (!this.ctx) return;

    if (type === "kick") {
      // 底鼓：低频正弦波快速下降
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, startTime);
      osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.08);
      gain.gain.setValueAtTime(volume * 1.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(startTime);
      osc.stop(startTime + 0.15);
    } else if (type === "snare") {
      // 军鼓：噪声 + 中频
      const bufferSize = this.ctx.sampleRate * 0.08;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(volume * 0.7, startTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 2000;

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.bgmGain);
      noise.start(startTime);
      noise.stop(startTime + 0.1);

      // 加一个短促的中频
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(200, startTime);
      osc.frequency.exponentialRampToValueAtTime(100, startTime + 0.04);
      oscGain.gain.setValueAtTime(volume * 0.4, startTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);
      osc.connect(oscGain);
      oscGain.connect(this.bgmGain);
      osc.start(startTime);
      osc.stop(startTime + 0.08);
    } else if (type === "hihat") {
      // 踩镲：高频噪声
      const bufferSize = this.ctx.sampleRate * 0.03;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume * 0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 8000;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      noise.start(startTime);
      noise.stop(startTime + 0.04);
    }
  }

  /** 启动 BGM 循环 */
  startBGM() {
    if (!this._initialized) this.init();
    if (!this.ctx) return;
    this.resume();

    if (this.bgmPlaying) return;
    this.bgmPlaying = true;

    this._scheduleBGM();
  }

  _scheduleBGM() {
    if (!this.bgmPlaying || !this.ctx) return;

    const { melody, melody2, rhythm: mRhythm, S } = this._getMelody();
    const { bass, rhythm: bRhythm } = this._getBassline();
    const { kick, snare, hihat } = this._getDrumPattern();

    const loopLength = 32 * S; // 32 个 16 分音符
    const now = this.ctx.currentTime + 0.05;
    const startTime = now;

    // 预排 2 个小节循环
    for (let loop = 0; loop < 2; loop++) {
      const offset = startTime + loop * loopLength;

      // 主旋律（方波）
      let t = 0;
      for (let i = 0; i < melody.length; i++) {
        const dur = (mRhythm[i] || 1) * S;
        if (melody[i] > 0) {
          this._playNote(melody[i], offset + t, dur * 0.9, "square", this.bgmGain, 0.18);
        }
        t += dur;
      }

      // 副旋律（三角波，音量低）
      t = 0;
      for (let i = 0; i < melody2.length; i++) {
        const dur = (mRhythm[i] || 1) * S;
        if (melody2[i] > 0) {
          this._playNote(melody2[i], offset + t, dur * 0.85, "triangle", this.bgmGain, 0.08);
        }
        t += dur;
      }

      // 贝斯（三角波）
      t = 0;
      for (let i = 0; i < bass.length; i++) {
        const dur = (bRhythm[i] || 1) * S;
        if (bass[i] > 0) {
          this._playNote(bass[i], offset + t, dur * 0.85, "triangle", this.bgmGain, 0.22);
        }
        t += dur;
      }

      // 鼓组
      t = 0;
      for (let i = 0; i < 32; i++) {
        const dur = S;
        if (kick[i]) this._playDrum("kick", offset + t, 0.3);
        if (snare[i]) this._playDrum("snare", offset + t, 0.22);
        if (hihat[i]) this._playDrum("hihat", offset + t, 0.15);
        t += dur;
      }
    }

    // 循环调度
    this._loopTimer = setTimeout(() => {
      this._scheduleBGM();
    }, (loopLength * 2 - 0.1) * 1000);
  }

  /** 停止 BGM */
  stopBGM() {
    this.bgmPlaying = false;
    if (this._loopTimer) {
      clearTimeout(this._loopTimer);
      this._loopTimer = null;
    }
  }

  // ========== 音效 ==========

  /** 建造防御塔音效 */
  sfxBuild() {
    if (!this._initialized) return;
    this.resume();
    const now = this.ctx.currentTime;
    this._sfxBeep([523.25, 659.25, 783.99], 0.06, "square", 0.2);
  }

  /** 升级音效 */
  sfxUpgrade() {
    if (!this._initialized) return;
    this.resume();
    this._sfxBeep([523.25, 659.25, 783.99, 1046.5], 0.08, "square", 0.18);
  }

  /** 出售音效 */
  sfxSell() {
    if (!this._initialized) return;
    this.resume();
    this._sfxBeep([783.99, 659.25, 523.25], 0.08, "triangle", 0.2);
  }

  /** 敌人死亡音效 */
  sfxKill() {
    if (!this._initialized) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.08);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** 开始新波次音效 */
  sfxWaveStart() {
    if (!this._initialized) return;
    this.resume();
    this._sfxBeep([440, 554.37, 659.25, 880], 0.1, "square", 0.15);
  }

  /** 胜利音效 */
  sfxWin() {
    if (!this._initialized) return;
    this.resume();
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    this._sfxBeep(notes, 0.15, "square", 0.18);
  }

  /** 失败音效 */
  sfxLose() {
    if (!this._initialized) return;
    this.resume();
    const notes = [440, 415.3, 392, 349.23, 329.63, 261.63];
    this._sfxBeep(notes, 0.2, "sawtooth", 0.15);
  }

  /** 金币不足音效 */
  sfxError() {
    if (!this._initialized) return;
    this.resume();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.setValueAtTime(150, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  /** 提前开波奖励音效 */
  sfxEarlyWave() {
    if (!this._initialized) return;
    this.resume();
    this._sfxBeep([880, 1108.73, 1318.51], 0.08, "square", 0.15);
  }

  /** 通用 beep 序列 */
  _sfxBeep(freqs, noteDuration, type = "square", volume = 0.2) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    freqs.forEach((f, i) => {
      this._playNote(f, now + i * noteDuration, noteDuration * 0.9, type, this.sfxGain, volume);
    });
  }
}

// 全局音频实例
const gameAudio = new GameAudio();
