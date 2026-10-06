// Site scripts

// Layout grid overlay: press G to show/hide the 12 columns (handy for checking alignment
// against the Figma grid). Ignored while typing in a field.
(() => {
  let overlay = null;
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'g' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (overlay) {
      overlay.remove();
      overlay = null;
      return;
    }
    overlay = document.createElement('div');
    overlay.className = 'grid-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const columns = getComputedStyle(document.documentElement).getPropertyValue('--grid-columns').trim() || 12;
    overlay.innerHTML = `<div class="container grid">${'<span></span>'.repeat(Number(columns))}</div>`;
    document.body.appendChild(overlay);
  });
})();
