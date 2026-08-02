// ===================================================================
// FantaSanRocco — I DISEGNI dei simboli della slot
// -------------------------------------------------------------------
// Due livelli, e si devono vedere diversi a colpo d'occhio:
//   BASSI  lettere piatte e colorate, senza cornice — 10 J Q K A
//   ALTI   figure dentro una cornice colorata
// È la distinzione delle slot vere: quando esce una figura in cornice
// sai subito che vale, senza dover leggere la tabella.
//
// Sta in un modulo e non in un partial EJS perché una funzione definita
// dentro un partial NON esce da quel partial: l'include gira in uno
// scope suo. Il progetto per questo usa gli helper globali (icon,
// initials), e questo si aggancia allo stesso modo.
// ===================================================================

const LETTERE = {
  dieci: { txt: '10', col: '#f3c64b' },
  jack:  { txt: 'J',  col: '#c98bff' },
  donna: { txt: 'Q',  col: '#5ad1ff' },
  re:    { txt: 'K',  col: '#ff8ad1' },
  asso:  { txt: 'A',  col: '#ff5a3c' },
};

// Cornice di ogni figura: più sale il valore, più la cornice è calda.
const CORNICI = {
  percoca: '#2e6b4f', vino: '#5a2f6b', braciola: '#6b3a2e',
  fuoco:   '#8a4a12', sanrocco: '#8a6a12',
  jolly:   '#1d4f7a', cane: '#7a1d3d',
};

