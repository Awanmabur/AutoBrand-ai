(function () {
  function mediaKind(mimeType) {
    const type = mimeType || '';
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    if (type === 'application/pdf') return 'document';
    return 'other';
  }

  function findForms(root) {
    const scope = root || document;
    const forms = [];
    if (scope.matches?.('[data-cloudinary-upload-form], #cloudinary-upload-form')) forms.push(scope);
    scope.querySelectorAll?.('[data-cloudinary-upload-form], #cloudinary-upload-form').forEach((form) => forms.push(form));
    return forms;
  }

  function findStatus(form) {
    return form.querySelector('[data-upload-status]') || document.querySelector('#upload-status');
  }

  async function saveAsset({ formData, uploaded, file }) {
    const body = new URLSearchParams();
    body.set('_csrf', formData.get('_csrf') || '');
    body.set('brand', formData.get('brand') || '');
    body.set('fileName', file.name);
    body.set('fileUrl', uploaded.secure_url);
    body.set('publicId', uploaded.public_id);
    body.set('fileType', mediaKind(file.type));
    body.set('mimeType', file.type || 'application/octet-stream');
    body.set('size', String(file.size || uploaded.bytes || 0));
    body.set('folder', uploaded.folder || 'cloudinary');
    body.set('tags', formData.get('tags') || '');
    if (formData.get('consentRequired')) body.set('consentRequired', 'on');

    const response = await fetch('/dashboard/actions/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new Error('Upload saved to Cloudinary, but AutoBrand could not store it.');
    }
  }

  async function handleSubmit(event, form) {
    event.preventDefault();
    const status = findStatus(form);
    if (status) status.textContent = 'Preparing upload...';

    const formData = new FormData(form);
    const file = formData.get('asset');

    if (!file || !file.name) {
      if (status) status.textContent = 'Choose a file first.';
      return;
    }

    try {
      const brand = encodeURIComponent(formData.get('brand') || '');
      const signatureResponse = await fetch(`/dashboard/actions/media/signature?brand=${brand}`);
      if (!signatureResponse.ok) throw new Error('Could not prepare Cloudinary upload.');
      const signature = await signatureResponse.json();

      if (!signature.configured) {
        if (status) status.textContent = 'Cloudinary is not configured. Add a URL below instead.';
        return;
      }

      if (status) status.textContent = 'Uploading to Cloudinary...';

      const uploadData = new FormData();
      uploadData.set('file', file);
      uploadData.set('api_key', signature.apiKey);
      uploadData.set('timestamp', signature.timestamp);
      uploadData.set('folder', signature.folder);
      uploadData.set('allowed_formats', signature.allowedFormats || '');
      uploadData.set('signature', signature.signature);

      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, {
        method: 'POST',
        body: uploadData
      });

      if (!uploadResponse.ok) {
        throw new Error('Cloudinary upload failed.');
      }

      const uploaded = await uploadResponse.json();
      await saveAsset({ formData, uploaded, file });
      if (status) status.textContent = 'Upload complete. Refreshing...';
      window.location.href = '/dashboard/media';
    } catch (error) {
      if (status) status.textContent = error.message || 'Upload failed.';
    }
  }

  function bindForm(form) {
    if (!form || form.dataset.mediaUploadBound === 'true') return;
    form.dataset.mediaUploadBound = 'true';
    form.addEventListener('submit', (event) => handleSubmit(event, form));
  }

  function init(root) {
    findForms(root).forEach(bindForm);
  }

  window.AutoBrandMediaUploads = { init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document));
  } else {
    init(document);
  }
})();
