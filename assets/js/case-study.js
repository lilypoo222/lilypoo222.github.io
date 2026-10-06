// Case study pages: the sticky chapter rail marks the chapter you're reading (aria-current="true",
// shown in the nav blue). A chapter counts as "current" once its top passes 40% down the window.
(() => {
  const links = [...document.querySelectorAll('.cs-rail a')];
  const chapters = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!chapters.length) return;

  function update() {
    const line = window.innerHeight * 0.4;
    let current = -1;
    chapters.forEach((ch, i) => {
      if (ch.getBoundingClientRect().top <= line) current = i;
    });
    links.forEach((a, i) => {
      if (i === current) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
