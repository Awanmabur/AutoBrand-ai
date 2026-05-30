(function themeBoot() {
  const key = 'autobrand-theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(key);
  if (saved) root.dataset.theme = saved;

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-theme-toggle]');
    if (!button) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem(key, next);
  });
})();