const FIGURE = {
  percoca:
    '<ellipse cx="16" cy="18" rx="9" ry="9.5" fill="#f3a93a"/>' +
    '<path d="M16 9 q-3 6 0 18" stroke="#d4801f" stroke-width="1.5" fill="none"/>' +
    '<ellipse cx="12.5" cy="14.5" rx="2.8" ry="1.9" fill="#ffd98c" opacity=".7"/>' +
    '<path d="M15 8 q5 -3 8 0 q-4 3 -8 1 z" fill="#4faa3a"/>',
  vino:
    '<rect x="11" y="6" width="10" height="3" rx="1.2" fill="#caa24a"/>' +
    '<path d="M11 9 h10 l-1.2 4 q4.2 2.2 4.2 8 a8 8 0 0 1 -16 0 q0 -5.8 4.2 -8 z" fill="#b5643c"/>' +
    '<path d="M9.5 18 a7.5 8 0 0 0 15 0 q-1 -3.4 -3.2 -4.4 h-8.6 q-2.2 1 -3.2 4.4 z" fill="#7a1d22"/>',
  braciola:
    '<path d="M11 11 q-4 4 -2.5 9 q3 6 11 5 q8 -1 8 -7.5 q0 -6 -7 -8 q-6 -1.5 -10 1.5 z" fill="#9a5236"/>' +
    '<path d="M12.5 13 q-3 3 -1.5 7 q2.5 5 9 4.5 q6 -.5 6 -5.5 q0 -5 -6 -6.5 q-5 -1.2 -7.5 .5 z" fill="#c0734f"/>' +
    '<circle cx="8.5" cy="11" r="3" fill="#f0e8d6"/>',
  fuoco:
    '<g stroke-width="2.2" stroke-linecap="round">' +
    '<line x1="16" y1="16" x2="16" y2="5" stroke="#ff5a3c"/><line x1="16" y1="16" x2="24" y2="8" stroke="#f5c842"/>' +
    '<line x1="16" y1="16" x2="27" y2="16" stroke="#5ad1ff"/><line x1="16" y1="16" x2="24" y2="24" stroke="#7bff9a"/>' +
    '<line x1="16" y1="16" x2="16" y2="27" stroke="#ff8ad1"/><line x1="16" y1="16" x2="8" y2="24" stroke="#f5c842"/>' +
    '<line x1="16" y1="16" x2="5" y2="16" stroke="#ff5a3c"/><line x1="16" y1="16" x2="8" y2="8" stroke="#5ad1ff"/>' +
    '</g><circle cx="16" cy="16" r="2.6" fill="#fff7d0"/>',
  sanrocco:
    '<ellipse cx="16" cy="5.5" rx="7.5" ry="2.4" fill="none" stroke="#f5c842" stroke-width="2"/>' +
    '<path d="M11 20 h10 l1 7 h-12 z" fill="#9a6b3b"/>' +
    '<path d="M9 13 q0 -6 7 -6 q7 0 7 6 q0 2 -1 3 h-12 q-1 -1 -1 -3 z" fill="#6b4f2c"/>' +
    '<rect x="11.5" y="10.5" width="9" height="9.5" rx="3.2" fill="#e8c49a"/>' +
    '<path d="M10.5 12 q5.5 -3.2 11 0 v-1.4 q-5.5 -3.6 -11 0 z" fill="#5a4326"/>' +
    '<rect x="13.3" y="14" width="1.5" height="2.2" rx=".6" fill="#3a2c18"/>' +
    '<rect x="17.2" y="14" width="1.5" height="2.2" rx=".6" fill="#3a2c18"/>',
  // Il jolly è la conchiglia del pellegrino: il segno di chi cammina.
  jolly:
    '<path d="M16 26 q-9 -4 -10 -12 q-.4 -3 2 -3 q2 0 2.6 2.4 q.6 -3.4 2.8 -3.4 q2 0 2.6 3 ' +
    'q.6 -3 2.6 -3 q2.2 0 2.8 3.4 q.6 -2.4 2.6 -2.4 q2.4 0 2 3 q-1 8 -10 12 z" fill="#e8dcc0"/>' +
    '<path d="M16 26 q0 -12 0 -15" stroke="#b8ab8c" stroke-width="1.2" fill="none"/>' +
    '<path d="M16 26 q-5 -6 -6.6 -12" stroke="#b8ab8c" stroke-width="1" fill="none"/>' +
    '<path d="M16 26 q5 -6 6.6 -12" stroke="#b8ab8c" stroke-width="1" fill="none"/>',
  // Il cane: quello che nella tradizione portava il pane a San Rocco.
  cane:
    '<ellipse cx="17" cy="20" rx="8" ry="5.5" fill="#c98a4b"/>' +
    '<path d="M22 21 q4 -1 5 2 q-3 1 -5 0 z" fill="#c98a4b"/>' +
    '<circle cx="10" cy="15" r="5" fill="#d99a5b"/>' +
    '<path d="M6 12 q-2 -3 0 -4 q2 0 3 3 z" fill="#a86f38"/>' +
    '<circle cx="8.5" cy="14" r="1.1" fill="#2a1c10"/>' +
    '<ellipse cx="5.8" cy="16" rx="1.6" ry="1.2" fill="#2a1c10"/>' +
    '<rect x="11" y="24" width="2" height="3" fill="#a86f38"/>' +
    '<rect x="20" y="24" width="2" height="3" fill="#a86f38"/>' +
    '<path d="M12 18 h6 v3 h-6 z" fill="#e8c98a"/>',
};

// Torna il pezzo di HTML del simbolo. Le chiavi arrivano da giochi/slot.js.
function simboloSlot(k) {
  const L = LETTERE[k];
  if (L) {
    return `<span class="sl-sym sl-sym-basso" data-sym="${k}" style="color:${L.col}">${L.txt}</span>`;
  }
  const figura = FIGURE[k];
  if (!figura) return '';
  const bordo = CORNICI[k] || '#333';
  return `<span class="sl-sym sl-sym-alto" data-sym="${k}" style="--cornice:${bordo}">`
       + `<svg viewBox="0 0 32 32" aria-hidden="true">${figura}</svg></span>`;
}

module.exports = { simboloSlot, LETTERE, CORNICI, FIGURE };
