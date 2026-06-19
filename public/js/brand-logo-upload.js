(function () {
  function bySelector(root, selector) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function getCsrf(form) {
    return form?.querySelector('input[name="_csrf"]')?.value || '';
  }

  function fieldFor(form, selector, key) {
    return form.querySelector(`${selector}="${key}"]`) || form.querySelector(selector.replace('$', key));
  }

  function updateStatus(form, key, message) {
    const status = form.querySelector(`[data-brand-upload-status="${key}"]`);
    if (status) status.textContent = message;
  }

  function updatePreview(form, key, url, fileType) {
    const preview = form.querySelector(`[data-brand-upload-preview="${key}"]`);
    if (!preview) return;
    if (!url || fileType === 'video') {
      preview.hidden = true;
      preview.removeAttribute('src');
      return;
    }
    preview.src = url;
    preview.hidden = false;
  }

  function resourceTypeFor(file) {
    if (file.type && file.type.startsWith('video/')) return 'video';
    if (file.type && file.type.startsWith('image/')) return 'image';
    return 'auto';
  }

  function assetTypeForUpload(key, file) {
    if (['logo', 'favicon', 'cover'].includes(key)) return key;
    if (file.type && file.type.startsWith('image/')) return 'image';
    if (file.type && file.type.startsWith('video/')) return 'video';
    if (file.type === 'application/pdf') return 'document';
    return 'other';
  }

  async function loadSignature(form) {
    const uploadScope = form.querySelector('[data-brand-upload-form][data-brand-id]') || form;
    const brandId = form.dataset.brandId || uploadScope.dataset.brandId || form.querySelector('[name="brand"]')?.value || '';
    const brandName = form.querySelector('[name="name"]')?.value || 'new-brand';
    const query = brandId ? `brand=${encodeURIComponent(brandId)}` : `brandName=${encodeURIComponent(brandName)}`;
    const response = await fetch(`/dashboard/actions/media/signature?${query}`, {
      headers: { 'X-CSRF-Token': getCsrf(form) }
    });
    if (!response.ok) throw new Error('Could not prepare upload.');
    return response.json();
  }

  async function uploadFile(file, signature) {
    if (!signature.configured) {
      throw new Error('Cloudinary is not configured. Add Cloudinary keys, then choose the file again.');
    }
    const resourceType = resourceTypeFor(file);
    const formData = new FormData();
    formData.set('file', file);
    formData.set('api_key', signature.apiKey);
    formData.set('timestamp', signature.timestamp);
    formData.set('folder', signature.folder);
    formData.set('signature', signature.signature);

    const upload = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/${resourceType}/upload`, {
      method: 'POST',
      body: formData
    });
    if (!upload.ok) throw new Error('Upload failed.');
    return upload.json();
  }

  function updateDefaultAsset(form, key, uploaded, file) {
    const urlInput = form.querySelector(`[data-brand-upload-url="${key}"]`) || form.querySelector(`[name="${key === 'cover' ? 'coverImage' : key}"]`);
    const publicIdName = key === 'cover' ? 'coverImagePublicId' : `${key}PublicId`;
    const publicIdInput = form.querySelector(`[data-brand-upload-public-id="${key}"]`) || form.querySelector(`[name="${publicIdName}"]`);
    if (urlInput) urlInput.value = uploaded.secure_url || uploaded.url || '';
    if (publicIdInput) publicIdInput.value = uploaded.public_id || '';
    updatePreview(form, key, uploaded.secure_url || uploaded.url || '', assetTypeForUpload(key, file));
  }

  function appendBrandAsset(form, uploaded, file, key) {
    const input = form.querySelector('[data-brand-upload-assets]') || form.querySelector('[name="assetUploadsJson"]');
    if (!input) return;
    let assets = [];
    try {
      assets = JSON.parse(input.value || '[]');
      if (!Array.isArray(assets)) assets = [];
    } catch (error) {
      assets = [];
    }
    assets.push({
      type: assetTypeForUpload(key, file),
      title: file.name,
      url: uploaded.secure_url || uploaded.url || '',
      publicId: uploaded.public_id || '',
      mimeType: file.type || uploaded.resource_type || '',
      sizeBytes: file.size || uploaded.bytes || 0
    });
    input.value = JSON.stringify(assets);
  }

  async function handleFiles(form, input) {
    const key = input.dataset.brandUploadFile || 'asset';
    const files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return;

    try {
      updateStatus(form, key, files.length > 1 ? `Preparing ${files.length} uploads...` : 'Preparing upload...');
      const signature = await loadSignature(form);
      for (const file of files) {
        updateStatus(form, key, `Uploading ${file.name}...`);
        const uploaded = await uploadFile(file, signature);
        if (['logo', 'favicon', 'cover'].includes(key)) {
          updateDefaultAsset(form, key, uploaded, file);
        } else {
          appendBrandAsset(form, uploaded, file, key);
        }
      }
      updateStatus(form, key, files.length > 1 ? `${files.length} assets uploaded.` : 'Upload ready. Save the Brand Brain to keep it.');
    } catch (error) {
      updateStatus(form, key, error.message || 'Upload failed.');
    }
  }

  function bindForm(form) {
    if (!form || form.dataset.brandUploadBound === '1') return;
    form.dataset.brandUploadBound = '1';
    bySelector(form, '[data-brand-upload-file]').forEach((input) => {
      input.addEventListener('change', () => handleFiles(form, input));
    });
  }

  function init(root) {
    const scope = root || document;
    const forms = bySelector(scope, 'form[data-brand-upload-form]');
    bySelector(scope, '[data-brand-upload-file]').forEach((input) => {
      const form = input.closest('form');
      if (form && !forms.includes(form)) forms.push(form);
    });
    forms.forEach(bindForm);
  }

  window.AutoBrandBrandUploads = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document));
  } else {
    init(document);
  }
})();
