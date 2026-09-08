(() => {
  document.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-manual-import-file]');
    if (!input || !input.files || !input.files[0]) return;
    const form = input.closest('[data-manual-import-form]');
    const target = form && form.querySelector('[data-manual-import-data]');
    if (!target) return;
    const file = input.files[0];
    if (file.size > 1024 * 1024) {
      input.setCustomValidity('CSV files are limited to 1 MB.');
      input.reportValidity();
      target.value = '';
      return;
    }
    input.setCustomValidity('');
    target.value = await file.text();
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-manual-import-form]');
    if (!form) return;
    const input = form.querySelector('[data-manual-import-file]');
    const data = form.querySelector('[data-manual-import-data]');
    if (!input?.files?.[0] || !String(data?.value || '').trim()) {
      event.preventDefault();
      input?.setCustomValidity('Choose a readable CSV file before importing.');
      input?.reportValidity();
    }
  });
})();
