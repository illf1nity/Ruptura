/* ============================================
   RUPTURA CUSTOMIZATION PANEL
   Gear icon in bottom-left corner toggles panel.
   Overrides CSS custom properties on :root.
   Persists to localStorage.
   ============================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'ruptura_custom_colors';

  var COLOR_GROUPS = [
    {
      label: 'Brand',
      tokens: [
        { prop: '--accent-gold', label: 'Gold (primary)', default: '#E8A633' },
        { prop: '--accent-gold-light', label: 'Gold light', default: '#F5C04D' },
        { prop: '--accent-gold-hover', label: 'Gold hover', default: '#D4A054' }
      ]
    },
    {
      label: 'Semantic',
      tokens: [
        { prop: '--gap-red', label: 'Gap red', default: '#E63946' },
        { prop: '--gap-red-card', label: 'Gap red (card)', default: '#F05454' },
        { prop: '--growth-green', label: 'Growth green', default: '#4A9B7F' }
      ]
    },
    {
      label: 'Layout',
      tokens: [
        { prop: '--bg-elevated', label: 'Header / Elevated', default: '#1E2430' },
        { prop: '--bg-surface', label: 'Content panels', default: '#161B24' }
      ]
    },
    {
      label: 'Text',
      tokens: [
        { prop: '--text-primary', label: 'Primary text', default: '#F0EDE8' },
        { prop: '--text-secondary', label: 'Secondary text', default: '#9CA3AF' }
      ]
    }
  ];

  var FONT_GROUPS = [
    {
      label: 'Typography',
      tokens: [
        {
          prop: '--font-display',
          label: 'Headings',
          default: "'Jura', 'Space Grotesk', 'Segoe UI', system-ui, sans-serif",
          options: [
            { value: "'Jura', 'Space Grotesk', 'Segoe UI', system-ui, sans-serif", label: 'Jura' },
            { value: "'Nirvana', 'Georgia', serif", label: 'Nirvana' },
            { value: "'Space Grotesk', 'Segoe UI', system-ui, sans-serif", label: 'Space Grotesk' },
            { value: "'Times New Roman', 'Times', serif", label: 'Times New Roman' },
            { value: "'Trajan Pro', 'Times New Roman', serif", label: 'Trajan Pro' },
            { value: "'Georgia', 'Cambria', serif", label: 'Georgia' },
            { value: "'Playfair Display', 'Georgia', serif", label: 'Playfair Display' },
            { value: "'Palatino Linotype', 'Book Antiqua', serif", label: 'Palatino' },
            { value: "'Trebuchet MS', 'Lucida Sans', sans-serif", label: 'Trebuchet MS' },
            { value: "'Impact', 'Arial Black', sans-serif", label: 'Impact' }
          ]
        },
        {
          prop: '--font-body',
          label: 'Body text',
          default: "'Jura', 'Inter', 'Segoe UI', system-ui, sans-serif",
          options: [
            { value: "'Jura', 'Inter', 'Segoe UI', system-ui, sans-serif", label: 'Jura' },
            { value: "'Nirvana', 'Georgia', serif", label: 'Nirvana' },
            { value: "'Inter', 'Segoe UI', system-ui, sans-serif", label: 'Inter' },
            { value: "'Times New Roman', 'Times', serif", label: 'Times New Roman' },
            { value: "'Trajan Pro', 'Times New Roman', serif", label: 'Trajan Pro' },
            { value: "'Georgia', 'Cambria', serif", label: 'Georgia' },
            { value: "'Merriweather', 'Georgia', serif", label: 'Merriweather' },
            { value: "'Garamond', 'Times New Roman', serif", label: 'Garamond' },
            { value: "'Palatino Linotype', 'Book Antiqua', serif", label: 'Palatino' },
            { value: "'Verdana', 'Geneva', sans-serif", label: 'Verdana' }
          ]
        },
        {
          prop: '--font-data',
          label: 'Numbers',
          default: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
          options: [
            { value: "'JetBrains Mono', 'Consolas', 'Courier New', monospace", label: 'JetBrains Mono' },
            { value: "'Courier New', 'Courier', monospace", label: 'Courier New' },
            { value: "'Consolas', 'Monaco', monospace", label: 'Consolas' },
            { value: "'Monaco', 'Courier New', monospace", label: 'Monaco' },
            { value: "'Source Code Pro', 'Consolas', monospace", label: 'Source Code Pro' },
            { value: "'Lucida Console', 'Monaco', monospace", label: 'Lucida Console' }
          ]
        }
      ]
    }
  ];

  function loadSaved() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  }

  function saveAll(overrides) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides)); } catch (e) {}
  }

  function applyOverrides(overrides) {
    var root = document.documentElement;
    Object.keys(overrides).forEach(function (prop) {
      root.style.setProperty(prop, overrides[prop]);
    });
  }

  function clearOverrides() {
    var root = document.documentElement;
    COLOR_GROUPS.forEach(function (group) {
      group.tokens.forEach(function (token) {
        root.style.removeProperty(token.prop);
      });
    });
    FONT_GROUPS.forEach(function (group) {
      group.tokens.forEach(function (token) {
        root.style.removeProperty(token.prop);
      });
    });
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // Auto-apply saved overrides on every page load
  var savedOverrides = loadSaved();
  if (Object.keys(savedOverrides).length > 0) {
    applyOverrides(savedOverrides);
  }

  function buildUI() {
    var overrides = loadSaved();
    applyOverrides(overrides);

    // Inject styles
    var style = document.createElement('style');
    style.textContent = [
      '#cp-gear-btn {',
      '  position: fixed; bottom: 16px; left: 16px; z-index: 10000;',
      '  width: 44px; height: 44px; border-radius: 50%;',
      '  background: rgba(12,15,20,0.92); border: 1px solid rgba(212,160,84,0.3);',
      '  cursor: pointer; display: flex; align-items: center; justify-content: center;',
      '  box-shadow: 0 4px 16px rgba(0,0,0,0.4);',
      '  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);',
      '  transition: border-color 200ms ease, transform 200ms ease;',
      '}',
      '#cp-gear-btn:hover {',
      '  border-color: rgba(232,166,51,0.6); transform: scale(1.08);',
      '}',
      '#cp-gear-btn.active {',
      '  border-color: #E8A633; background: rgba(232,166,51,0.12);',
      '}',
      '#cp-gear-btn svg {',
      '  width: 22px; height: 22px; fill: none; stroke: #9CA3AF;',
      '  stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;',
      '  transition: stroke 200ms ease, transform 400ms ease;',
      '}',
      '#cp-gear-btn:hover svg { stroke: #E8A633; }',
      '#cp-gear-btn.active svg { stroke: #E8A633; transform: rotate(90deg); }',
      '#customize-panel {',
      '  position: fixed; bottom: 70px; left: 16px; z-index: 9999;',
      '  width: 260px; max-height: calc(100vh - 100px); overflow-y: auto;',
      '  background: rgba(12,15,20,0.96); border: 1px solid rgba(212,160,84,0.3);',
      '  border-radius: 12px; padding: 16px; font-family: Inter, system-ui, sans-serif;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.5); backdrop-filter: blur(12px);',
      '  -webkit-backdrop-filter: blur(12px);',
      '  transform: translateY(8px); opacity: 0; pointer-events: none;',
      '  transition: transform 200ms ease, opacity 200ms ease;',
      '}',
      '#customize-panel.cp-open {',
      '  transform: translateY(0); opacity: 1; pointer-events: auto;',
      '}',
      '#customize-panel .cp-title {',
      '  font-size: 13px; font-weight: 600; color: #E8A633;',
      '  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;',
      '}',
      '#customize-panel .cp-group-label {',
      '  font-size: 11px; font-weight: 600; color: #9CA3AF;',
      '  text-transform: uppercase; letter-spacing: 0.08em;',
      '  margin-top: 12px; margin-bottom: 6px;',
      '}',
      '#customize-panel .cp-row {',
      '  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;',
      '}',
      '#customize-panel .cp-swatch {',
      '  width: 28px; height: 28px; border: 2px solid rgba(255,255,255,0.15);',
      '  border-radius: 6px; cursor: pointer; padding: 0; flex-shrink: 0;',
      '  -webkit-appearance: none; appearance: none;',
      '}',
      '#customize-panel .cp-swatch::-webkit-color-swatch-wrapper { padding: 0; }',
      '#customize-panel .cp-swatch::-webkit-color-swatch { border: none; border-radius: 4px; }',
      '#customize-panel .cp-swatch::-moz-color-swatch { border: none; border-radius: 4px; }',
      '#customize-panel .cp-label {',
      '  font-size: 13px; color: #F0EDE8; flex: 1;',
      '}',
      '#customize-panel .cp-actions {',
      '  display: flex; gap: 8px; margin-top: 16px;',
      '}',
      '#customize-panel .cp-btn {',
      '  flex: 1; height: 32px; border: none; border-radius: 6px;',
      '  font-family: inherit; font-size: 12px; font-weight: 600;',
      '  cursor: pointer; transition: opacity 150ms;',
      '}',
      '#customize-panel .cp-btn:hover { opacity: 0.85; }',
      '#customize-panel .cp-btn-reset {',
      '  background: transparent; color: #9CA3AF; border: 1px solid #2A3040;',
      '}',
      '#customize-panel .cp-btn-close {',
      '  background: #E8A633; color: #0C0F14;',
      '}',
      '#customize-panel .cp-font-select {',
      '  width: 100%; padding: 6px 28px 6px 8px; border-radius: 6px;',
      '  background: rgba(22,27,36,0.8); border: 1px solid rgba(255,255,255,0.15);',
      '  color: #F0EDE8; font-size: 13px; cursor: pointer;',
      '  -webkit-appearance: none; appearance: none;',
      "  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239CA3AF' d='M6 9L1 4h10z'/%3E%3C/svg%3E\");",
      '  background-repeat: no-repeat; background-position: right 8px center;',
      '}',
      '#customize-panel .cp-font-select:hover {',
      '  border-color: rgba(232,166,51,0.4);',
      '}',
      '#customize-panel .cp-font-select:focus {',
      '  outline: 2px solid rgba(232,166,51,0.5); outline-offset: 1px;',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    // Build gear button
    var gearBtn = document.createElement('button');
    gearBtn.id = 'cp-gear-btn';
    gearBtn.setAttribute('aria-label', 'Customize colors');
    gearBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
    document.body.appendChild(gearBtn);

    // Build panel container (starts hidden)
    var panel = document.createElement('div');
    panel.id = 'customize-panel';

    // Title
    var title = document.createElement('div');
    title.className = 'cp-title';
    title.textContent = 'Customize';
    panel.appendChild(title);

    // Build color groups
    COLOR_GROUPS.forEach(function (group) {
      var groupLabel = document.createElement('div');
      groupLabel.className = 'cp-group-label';
      groupLabel.textContent = group.label;
      panel.appendChild(groupLabel);

      group.tokens.forEach(function (token) {
        var row = document.createElement('div');
        row.className = 'cp-row';

        var swatch = document.createElement('input');
        swatch.type = 'color';
        swatch.className = 'cp-swatch';
        swatch.value = overrides[token.prop] || token.default;
        swatch.setAttribute('data-prop', token.prop);

        swatch.addEventListener('input', function () {
          overrides[token.prop] = swatch.value;
          document.documentElement.style.setProperty(token.prop, swatch.value);
          saveAll(overrides);
        });

        var label = document.createElement('span');
        label.className = 'cp-label';
        label.textContent = token.label;

        row.appendChild(swatch);
        row.appendChild(label);
        panel.appendChild(row);
      });
    });

    // Build font groups (dropdowns)
    FONT_GROUPS.forEach(function (group) {
      var fontGroupLabel = document.createElement('div');
      fontGroupLabel.className = 'cp-group-label';
      fontGroupLabel.textContent = group.label;
      panel.appendChild(fontGroupLabel);

      group.tokens.forEach(function (token) {
        var row = document.createElement('div');
        row.className = 'cp-row';
        row.style.flexDirection = 'column';
        row.style.alignItems = 'flex-start';
        row.style.gap = '4px';

        var label = document.createElement('span');
        label.className = 'cp-label';
        label.textContent = token.label;

        var select = document.createElement('select');
        select.className = 'cp-font-select';
        select.setAttribute('data-prop', token.prop);

        token.options.forEach(function (opt) {
          var option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          option.style.fontFamily = opt.value;
          if ((overrides[token.prop] || token.default) === opt.value) {
            option.selected = true;
          }
          select.appendChild(option);
        });

        select.addEventListener('change', function () {
          overrides[token.prop] = select.value;
          document.documentElement.style.setProperty(token.prop, select.value);
          saveAll(overrides);
        });

        row.appendChild(label);
        row.appendChild(select);
        panel.appendChild(row);
      });
    });

    // Action buttons
    var actions = document.createElement('div');
    actions.className = 'cp-actions';

    var resetBtn = document.createElement('button');
    resetBtn.className = 'cp-btn cp-btn-reset';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', function () {
      clearOverrides();
      overrides = {};

      var swatches = panel.querySelectorAll('.cp-swatch');
      var idx = 0;
      COLOR_GROUPS.forEach(function (group) {
        group.tokens.forEach(function (token) {
          if (swatches[idx]) swatches[idx].value = token.default;
          idx++;
        });
      });

      var selects = panel.querySelectorAll('.cp-font-select');
      var selectIdx = 0;
      FONT_GROUPS.forEach(function (group) {
        group.tokens.forEach(function (token) {
          if (selects[selectIdx]) selects[selectIdx].value = token.default;
          selectIdx++;
        });
      });
    });

    var closeBtn = document.createElement('button');
    closeBtn.className = 'cp-btn cp-btn-close';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', function () {
      panel.classList.remove('cp-open');
      gearBtn.classList.remove('active');
    });

    actions.appendChild(resetBtn);
    actions.appendChild(closeBtn);
    panel.appendChild(actions);

    document.body.appendChild(panel);

    // Toggle panel on gear click
    gearBtn.addEventListener('click', function () {
      var isOpen = panel.classList.contains('cp-open');
      if (isOpen) {
        panel.classList.remove('cp-open');
        gearBtn.classList.remove('active');
      } else {
        panel.classList.add('cp-open');
        gearBtn.classList.add('active');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
