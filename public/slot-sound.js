/* ===================================================================
   FantaSanRocco — Suoni della Slot «Tombola di San Rocco»
   Tutto sintetizzato con Web Audio API: nessun file mp3 da scaricare,
   nessuna licenza da gestire, pesa zero KB extra. Espone window.SlotSound
   con: tick(), reelStop(i), win(), jackpot(), click(), toggleMute().
   L'AudioContext parte solo al primo gesto utente (richiesto dai browser).
   =================================================================== */
(function () {
  'use strict';
  const KEY = 'fsr.slotMuted';
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) {}

  let ctx = null;
  function getCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }
  function ensureRunning() {
    const c = getCtx();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
    return c;
  }

  // Un breve "blip" (oscillatore + inviluppo). freq in Hz, dur in secondi.
  function blip(freq, dur, opts) {
    if (muted) return;
    const c = ensureRunning();
    if (!c) return;
    opts = opts || {};
    const t0 = c.currentTime + (opts.delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.toFreq) osc.frequency.exponentialRampToValueAtTime(opts.toFreq, t0 + dur);
    const peak = opts.vol != null ? opts.vol : 0.14;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Rumore breve (per il "clack" meccanico dei rulli che si fermano)
  function clack(vol) {
    if (muted) return;
    const c = ensureRunning();
    if (!c) return;
    const dur = 0.09;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 900; filt.Q.value = 0.9;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol != null ? vol : 0.35, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(filt).connect(gain).connect(c.destination);
    src.start();
  }

  // ── API pubblica ──────────────────────────────────────────────────
  const SlotSound = {
    // Click leggero sui pulsanti (puntata, gira)
    click() { blip(520, 0.05, { type: 'square', vol: 0.08 }); },

    // Ticking ritmico durante la rotazione: chiamare a intervalli mentre gira.
    tick() { blip(760, 0.045, { type: 'square', vol: 0.05 }); },

    // Un rullo si ferma: "clack" meccanico + nota che scende
    reelStop(index) {
      clack(0.28);
      blip(320 - index * 30, 0.12, { type: 'triangle', toFreq: 180 - index * 20, vol: 0.1, delay: 0.02 });
    },

    // Vincita (coppia/tris): arpeggio ascendente breve e brillante
    win() {
      if (muted) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        blip(f, 0.16, { type: 'triangle', vol: 0.13, delay: i * 0.09 });
      });
    },

    // Jackpot: fanfara più ricca e prolungata
    jackpot() {
      if (muted) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      notes.forEach((f, i) => {
        blip(f, 0.26, { type: 'sawtooth', vol: 0.11, delay: i * 0.1 });
        blip(f * 2, 0.18, { type: 'sine', vol: 0.05, delay: i * 0.1 });
      });
    },

    // Puntata insufficiente / errore: due note basse e secche
    error() {
      blip(220, 0.14, { type: 'square', vol: 0.09 });
      blip(160, 0.18, { type: 'square', vol: 0.09, delay: 0.12 });
    },

    isMuted() { return muted; },
    setMuted(v) {
      muted = !!v;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) {}
    },
    toggleMute() { this.setMuted(!muted); return muted; },
    // Da chiamare dentro il primo click utente, per sbloccare l'AudioContext su iOS/Safari
    unlock() { ensureRunning(); },
  };

  window.SlotSound = SlotSound;
})();
