// Mini interazioni lato client (volutamente minimale).

// Evita doppio invio dei form: disabilita il bottone dopo il primo click.
document.addEventListener('submit', (e) => {
  const btn = e.target.querySelector('button[type=submit]');
  if (btn) {
    // piccolo ritardo così il form parte comunque
    setTimeout(() => { btn.disabled = true; btn.style.opacity = '.6'; }, 0);
  }
});

// Copia un link di invito negli appunti.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  const text = btn.getAttribute('data-copy');
  try {
    await navigator.clipboard.writeText(text);
    const old = btn.textContent;
    btn.textContent = 'Copiato!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  } catch (_) {
    // Fallback: seleziona il campo accanto così l'utente copia a mano
    const input = btn.closest('.invite-row').querySelector('.invite-link');
    if (input) { input.select(); }
    alert('Copia manualmente il link selezionato.');
  }
});
