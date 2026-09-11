(() => {
  if (window.FLY_DIALOG) return;

  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const tx = (key, fallback) => {
    const translated = window.FLY_I18N?.t(key);
    return translated && translated !== key ? translated : fallback;
  };

  const openDialog = ({
    kicker = 'KẾ TOÁN',
    title,
    message = '',
    okLabel,
    cancelLabel,
    danger = false,
    bodyHtml = '',
    focusSelector = '#flyDialogOk',
    cancelValue = null,
    collect = () => true,
    validate
  } = {}) => new Promise(resolve => {
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'warehouse-modal-backdrop fly-dialog-backdrop';
    overlay.innerHTML = `<div class="warehouse-modal warehouse-confirm-modal fly-dialog-modal" role="dialog" aria-modal="true" aria-labelledby="flyDialogTitle" data-keep-native>
      <div class="warehouse-modal-heading">
        <div>
          <p class="warehouse-kicker">${esc(kicker)}</p>
          <h2 id="flyDialogTitle">${esc(title || tx('common.confirm', 'Xác nhận'))}</h2>
        </div>
        <button type="button" class="warehouse-icon-button close" aria-label="Đóng">×</button>
      </div>
      <div class="warehouse-modal-body">
        ${message ? `<p class="fly-dialog-lead">${esc(message)}</p>` : ''}
        ${bodyHtml}
        <p class="fly-dialog-error" id="flyDialogError" hidden></p>
      </div>
      <div class="warehouse-modal-actions">
        <button type="button" class="warehouse-secondary close">${esc(cancelLabel || tx('common.cancel', 'Hủy'))}</button>
        <button type="button" class="${danger ? 'warehouse-danger' : 'warehouse-primary'}" id="flyDialogOk">${esc(okLabel || tx('common.confirm', 'Xác nhận'))}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      overlay.remove();
      if (previous && typeof previous.focus === 'function') {
        try { previous.focus(); } catch { /* ignore */ }
      }
      resolve(value);
    };

    const showError = text => {
      const box = overlay.querySelector('#flyDialogError');
      if (!box) return;
      box.hidden = !text;
      box.textContent = text || '';
    };

    const submit = () => {
      const value = collect(overlay);
      const error = typeof validate === 'function' ? validate(value, overlay) : '';
      if (error) {
        showError(error);
        overlay.querySelector(focusSelector)?.focus();
        return;
      }
      finish(value);
    };

    overlay.querySelectorAll('.close').forEach(button => {
      button.addEventListener('click', () => finish(cancelValue));
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(cancelValue);
    });
    overlay.querySelector('#flyDialogOk').addEventListener('click', submit);
    overlay.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.repeat) return;
      if (event.target?.tagName === 'TEXTAREA') return;
      event.preventDefault();
      submit();
    });

    requestAnimationFrame(() => {
      const focusEl = overlay.querySelector(focusSelector) || overlay.querySelector('#flyDialogOk');
      focusEl?.focus();
      if (focusEl && typeof focusEl.select === 'function' && focusEl.tagName === 'INPUT' && focusEl.type !== 'radio' && focusEl.type !== 'date') {
        focusEl.select();
      }
    });
  });

  window.FLY_DIALOG = {
    confirm(options = {}) {
      return openDialog({
        ...options,
        cancelValue: false,
        collect: () => true
      });
    },
    prompt(options = {}) {
      const {
        label = '',
        placeholder = '',
        defaultValue = '',
        input = 'text',
        required = true,
        maxlength = 300
      } = options;
      const isArea = input === 'textarea';
      const extra = input === 'date' ? 'data-keep-native' : `maxlength="${Number(maxlength) || 300}"`;
      const field = isArea
        ? `<textarea id="flyDialogInput" rows="3" maxlength="${Number(maxlength) || 300}" placeholder="${esc(placeholder)}">${esc(defaultValue)}</textarea>`
        : `<input id="flyDialogInput" type="${esc(input)}" ${extra} placeholder="${esc(placeholder)}" value="${esc(defaultValue)}">`;
      return openDialog({
        ...options,
        cancelValue: null,
        focusSelector: '#flyDialogInput',
        bodyHtml: `<div class="warehouse-field"><label for="flyDialogInput">${esc(label || tx('common.choose', 'Nhập nội dung'))}${required ? ' *' : ''}</label>${field}</div>`,
        collect: overlay => String(overlay.querySelector('#flyDialogInput')?.value || '').trim(),
        validate: value => {
          if (required && !value) return 'Vui lòng nhập nội dung.';
          if (input === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Hạn mới phải đúng định dạng ngày.';
          return '';
        }
      });
    },
    choose(options = {}) {
      const list = Array.isArray(options.options) ? options.options : [];
      const selected = options.defaultValue || list[0]?.value || list[0] || '';
      const bodyHtml = `<div class="fly-dialog-choices">${list.map((item, index) => {
        const value = item.value ?? item;
        const label = item.label || item.value || item;
        const hint = item.hint ? `<small>${esc(item.hint)}</small>` : '';
        const checked = String(value) === String(selected) || (!options.defaultValue && index === 0) ? ' checked' : '';
        return `<label class="fly-dialog-choice"><input type="radio" name="flyDialogChoice" value="${esc(value)}"${checked}><span><strong>${esc(label)}</strong>${hint}</span></label>`;
      }).join('')}</div>`;
      return openDialog({
        ...options,
        cancelValue: null,
        focusSelector: 'input[name="flyDialogChoice"]:checked',
        bodyHtml,
        collect: overlay => overlay.querySelector('input[name="flyDialogChoice"]:checked')?.value || '',
        validate: value => value ? '' : 'Chọn một phương thức.'
      });
    }
  };
})();
