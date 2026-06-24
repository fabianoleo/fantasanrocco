/* =====================================================================
   LOGIN — interazioni: mostra/nascondi password + sfondo a particelle
   (scintille dorate che salgono, come braci della festa).
   Nessuno script inline → compatibile con la CSP (script-src 'self').
   ===================================================================== */
(function () {
  'use strict';

  // ── Mostra / nascondi password ────────────────────────────────────
  var eye = document.getElementById('lfEye');
  var pwd = document.getElementById('password');
  if (eye && pwd) {
    eye.addEventListener('click', function () {
      var show = pwd.type === 'password';
      pwd.type = show ? 'text' : 'password';
      eye.classList.toggle('is-on', show);
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
      pwd.focus();
    });
  }

  // ── Sfondo a particelle ───────────────────────────────────────────
  var canvas = document.getElementById('loginParticles');
  if (!canvas || !canvas.getContext) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  var ctx = canvas.getContext('2d');
  var stage = canvas.parentElement;
  var particles = [];
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = 0, h = 0;
  var raf = null;

  function size() {
    var rect = stage.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
  }

  function build() {
    var count = Math.min(70, Math.floor((w * h) / 16000));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(spawn(true));
  }

  function spawn(initial) {
    return {
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      r: Math.random() * 2 + 0.6,
      vy: -(Math.random() * 0.35 + 0.12),
      vx: (Math.random() - 0.5) * 0.25,
      a: Math.random() * 0.5 + 0.15,
      tw: Math.random() * Math.PI * 2
    };
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.tw += 0.03;
      var alpha = p.a * (0.6 + 0.4 * Math.sin(p.tw));
      if (p.y < -10 || p.x < -10 || p.x > w + 10) {
        particles[i] = spawn(false);
        continue;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(245, 200, 66, ' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(size, 150);
  });

  // Sospende l'animazione quando la scheda non è visibile
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    } else if (!raf) {
      raf = requestAnimationFrame(frame);
    }
  });

  size();
  raf = requestAnimationFrame(frame);
})();
