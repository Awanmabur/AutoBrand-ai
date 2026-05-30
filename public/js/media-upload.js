(function () {
  const form = document.querySelector('#cloudinary-upload-form');
  const status = document.querySelector('#upload-status');

  if (!form || !status) return;

  function mediaKind(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'document';
    return 'other';
  }

  async function saveAsset({ formData, uploaded, file }) {
    const body = new URLSearchParams();
    body.set('_csrf', formData.get('_csrf'));
    body.set('brand', formData.get('brand'));
    body.set('fileName', file.name);
    body.set('fileUrl', uploaded.secure_url);
    body.set('publicId', uploaded.public_id);
    body.set('fileType', mediaKind(file.type));
    body.set('mimeType', file.type || 'application/octet-stream');
    body.set('size', String(file.size || uploaded.bytes || 0));
    body.set('folder', uploaded.folder || 'cloudinary');
    body.set('tags', formData.get('tags') || '');
    if (formData.get('consentRequired')) body.set('consentRequired', 'on');

    await fetch('/media/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'Preparing upload...';

    const formData = new FormData(form);
    const file = formData.get('asset');

    if (!file || !file.name) {
      status.textContent = 'Choose a file first.';
      return;
    }

    try {
      const signatureResponse = await fetch(`/media/signature?brand=${encodeURIComponent(formData.get('brand'))}`);
      const signature = await signatureResponse.json();

      if (!signature.configured) {
        status.textContent = 'Cloudinary is not configured. Add a URL below instead.';
        return;
      }

      status.textContent = 'Uploading to Cloudinary...';

      const uploadData = new FormData();
      uploadData.set('file', file);
      uploadData.set('api_key', signature.apiKey);
      uploadData.set('timestamp', signature.timestamp);
      uploadData.set('folder', signature.folder);
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
      status.textContent = 'Upload complete. Refreshing...';
      window.location.href = '/media';
    } catch (error) {
      status.textContent = error.message || 'Upload failed.';
    }
  });
})();
