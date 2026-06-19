/* ===================================================================
   FantaSanRocco — Cinematic Hero (motore animazioni)
   Ricreazione nativa dell'effetto: intro testi → card che sale a tutto
   schermo → iPhone 3D parallax col mouse → badge → CTA finale.
   Richiede GSAP + ScrollTrigger (caricati via CDN prima di questo file).
   Se GSAP manca o l'utente preferisce poco movimento → versione statica.
   =================================================================== */
(function () {
  const root = document.querySelector(".cine");
  if (!root) return;

  const prefersReduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);

  // Fallback: nessuna animazione → mostra tutto in versione statica.
  function goStatic() {
    root.classList.add("cine--static");
  }

  if (!hasGSAP || prefersReduced) {
    goStatic();
    return;
  }

  const gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);

  const metricValue = parseInt(root.dataset.metric || "105", 10);
  const q = (sel) => root.querySelector(sel);

  const mainCard = q(".main-card");
  const mockup = q(".iphone");
  let raf = 0;

  // 1. Parallax del telefono + luce dinamica sulla card (requestAnimationFrame)
  function onMouseMove(e) {
    if (window.scrollY > window.innerHeight * 2) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!mainCard || !mockup) return;
      const rect = mainCard.getBoundingClientRect();
      mainCard.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
      mainCard.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);

      const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
      const yVal = (e.clientY / window.innerHeight - 0.5) * 2;
      gsap.to(mockup, {
        rotationY: xVal * 12,
        rotationX: -yVal * 12,
        ease: "power3.out",
        duration: 1.2,
      });
    });
  }
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  // 2. Timeline cinematografica con pin sullo scroll
  const isMobile = window.innerWidth < 768;

  let ctx;
  try {
  ctx = gsap.context(() => {
    // Il testo hero è VISIBILE già dal primo frame (autoAlpha:1): così anche
    // un tab in background — dove requestAnimationFrame è in pausa — non
    // resta mai bianco. L'intro anima solo trasformazioni.
    gsap.set(".text-track", { autoAlpha: 1, y: 60, scale: 0.85, filter: "blur(20px)", rotationX: -20 });
    gsap.set(".text-days", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
    gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
    gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge", ".phone-widget"], { autoAlpha: 0 });
    gsap.set(".cta-wrapper", { autoAlpha: 0, scale: 0.8, filter: "blur(30px)" });

    const introTl = gsap.timeline({ delay: 0.3 });
    introTl
      .to(".text-track", { duration: 1.8, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
      .to(".text-days", { duration: 1.4, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=1.0");

    const scrollTl = gsap.timeline({
      scrollTrigger: {
        trigger: root,
        start: "top top",
        end: "+=7000",
        pin: true,
        scrub: 1,
        anticipatePin: 1,
      },
    });

    scrollTl
      .to([".hero-text-wrapper", ".bg-grid-theme"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 2 }, 0)
      .to(".main-card", { y: 0, ease: "power3.inOut", duration: 2 }, 0)
      .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })
      .fromTo(".mockup-scroll-wrapper",
        { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
        { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.5 }, "-=0.8"
      )
      .fromTo(".phone-widget", { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.5 }, "-=1.5")
      .to(".progress-ring", { strokeDashoffset: 60, duration: 2, ease: "power3.inOut" }, "-=1.2")
      .to(".counter-val", { innerHTML: metricValue, snap: { innerHTML: 1 }, duration: 2, ease: "expo.out" }, "-=2.0")
      .fromTo(".floating-badge", { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.5, stagger: 0.2 }, "-=2.0")
      .fromTo(".card-left-text", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.5 }, "-=1.5")
      .fromTo(".card-right-text", { x: 50, autoAlpha: 0, scale: 0.8 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.5 }, "<")
      .to({}, { duration: 2.5 })
      .set(".hero-text-wrapper", { autoAlpha: 0 })
      .set(".cta-wrapper", { autoAlpha: 1 })
      .to({}, { duration: 1.5 })
      .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
        scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 1.2, stagger: 0.05,
      })
      .to(".main-card", {
        width: isMobile ? "92vw" : "85vw",
        height: isMobile ? "92vh" : "85vh",
        borderRadius: isMobile ? "32px" : "40px",
        ease: "expo.inOut",
        duration: 1.8,
      }, "pullback")
      .to(".cta-wrapper", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.8 }, "pullback")
      .to(".main-card", { y: -window.innerHeight - 300, ease: "power3.in", duration: 1.5 });
  }, root);
  } catch (err) {
    // GSAP presente ma qualcosa è andato storto → versione statica, mai vuota
    if (ctx) ctx.revert();
    goStatic();
  }
})();
