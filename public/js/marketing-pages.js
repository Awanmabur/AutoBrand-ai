/* Accessible marketing navigation and theme for secondary public pages.
   The homepage keeps its approved inline behavior; this script only runs
   on the standalone marketing-information pages. */
(() => {
  'use strict';
  const nav = document.getElementById('nav');
  const menu = document.getElementById('navLinks');
  const toggle = document.getElementById('mobileToggle');
  if (!nav || !menu || !toggle) return;

  const themeButtons = [...document.querySelectorAll('.theme-toggle')];
  let saved = null;
  try { saved = localStorage.getItem('classicAutobrandTheme'); } catch (_) { /* storage unavailable */ }
  let prefersDark = false;
  try { prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { /* unsupported */ }
  if (saved === 'dark' || (!saved && prefersDark)) document.body.classList.add('dark-mode');

  function syncTheme() {
    const dark = document.body.classList.contains('dark-mode');
    for (const button of themeButtons) {
      button.textContent = dark ? '☀' : '☾';
      button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  for (const button of themeButtons) button.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    try { localStorage.setItem('classicAutobrandTheme', document.body.classList.contains('dark-mode') ? 'dark' : 'light'); }
    catch (_) { /* storage unavailable */ }
    syncTheme();
  });
  syncTheme();

  function setMenu(open) {
    nav.classList.toggle('open', open);
    toggle.textContent = open ? '✕' : '☰';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
  toggle.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
  for (const link of menu.querySelectorAll('a')) {
    link.addEventListener('click', () => setMenu(false));
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  document.addEventListener('click', event => {
    if (nav.classList.contains('open') && !nav.contains(event.target)) setMenu(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980 && nav.classList.contains('open')) setMenu(false);
  });

  const current = window.location.pathname.replace(/\/+$/, '') || '/';
  for (const link of [...menu.querySelectorAll('a'), ...document.querySelectorAll('footer a')]) {
    const href = link.getAttribute('href');
    if (href && href === current) link.setAttribute('aria-current', 'page');
  }
})();
