(function registerDmControls() {
  if (!window.customElements) return;

  if (!customElements.get('dm-select')) {
    class DMSelect extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: block; }
          select {
            width: 100%;
            height: 30px;
            box-sizing: border-box;
            border: 1px solid var(--dm-border, #8c8c8c);
            background: #fff;
            color: var(--dm-text, #1a1a1a);
            padding: 3px 30px 3px 8px;
            font: inherit;
            border-radius: 3px;
            appearance: none;
            -webkit-appearance: none;
            background-image:
              linear-gradient(45deg, transparent 50%, #333 50%),
              linear-gradient(135deg, #333 50%, transparent 50%),
              linear-gradient(#fff, #fff);
            background-position:
              calc(100% - 16px) calc(50% - 2px),
              calc(100% - 10px) calc(50% - 2px),
              100% 0;
            background-size: 6px 6px, 6px 6px, 2.2em 100%;
            background-repeat: no-repeat;
          }
          select:focus {
            outline: 1px solid var(--dm-focus, #70a470);
            outline-offset: 0;
          }
        `;
        this._select = document.createElement('select');
        this._select.addEventListener('change', () => {
          this.dispatchEvent(new Event('change', { bubbles: true }));
        });
        root.appendChild(style);
        root.appendChild(this._select);
      }
      setOptions(values) {
        this._select.innerHTML = '';
        (Array.isArray(values) ? values : []).forEach((value) => {
          const option = document.createElement('option');
          if (value && typeof value === 'object') {
            option.value = String(value.value ?? '');
            option.textContent = String(value.label ?? value.value ?? '');
          } else {
            option.value = String(value);
            option.textContent = String(value);
          }
          this._select.appendChild(option);
        });
      }
      get value() { return this._select.value; }
      set value(next) { this._select.value = String(next ?? ''); }
    }
    customElements.define('dm-select', DMSelect);
  }

  if (!customElements.get('dm-checkbox')) {
    class DMCheckbox extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = `
          :host { display: inline-block; }
          label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            user-select: none;
            color: var(--dm-text, #1a1a1a);
          }
          .box {
            --checkbox-border-color: #8c8c8c;
            display: inline-block;
            width: 14px;
            height: 14px;
            position: relative;
            background-color: #fff;
            border: 1px solid var(--checkbox-border-color);
            border-radius: 0.1em;
            box-sizing: border-box;
            overflow: visible;
            flex: 0 0 auto;
          }
          .box[aria-checked="true"] {
            background-color: var(--checkbox-color, #70a470);
            border-color: var(--checkbox-border-color);
          }
          .box[data-fill="false"][aria-checked="true"] {
            background-color: #fff;
          }
          .checkmark {
            width: 100%;
            height: 100%;
            overflow: visible;
            pointer-events: none;
          }
          .tick-mark {
            display: none;
          }
          .box[aria-checked="true"] .tick-mark {
            display: block;
          }
          .box:focus {
            outline: 1px solid var(--dm-focus, #70a470);
            outline-offset: 1px;
          }
        `;
        const label = document.createElement('label');
        this._box = document.createElement('span');
        this._box.className = 'box';
        this._box.setAttribute('role', 'checkbox');
        this._box.setAttribute('tabindex', '0');
        this._box.setAttribute('aria-checked', 'false');
        this._box.dataset.fill = String(this.getAttribute('fill') !== 'false');
        this._box.style.setProperty('--checkbox-color', this.getAttribute('color') || '#70a470');
        this._box.style.setProperty('--checkbox-border-color', this.getAttribute('borderColor') || '#8c8c8c');

        const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('class', 'checkmark');
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', 'M15 35 L48 80 L95 -35');
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '14');
        path.setAttribute('fill', 'none');
        path.setAttribute('class', 'tick-mark');
        svg.appendChild(path);
        this._box.appendChild(svg);

        this._text = document.createElement('span');
        this._text.textContent = this.getAttribute('label') || '';
        label.appendChild(this._box);
        label.appendChild(this._text);
        root.appendChild(style);
        root.appendChild(label);

        const toggle = () => { this.checked = !this.checked; };
        label.addEventListener('click', (event) => {
          event.preventDefault();
          toggle();
        });
        this._box.addEventListener('keydown', (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            toggle();
          }
        });
      }
      connectedCallback() {
        if (this.hasAttribute('label')) this._text.textContent = this.getAttribute('label') || '';
        if (this.hasAttribute('color')) this._box.style.setProperty('--checkbox-color', this.getAttribute('color') || '#70a470');
        if (this.hasAttribute('borderColor')) this._box.style.setProperty('--checkbox-border-color', this.getAttribute('borderColor') || '#8c8c8c');
        if (this.hasAttribute('fill')) this._box.dataset.fill = String(this.getAttribute('fill') !== 'false');
        if (this.hasAttribute('checked')) this.checked = this.getAttribute('checked') !== 'false';
      }
      get checked() { return this._box.getAttribute('aria-checked') === 'true'; }
      set checked(next) {
        const prev = this.checked;
        const isChecked = !!next;
        this._box.setAttribute('aria-checked', isChecked ? 'true' : 'false');
        if (prev !== isChecked) this.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    customElements.define('dm-checkbox', DMCheckbox);
  }
})();
