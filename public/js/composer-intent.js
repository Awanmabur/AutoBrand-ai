(function () {
  function asArray(list) {
    return Array.prototype.slice.call(list || []);
  }

  function normalizeType(value) {
    const type = String(value || 'image').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (type === 'short' || type === 'short_video') return 'reel';
    if (['video', 'reel'].includes(type)) return type;
    if (['image', 'story'].includes(type)) return type;
    if (['text', 'article'].includes(type)) return type;
    if (['carousel', 'campaign'].includes(type)) return type;
    return 'image';
  }

  function parsePreset(value) {
    const preset = String(value || '').trim().toLowerCase();
    if (preset === 'video') return { kind: 'video', count: 1 };
    if (preset === 'text') return { kind: 'text', count: 0 };
    const match = preset.match(/^(image|carousel)-(\d)$/);
    if (!match) return { kind: 'image', count: 1 };
    const kind = match[1];
    const count = Math.max(kind === 'carousel' ? 2 : 1, Math.min(5, Number(match[2] || 1)));
    return { kind, count };
  }

  function mediaKindForCard(card) {
    const explicit = String(card.dataset.mediaType || '').toLowerCase();
    if (explicit.includes('video')) return 'video';
    if (explicit.includes('image')) return 'image';
    if (card.querySelector('video')) return 'video';
    if (card.querySelector('img')) return 'image';
    return 'other';
  }

  function optionKind(option) {
    return option.dataset.outputKind || parsePreset(option.value).kind;
  }

  function setSelectValue(select, value) {
    if (!select) return;
    const option = asArray(select.options).find((item) => item.value === value && !item.disabled && !item.hidden);
    if (option) select.value = value;
  }

  function setPostType(postTypeSelect, type) {
    if (!postTypeSelect) return;
    const available = asArray(postTypeSelect.options).map((option) => option.value);
    if (available.includes(type)) {
      postTypeSelect.value = type;
      return;
    }
    if (type === 'reel' && available.includes('video')) postTypeSelect.value = 'video';
    else if (type === 'story' && available.includes('image')) postTypeSelect.value = 'image';
    else if (available.includes('image')) postTypeSelect.value = 'image';
  }

  function syncExternalType(select, allowedTypes) {
    if (!select) return;
    const allowed = Array.isArray(allowedTypes) ? allowedTypes : [];
    select.disabled = !allowed.length;
    asArray(select.options).forEach((option) => {
      const value = String(option.value || '').toLowerCase();
      const isAllowed = !value || !allowed.length || allowed.includes(value);
      option.disabled = !isAllowed;
      option.hidden = !isAllowed;
    });
    if (allowed.length === 1) select.value = allowed[0];
    if (!allowed.length) select.value = '';
  }

  function closestField(input) {
    return input?.closest?.('label, .form-field, .field, .checkbox-row, .span-2') || null;
  }

  function showElement(element, visible) {
    if (!element) return;
    element.hidden = !visible;
    element.classList.toggle('intent-hidden', !visible);
    asArray(element.querySelectorAll('input, select, textarea, button')).forEach((input) => {
      input.disabled = !visible;
    });
  }

  function bindComposer(form) {
    if (!form || form.dataset.composerIntentBound === '1') return;
    const mediaPresetSelect = form.querySelector('[data-media-preset-select]') || form.querySelector('select[name="mediaPreset"]');
    const postTypeSelect = form.querySelector('[data-post-type-select]') || form.querySelector('select[name="type"]');
    if (!mediaPresetSelect && !postTypeSelect) return;
    form.dataset.composerIntentBound = '1';

    const imageCountSelect = form.querySelector('select[name="imageCount"], input[name="imageCount"]');
    const externalTypeSelect = form.querySelector('[data-common-external-type]') || form.querySelector('select[name="externalMediaType"]');
    const guidance = form.querySelector('[data-output-guidance]');
    const mediaNote = form.querySelector('[data-media-intent-note]');
    const generateImageInput = form.querySelector('input[name="generateImage"]');
    const externalMediaFields = asArray(form.querySelectorAll('textarea[name="externalMediaUrl"], input[name="externalMediaUrl"], input[name="externalMediaName"], select[name="externalMediaType"]'));
    const existingMediaSection = form.querySelector('[data-intent-section="existing-media"]');
    const aiMediaSection = form.querySelector('[data-intent-section="ai-media"]');
    const intentGroups = asArray(form.querySelectorAll('[data-intent-group]'));
    const mediaCards = asArray(form.querySelectorAll('.media-picker-card'));
    const mediaEmptyNote = form.querySelector('[data-intent-empty-note]');
    const externalUrlTitle = form.querySelector('[data-external-media-url-title]');
    const externalTypeLabel = form.querySelector('[data-external-media-type-label]') || closestField(externalTypeSelect);
    const mediaOutputLabel = mediaPresetSelect ? mediaPresetSelect.closest('label') : null;

    function applyIntent(source) {
      let type = normalizeType(postTypeSelect?.value || 'image');
      const preset = parsePreset(mediaPresetSelect?.value || 'image-1');

      if (source === 'preset') {
        if (preset.kind === 'video') type = 'video';
        else if (preset.kind === 'carousel') type = 'carousel';
        else if (preset.kind === 'text') type = 'text';
        else if (['video', 'reel', 'carousel', 'text', 'article'].includes(type)) type = 'image';
      }

      let allowedMediaTypes = ['image'];
      let allowedOptionKinds = ['image'];
      let selectedPreset = mediaPresetSelect?.value || 'image-1';
      let mediaLabel = 'Image output: only image assets, image URLs and image generation controls are shown.';
      let showImageTools = true;
      let showVideoTools = false;
      let count = Math.max(1, Math.min(5, Number(imageCountSelect?.value || preset.count || 1)));

      if (['video', 'reel'].includes(type)) {
        selectedPreset = 'video';
        count = 1;
        allowedMediaTypes = ['video'];
        allowedOptionKinds = ['video'];
        mediaLabel = 'Video output: only video media, video URLs, video fields and AI video controls are shown.';
        showImageTools = false;
        showVideoTools = true;
      } else if (type === 'carousel') {
        count = Math.max(2, Math.min(5, Number(imageCountSelect?.value || preset.count || 3)));
        selectedPreset = `carousel-${count}`;
        allowedMediaTypes = ['image'];
        allowedOptionKinds = ['carousel'];
        mediaLabel = `Carousel output: only image slides are shown. ${count} slides will be generated or selected.`;
        showImageTools = true;
        showVideoTools = false;
      } else if (['text', 'article'].includes(type)) {
        selectedPreset = 'text';
        count = 0;
        allowedMediaTypes = [];
        allowedOptionKinds = ['text'];
        mediaLabel = 'Text output: all upload, image, video and media override controls are hidden.';
        showImageTools = false;
        showVideoTools = false;
      } else {
        count = Math.max(1, Math.min(5, Number(imageCountSelect?.value || (preset.kind === 'image' ? preset.count : 1))));
        selectedPreset = `image-${count}`;
        allowedMediaTypes = ['image'];
        allowedOptionKinds = ['image'];
        mediaLabel = `${count} image output: only image assets, image URLs and image generation controls are shown.`;
        showImageTools = true;
        showVideoTools = false;
      }

      setPostType(postTypeSelect, type);
      if (mediaPresetSelect) {
        asArray(mediaPresetSelect.options).forEach((option) => {
          const allowed = allowedOptionKinds.includes(optionKind(option));
          option.disabled = !allowed;
          option.hidden = !allowed;
        });
        setSelectValue(mediaPresetSelect, selectedPreset);
      }
      if (imageCountSelect) {
        imageCountSelect.value = String(count || 1);
        imageCountSelect.disabled = count === 0 || showVideoTools;
        showElement(imageCountSelect.closest('label'), showImageTools && type !== 'video' && type !== 'reel');
      }
      if (mediaOutputLabel) mediaOutputLabel.dataset.activeOutputKind = allowedOptionKinds.join(' ');
      if (generateImageInput) {
        generateImageInput.disabled = !showImageTools;
        generateImageInput.value = showImageTools ? 'on' : '';
      }
      syncExternalType(externalTypeSelect, allowedMediaTypes);
      const mediaFieldsAllowed = allowedMediaTypes.length > 0;
      externalMediaFields.forEach((field) => {
        field.disabled = !mediaFieldsAllowed;
        const wrapper = closestField(field);
        if (wrapper) showElement(wrapper, mediaFieldsAllowed);
        if (mediaFieldsAllowed && field.name === 'externalMediaUrl') {
          field.placeholder = allowedMediaTypes.includes('video')
            ? 'One public video URL per line'
            : 'One public image URL per line';
        }
      });
      showElement(existingMediaSection, mediaFieldsAllowed);
      showElement(externalTypeLabel, allowedMediaTypes.length > 1);
      showElement(aiMediaSection, showImageTools || showVideoTools);
      intentGroups.forEach((group) => {
        const kinds = String(group.dataset.intentGroup || '').split(/[\s,]+/).filter(Boolean);
        const hasMediaKind = kinds.some((kind) => ['image', 'video'].includes(kind));
        const visible = kinds.some((kind) => (kind === 'image' && showImageTools) || (kind === 'video' && showVideoTools)) || !hasMediaKind;
        showElement(group, visible);
      });
      let visibleMediaCards = 0;
      mediaCards.forEach((card) => {
        const checkbox = card.querySelector('input[type="checkbox"]');
        const kind = mediaKindForCard(card);
        const brandVisible = card.dataset.brandFiltered !== 'hidden';
        const allowed = allowedMediaTypes.length > 0 && allowedMediaTypes.includes(kind);
        const visible = allowed && brandVisible;
        card.classList.toggle('is-disabled-by-intent', !allowed);
        card.hidden = !visible;
        if (visible) visibleMediaCards += 1;
        if (checkbox) {
          checkbox.disabled = !visible;
          if (!allowed) checkbox.checked = false;
        }
      });
      if (mediaEmptyNote) {
        mediaEmptyNote.hidden = Boolean(!mediaFieldsAllowed || visibleMediaCards);
        mediaEmptyNote.textContent = mediaFieldsAllowed
          ? `No uploaded ${allowedMediaTypes.join(' or ')} media matches this format. Use a URL or generate matching media.`
          : 'Media is disabled for text-only formats.';
      }
      if (externalUrlTitle) externalUrlTitle.textContent = allowedMediaTypes.includes('video') ? 'Video URL' : allowedMediaTypes.includes('image') ? 'Image URL' : 'Media URL';
      if (guidance) guidance.textContent = mediaLabel;
      if (mediaNote) mediaNote.textContent = mediaLabel;
      form.dispatchEvent(new CustomEvent('composer:intentchange', {
        bubbles: true,
        detail: { type, mediaPreset: selectedPreset, allowedMediaTypes, count }
      }));
    }

    postTypeSelect?.addEventListener('change', () => applyIntent('type'));
    mediaPresetSelect?.addEventListener('change', () => applyIntent('preset'));
    imageCountSelect?.addEventListener('change', () => applyIntent('count'));
    form.addEventListener('composer:brandfilter', () => applyIntent('brandfilter'));
    applyIntent('init');
  }

  function init(root) {
    const scope = root || document;
    const forms = asArray(scope.querySelectorAll('form'));
    if (scope.tagName === 'FORM') forms.push(scope);
    forms.forEach(bindComposer);
  }

  window.AutoBrandComposerIntent = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document));
  } else {
    init(document);
  }
})();
