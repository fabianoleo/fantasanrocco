/* ===================================================================
   FantaSanRocco — Logo 3D della prima schermata (intro)
   Three.js (UMD, self-hosted) + GLTFLoader. Carica il logo .glb,
   lo fa ruotare lentamente, fluttuare e — allo scroll — inclinare e
   rimpicciolire. Fallback testuale se WebGL/modello non disponibili.
   Nessuno script inline (CSP scriptSrc 'self').
   =================================================================== */
(function () {
  const screen = document.getElementById('introScreen');
  if (!screen) return;
  const canvas = document.getElementById('introCanvas');
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fallback() { screen.classList.add('is-fallback'); }

  // Niente Three.js o niente WebGL → fallback elegante
  if (!window.THREE || !canvas || !window.WebGLRenderingContext) { fallback(); return; }

  const THREE = window.THREE;
  const stage = canvas.parentElement;
  let renderer, scene, camera, pivot, model, raf = 0, running = false;
  const t0 = performance.now();
  let scrollProg = 0;

  function dims() { return { w: Math.max(1, stage.clientWidth), h: Math.max(1, stage.clientHeight) }; }

  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fallback(); return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  let d = dims();
  renderer.setSize(d.w, d.h, false);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, d.w / d.h, 0.1, 100);
  camera.position.set(0, 0, 5);

  // Luci morbide, ambiente scuro con tocco verde + oro (premium, leggero).
  // Intensità moderate: il colore arriva dalle texture, niente sovraesposizione.
  scene.add(new THREE.HemisphereLight(0xdfeccb, 0x0a1f14, 0.55));
  const key = new THREE.DirectionalLight(0xfff1c4, 1.35); key.position.set(3, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xf3c64b, 0.45); fill.position.set(-3, 2, 4); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x66ff9e, 0.65); rim.position.set(-4, -1, -4); scene.add(rim);

  pivot = new THREE.Group();
  scene.add(pivot);

  const loader = new THREE.GLTFLoader();

  function onModel(gltf) {
    model = gltf.scene;
    // Centra e scala il modello per riempire bene lo stage senza coprire i testi
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar(2.3 / maxDim);
    pivot.add(model);
    canvas.classList.add('is-ready');
    onScroll();
    if (prefersReduced) { renderFrame(performance.now()); } else { startLoop(); }
  }
  function onErr(err) { try { console.warn('intro3d: modello non caricato', err); } catch (e) {} fallback(); stopLoop(); }

  // Forza il TextureLoader classico invece di ImageBitmapLoader: su Chrome il
  // path ImageBitmap delle texture glTF può fallire → logo BIANCO (su Safari/
  // mobile invece usa già TextureLoader, quindi lì esce colorato). Disabilito
  // createImageBitmap SOLO nell'istante sincrono in cui GLTFLoader crea il parser
  // (che sceglie il loader), poi ripristino subito → nessun effetto collaterale.
  fetch(canvas.dataset.model)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then((buf) => {
      const _cib = window.createImageBitmap;
      try { window.createImageBitmap = undefined; } catch (e) {}
      try { loader.parse(buf, '', onModel, onErr); }
      finally { try { window.createImageBitmap = _cib; } catch (e) {} }
    })
    .catch(onErr);

  function updatePivot(now) {
    if (!pivot) return;
    const t = (now - t0) / 1000;
    let floatY = 0;
    if (!prefersReduced) {
      pivot.rotation.y += 0.005;                 // rotazione lenta e continua su Y
      floatY = Math.sin(t * 1.1) * 0.08;         // leggera oscillazione verticale (floating)
    }
    const p = scrollProg;                        // 0 in cima → 1 dopo ~una schermata
    pivot.rotation.x = p * 0.55;                 // si inclina leggermente scrollando
    pivot.scale.setScalar(1 - p * 0.35);         // e si rimpicciolisce in modo fluido
    pivot.position.y = floatY - p * 0.35;
  }

  function renderFrame(now) { updatePivot(now); renderer.render(scene, camera); }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    renderFrame(now);
  }
  function startLoop() { if (running || prefersReduced) return; running = true; raf = requestAnimationFrame(loop); }
  function stopLoop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  // Scroll: progresso normalizzato su ~una schermata
  function onScroll() {
    const vh = window.innerHeight || 1;
    scrollProg = Math.min(1, Math.max(0, window.scrollY / (vh * 0.9)));
    if (prefersReduced && model) renderFrame(performance.now());  // aggiorna anche in modalità statica
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // Resize responsive del canvas
  function onResize() {
    d = dims();
    camera.aspect = d.w / d.h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(d.w, d.h, false);
    if (prefersReduced && model) renderFrame(performance.now());
  }
  window.addEventListener('resize', onResize, { passive: true });

  // Mette in pausa il loop quando la sezione esce dallo schermo (performance/batteria)
  if ('IntersectionObserver' in window && !prefersReduced) {
    const io = new IntersectionObserver((entries) => {
      const vis = entries[0] && entries[0].isIntersecting;
      if (vis) { if (model) startLoop(); } else { stopLoop(); }
    }, { threshold: 0.01 });
    io.observe(screen);
  }
})();
