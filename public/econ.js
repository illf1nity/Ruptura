/* ============================================
   RUPTURA ECONOMIC EXPERIENCE — econ.js
   Loads content.json, populates DOM, handles
   form submission, API calls, animations,
   download/share, and Phase 3 interactions.
   ============================================ */

(function () {
  'use strict';

  // ------------------------------------
  // STATE
  // ------------------------------------
  let content = null;       // loaded from content.json
  let resultsData = null;   // aggregated API responses
  let formValues = {};      // raw form values at submit time
  let html2canvasLoaded = false;

  // Poster logo (loaded lazily on first poster generation)
  var posterLogo = null;
  var posterLogoLoading = null;

  function ensurePosterLogo() {
    if (posterLogo) return Promise.resolve(posterLogo);
    if (posterLogoLoading) return posterLogoLoading;
    posterLogoLoading = new Promise(function(resolve) {
      var img = new Image();
      img.onload = function() { posterLogo = img; resolve(img); };
      img.onerror = function() { posterLogo = false; resolve(null); };
      img.src = 'ruptura_logo.svg?v=3';
    });
    return posterLogoLoading;
  }

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Progressive commitment ladder state
  var commitmentState = { download: false, share: false, negotiate: false };

  // SVG icon templates for cost translator
  var COST_ICONS = {
    rent: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    food: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    healthcare: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
  };

  var COST_LABELS = {
    rent: 'rent',
    food: 'groceries',
    healthcare: 'healthcare'
  };

  // ------------------------------------
  // INDEFINITE ARTICLE HELPER — "a" vs "an"
  // ------------------------------------
  function indefiniteArticle(word) {
    if (!word) return 'a';
    var lowerWord = word.trim().toLowerCase();
    var firstChar = lowerWord[0];
    // Edge cases: words that sound like they start with a vowel but don't
    var anExceptions = ['hour', 'honest', 'honor', 'heir', 'herb'];
    var aExceptions = ['university', 'united', 'unique', 'uniform', 'union',
                        'universal', 'useful', 'usual', 'utensil', 'european', 'one'];
    for (var i = 0; i < anExceptions.length; i++) {
      if (lowerWord.startsWith(anExceptions[i])) return 'an';
    }
    for (var i = 0; i < aExceptions.length; i++) {
      if (lowerWord.startsWith(aExceptions[i])) return 'a';
    }
    return 'aeiou'.indexOf(firstChar) !== -1 ? 'an' : 'a';
  }

  // ------------------------------------
  // TAX ESTIMATION — progressive federal brackets + state income tax
  // Sources: IRS Rev. Proc. 2024-40 (2025 brackets), Tax Foundation state rates
  // ------------------------------------
  var FEDERAL_BRACKETS = [
    { limit: 11925, rate: 0.10 },
    { limit: 48475, rate: 0.12 },
    { limit: 103350, rate: 0.22 },
    { limit: 197300, rate: 0.24 },
    { limit: 250525, rate: 0.32 },
    { limit: 626350, rate: 0.35 },
    { limit: Infinity, rate: 0.37 }
  ];

  // Effective state income tax rates (top marginal simplified to effective)
  // Source: Tax Foundation 2025 state individual income tax rates
  // States with no income tax: 0. Others: approximate effective rate for
  // a median-income worker (accounts for brackets, standard deductions).
  var STATE_TAX_RATES = {
    'AK': 0, 'FL': 0, 'NV': 0, 'NH': 0, 'SD': 0, 'TN': 0, 'TX': 0, 'WA': 0, 'WY': 0,
    'AL': 0.040, 'AZ': 0.025, 'AR': 0.039, 'CA': 0.065, 'CO': 0.044,
    'CT': 0.050, 'DE': 0.048, 'DC': 0.065, 'GA': 0.049, 'HI': 0.064,
    'ID': 0.058, 'IL': 0.0495, 'IN': 0.0305, 'IA': 0.044, 'KS': 0.046,
    'KY': 0.040, 'LA': 0.030, 'ME': 0.058, 'MD': 0.050, 'MA': 0.050,
    'MI': 0.0425, 'MN': 0.068, 'MS': 0.047, 'MO': 0.048, 'MT': 0.059,
    'NE': 0.056, 'NJ': 0.055, 'NM': 0.049, 'NY': 0.060, 'NC': 0.045,
    'ND': 0.0195, 'OH': 0.035, 'OK': 0.0475, 'OR': 0.080, 'PA': 0.0307,
    'RI': 0.0475, 'SC': 0.044, 'UT': 0.0465, 'VT': 0.060, 'VA': 0.0475,
    'WV': 0.052, 'WI': 0.053
  };

  function estimateFederalTax(income) {
    var tax = 0;
    var prev = 0;
    for (var i = 0; i < FEDERAL_BRACKETS.length; i++) {
      var bracket = FEDERAL_BRACKETS[i];
      var taxable = Math.min(income, bracket.limit) - prev;
      if (taxable <= 0) break;
      tax += taxable * bracket.rate;
      prev = bracket.limit;
    }
    // FICA: Social Security 6.2% (up to $176,100) + Medicare 1.45%
    var ss = Math.min(income, 176100) * 0.062;
    var medicare = income * 0.0145;
    return Math.round(tax + ss + medicare);
  }

  function estimateTotalTax(income, stateCode) {
    var federal = estimateFederalTax(income);
    var stateRate = (stateCode && STATE_TAX_RATES[stateCode] !== undefined)
      ? STATE_TAX_RATES[stateCode]
      : 0.045; // national median effective rate as fallback
    var stateTax = Math.round(income * stateRate);
    return federal + stateTax;
  }

  // ------------------------------------
  // SCREEN READER ANNOUNCEMENTS
  // ------------------------------------
  function announce(message) {
    var el = document.getElementById('sr-announcements');
    if (!el) return;
    el.textContent = message;
    setTimeout(function() { el.textContent = ''; }, 3000);
  }

  // ------------------------------------
  // INIT
  // ------------------------------------
  async function init() {
    try {
      const resp = await fetch('content.json');
      content = await resp.json();
    } catch (e) {
      // Fallback: read inline JSON embedded in econ.html (works on file:// protocol)
      var inlineData = document.getElementById('content-data');
      if (inlineData) {
        try {
          content = JSON.parse(inlineData.textContent);
        } catch (parseErr) {
          console.error('Failed to parse inline content', parseErr);
          return;
        }
      } else {
        console.error('Failed to load content.json', e);
        return;
      }
    }
    applyMeta();
    renderOpening();
    renderForm();
    renderLoadingAndError();
    renderResultsShell();
    renderPhase3aShell();
    renderPhase3bShell();
    renderPhase3cShell();
    renderWinsShell();
    renderPhase3dShell();
    renderDownloadCard();
    bindEvents();
    initScrollObserver();
    initHeader();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ------------------------------------
  // META
  // ------------------------------------
  function applyMeta() {
    document.title = content.meta.title;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', content.meta.description);
  }

  // ------------------------------------
  // OPENING STATEMENT
  // ------------------------------------
  function renderOpening() {
    const container = document.getElementById('opening');
    content.opening.lines.forEach((line, i) => {
      if (line.type === 'pause') {
        const div = document.createElement('div');
        div.className = 'visual-pause';
        div.setAttribute('aria-hidden', 'true');
        container.appendChild(div);
        return;
      }
      const p = document.createElement('p');
      p.className = line.type === 'reveal' ? 'opening-reveal' : 'opening-line';
      p.setAttribute('data-index', i);
      if (line.type === 'welcome') p.classList.add('opening-welcome');
      if (line.type === 'prompt') p.classList.add('opening-prompt');
      p.textContent = line.text;
      container.appendChild(p);
    });
  }

  // ------------------------------------
  // FORM
  // ------------------------------------
  function renderForm() {
    const fields = content.form.fields;

    Object.keys(fields).forEach(key => {
      const labelEl = document.querySelector('[data-label="' + key + '"]');
      if (labelEl) labelEl.textContent = fields[key].label;

      const inputEl = document.getElementById(key);
      if (inputEl && fields[key].placeholder) {
        inputEl.setAttribute('placeholder', fields[key].placeholder);
      }

      // Populate select elements from content.json options (supports optgroup)
      if (inputEl && inputEl.tagName === 'SELECT' && fields[key].options) {
        inputEl.innerHTML = '';
        fields[key].options.forEach(function(opt) {
          if (opt.optgroup && opt.options) {
            var group = document.createElement('optgroup');
            group.label = opt.optgroup;
            opt.options.forEach(function(subOpt) {
              var option = document.createElement('option');
              option.value = subOpt.value;
              option.textContent = subOpt.label;
              group.appendChild(option);
            });
            inputEl.appendChild(group);
          } else if (opt.value !== undefined) {
            var option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            inputEl.appendChild(option);
          }
        });
      }

      const errorEl = document.querySelector('[data-error="' + key + '"]');
      if (errorEl) errorEl.textContent = fields[key].error;
    });

    document.getElementById('submit-btn').textContent = content.form.submit_text;

    var privacyText = document.getElementById('privacy-note-text');
    if (privacyText) privacyText.textContent = content.form.privacy_note;
  }

  // ------------------------------------
  // LOADING / ERROR
  // ------------------------------------
  function renderLoadingAndError() {
    document.getElementById('loading-text').textContent = content.loading.text;
    document.getElementById('error-heading').textContent = content.error.heading;
    document.getElementById('error-body').textContent = content.error.body;
    document.getElementById('retry-btn').textContent = content.error.button;
  }

  // ------------------------------------
  // RESULTS CARD SHELL
  // ------------------------------------
  function renderResultsShell() {
    document.getElementById('card-label').textContent = content.results.card_label;
    document.getElementById('download-btn-text').textContent = content.results.download_text;
    document.getElementById('share-btn-text').textContent = content.results.share_text;
    document.getElementById('breakdown-trigger-text').textContent = 'See Full Breakdown';
    // Populate CTA button text from content.json
    var collectBtnText = document.getElementById('collect-btn-text');
    if (collectBtnText) collectBtnText.textContent = content.phase3d.negotiation.button;
  }

  // ------------------------------------
  // PHASE 3A SHELL — stat cards
  // ------------------------------------
  function renderPhase3aShell() {
    var container = document.getElementById('stat-cards-container');
    var phase3aSection = document.getElementById('phase3a');
    var reframe = document.getElementById('reframe-statement');

    // All stat cards shown directly — no expand button
    for (var i = 0; i < content.phase3a.stats.length; i++) {
      var card = document.createElement('div');
      card.className = 'stat-card';
      card.appendChild(createStatCardContent(content.phase3a.stats[i]));
      container.appendChild(card);
    }

    reframe.textContent = content.phase3a.reframe;
    phase3aSection.appendChild(reframe);
  }

  function createStatCardContent(stat) {
    var frag = document.createDocumentFragment();
    var highlight = document.createElement('span');
    highlight.className = 'stat-highlight';
    highlight.textContent = stat.number;
    var text = document.createElement('p');
    text.className = 'stat-text';
    text.textContent = stat.text;
    var source = document.createElement('small');
    source.className = 'source';
    source.textContent = stat.source;
    frag.appendChild(highlight);
    frag.appendChild(text);
    frag.appendChild(source);
    return frag;
  }

  // ------------------------------------
  // PHASE 3B SHELL — validation blocks
  // ------------------------------------
  function renderPhase3bShell() {
    var container = document.getElementById('validation-container');
    var phase3bSection = document.getElementById('phase3b');

    // First validation Q&A: always visible
    var firstBlock = content.phase3b.blocks[0];
    container.appendChild(createValidationBlock(firstBlock));

    // Expand button + collapsible container for remaining blocks
    var btn = createExpandButton('validation-expand', 'validation-expandable', 'Have more questions?');
    var expandable = document.createElement('div');
    expandable.className = 'section-expandable';
    expandable.id = 'validation-expandable';

    for (var i = 1; i < content.phase3b.blocks.length; i++) {
      expandable.appendChild(createValidationBlock(content.phase3b.blocks[i]));
    }

    phase3bSection.appendChild(btn);
    phase3bSection.appendChild(expandable);
  }

  function createValidationBlock(block) {
    var div = document.createElement('div');
    div.className = 'validation-block';
    var question = document.createElement('p');
    question.className = 'validation-question';
    question.textContent = block.question;
    var answer = document.createElement('p');
    answer.className = 'validation-answer';
    answer.textContent = block.answer;
    div.appendChild(question);
    div.appendChild(answer);
    return div;
  }

  // ------------------------------------
  // PHASE 3C SHELL
  // ------------------------------------
  function renderPhase3cShell() {
    document.getElementById('raise-heading').textContent = content.phase3c.raise_heading;
    document.getElementById('bar-label-current').textContent = content.phase3c.bar_labels.current;
    document.getElementById('bar-label-projected').textContent = content.phase3c.bar_labels.projected;

    const projContainer = document.getElementById('projection-cards');
    content.phase3c.projection_periods.forEach(period => {
      const card = document.createElement('div');
      card.className = 'projection-card';
      card.innerHTML =
        '<div class="projection-period">' + escapeHtml(period) + '</div>' +
        '<div class="projection-value" data-period="' + escapeHtml(period) + '">--</div>';
      projContainer.appendChild(card);
    });

  }

  // ------------------------------------
  // WINS SECTION — Collective action proof
  // ------------------------------------
  function renderWinsShell() {
    document.getElementById('wins-label').textContent = content.wins.label;
    document.getElementById('wins-heading').textContent = content.wins.heading;
    var winsContainer = document.getElementById('wins-container');
    var winsSection = document.getElementById('wins-section');

    // All win cards shown directly — no expand button
    for (var i = 0; i < content.wins.items.length; i++) {
      winsContainer.appendChild(createWinCard(content.wins.items[i]));
    }
  }

  function createWinCard(win) {
    var card = document.createElement('div');
    card.className = 'win-card';
    var accent = document.createElement('div');
    accent.className = 'win-accent';
    var body = document.createElement('div');
    body.className = 'win-body';
    var text = document.createElement('p');
    text.className = 'win-text';
    text.textContent = win.text;
    var source = document.createElement('small');
    source.className = 'source';
    source.textContent = win.source;
    body.appendChild(text);
    body.appendChild(source);
    card.appendChild(accent);
    card.appendChild(body);
    return card;
  }

  // ------------------------------------
  // PHASE 3D SHELL — Progressive Commitment Ladder
  // ------------------------------------
  function renderPhase3dShell() {
    var d = content.phase3d;
    document.getElementById('action-heading').textContent = d.heading;

    var phase3dSection = document.getElementById('phase3d');
    var closingLine = document.getElementById('closing-line');

    var ladder = document.createElement('div');
    ladder.className = 'commitment-ladder';
    ladder.id = 'commitment-ladder';

    // Step 1: Save Your Numbers (Download)
    var step1 = createCommitmentStep(1, 'Save Your Numbers', 'download');
    var downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-primary btn-full-width';
    downloadBtn.id = 'ladder-download-btn';
    downloadBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
      '<span>' + escapeHtml(content.results.download_text) + '</span>';
    step1.querySelector('.step-content').appendChild(downloadBtn);
    ladder.appendChild(step1);

    // Step 2: Show Someone (Share)
    var step2 = createCommitmentStep(2, 'Show Someone', 'share');
    var shareBtn = document.createElement('button');
    shareBtn.className = 'btn-secondary btn-full-width';
    shareBtn.id = 'share-btn-bottom';
    shareBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>' +
      '<span id="share-bottom-text">' + escapeHtml(d.share.button) + '</span>';
    var shareDesc = document.createElement('p');
    shareDesc.className = 'action-description';
    shareDesc.textContent = d.share.description;
    step2.querySelector('.step-content').appendChild(shareBtn);
    step2.querySelector('.step-content').appendChild(shareDesc);
    ladder.appendChild(step2);

    // Step 3: Get Your Script (Negotiation)
    var step3 = createCommitmentStep(3, 'Get Your Script', 'negotiate');
    var negBtn = document.createElement('button');
    negBtn.className = 'btn-primary btn-full-width';
    negBtn.id = 'negotiation-btn';
    negBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>' +
      '<span id="negotiation-btn-text">' + escapeHtml(d.negotiation.button) + '</span>';
    var negDesc = document.createElement('p');
    negDesc.className = 'action-description';
    negDesc.textContent = d.negotiation.description;
    var scriptContent = document.createElement('div');
    scriptContent.className = 'script-content';
    scriptContent.id = 'script-content';
    var scriptInner = document.createElement('div');
    scriptInner.className = 'script-inner';
    scriptInner.id = 'script-inner';
    scriptContent.appendChild(scriptInner);
    step3.querySelector('.step-content').appendChild(negBtn);
    step3.querySelector('.step-content').appendChild(negDesc);
    step3.querySelector('.step-content').appendChild(scriptContent);
    ladder.appendChild(step3);

    // Step 4: Talk to Workers (Forum — coming soon)
    var step4 = createCommitmentStep(4, 'Talk to Workers', 'forum');
    var forumCard = document.createElement('div');
    forumCard.className = 'forum-card';
    forumCard.innerHTML =
      '<h3 class="forum-heading">' + escapeHtml(d.forum.heading) + '</h3>' +
      '<p class="forum-body">' + escapeHtml(d.forum.body) + '</p>';
    var forumBtn = document.createElement('button');
    forumBtn.className = 'btn-primary btn-inline-link btn-disabled';
    forumBtn.textContent = d.forum.button;
    forumBtn.disabled = true;
    forumCard.appendChild(forumBtn);
    step4.querySelector('.step-content').appendChild(forumCard);
    ladder.appendChild(step4);

    // Insert ladder before closing line
    if (closingLine) {
      closingLine.textContent = d.closing;
      phase3dSection.insertBefore(ladder, closingLine);
    } else {
      phase3dSection.appendChild(ladder);
    }
  }

  function createCommitmentStep(number, label, key) {
    var step = document.createElement('div');
    step.className = 'commitment-step';
    step.setAttribute('data-step', key);

    var indicator = document.createElement('div');
    indicator.className = 'step-indicator';
    indicator.id = 'step-indicator-' + key;
    indicator.textContent = number;

    var body = document.createElement('div');
    body.className = 'step-body';

    var stepLabel = document.createElement('div');
    stepLabel.className = 'step-label';
    stepLabel.textContent = label;

    var stepContent = document.createElement('div');
    stepContent.className = 'step-content';

    body.appendChild(stepLabel);
    body.appendChild(stepContent);
    step.appendChild(indicator);
    step.appendChild(body);
    return step;
  }

  function markStepComplete(key) {
    if (commitmentState[key]) return;
    commitmentState[key] = true;
    var indicator = document.getElementById('step-indicator-' + key);
    if (indicator) {
      indicator.classList.add('step-complete');
      indicator.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      // Mark the whole step row for visual cascade
      var step = indicator.closest('.commitment-step');
      if (step) step.classList.add('step-completed');
    }
  }

  // ------------------------------------
  // DOWNLOAD CARD RENDER TARGET
  // ------------------------------------
  function renderDownloadCard() {
    const dc = content.download_card;
    document.getElementById('dl-header').textContent = dc.header;
    document.getElementById('dl-url').textContent = dc.url;
    document.getElementById('dl-tagline').textContent = dc.tagline;
    document.getElementById('dl-watermark').textContent = dc.watermark;
  }

  // ------------------------------------
  // EVENTS
  // ------------------------------------
  function bindEvents() {
    document.getElementById('worker-form').addEventListener('submit', handleSubmit);
    document.getElementById('retry-btn').addEventListener('click', handleRetry);
    document.getElementById('download-btn').addEventListener('click', handleDownload);
    document.getElementById('share-btn').addEventListener('click', handleShare);
    document.getElementById('breakdown-trigger').addEventListener('click', toggleBreakdown);

    // Opportunity cost expandable toggle
    var oppToggle = document.getElementById('opp-cost-toggle');
    if (oppToggle) {
      oppToggle.addEventListener('click', function() {
        var detail = document.getElementById('opp-cost-detail');
        var expanded = this.classList.toggle('expanded');
        detail.classList.toggle('expanded');
        this.setAttribute('aria-expanded', String(expanded));
      });
    }

    // Ladder buttons (created dynamically)
    var ladderDownloadBtn = document.getElementById('ladder-download-btn');
    if (ladderDownloadBtn) ladderDownloadBtn.addEventListener('click', handleDownload);

    var shareBtnBottom = document.getElementById('share-btn-bottom');
    if (shareBtnBottom) shareBtnBottom.addEventListener('click', handleShare);

    document.getElementById('negotiation-btn').addEventListener('click', handleNegotiation);

    // Primary CTA button (above the fold, after results)
    document.getElementById('collect-btn').addEventListener('click', handleNegotiation);

    // Poster download buttons (two sizes)
    var posterStoryBtn = document.getElementById('poster-download-story');
    if (posterStoryBtn) posterStoryBtn.addEventListener('click', function() { generatePoster('story'); });
    var posterSquareBtn = document.getElementById('poster-download-square');
    if (posterSquareBtn) posterSquareBtn.addEventListener('click', function() { generatePoster('square'); });

    // Methodology is now merged into breakdown-content (no separate trigger)

    // Progressive disclosure expand buttons
    ['validation', 'phase3c'].forEach(function(key) {
      var btn = document.getElementById(key + '-expand');
      var expandable = document.getElementById(key + '-expandable');
      if (btn && expandable) {
        btn.addEventListener('click', function() {
          toggleSection(btn, expandable);
        });
      }
    });

    // Sticky bar buttons
    document.getElementById('sticky-share-btn').addEventListener('click', handleShare);
    document.getElementById('sticky-script-btn').addEventListener('click', handleNegotiation);

    ['current_wage', 'start_salary'].forEach(id => {
      document.getElementById(id).addEventListener('input', formatCurrencyInput);
    });

    // Enter key advances through form fields
    var formFieldOrder = ['zip_code', 'current_wage', 'start_salary', 'start_year', 'industry', 'role_level'];
    var form = document.getElementById('worker-form');
    form.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var target = e.target;
      if (target.tagName === 'BUTTON') return; // let submit button work normally
      e.preventDefault();
      var idx = formFieldOrder.indexOf(target.id);
      if (idx === -1) return;
      // Find next visible field
      for (var i = idx + 1; i < formFieldOrder.length; i++) {
        var next = document.getElementById(formFieldOrder[i]);
        if (next && !next.closest('[hidden]') && !next.disabled) {
          next.focus();
          return;
        }
      }
      // Last field — submit the form
      form.requestSubmit();
    });

    // Dynamic role-level dropdown: updates options when industry changes
    var industryEl = document.getElementById('industry');
    var roleLevelField = document.getElementById('role-level-field');
    var roleLevelSelect = document.getElementById('role_level');
    if (industryEl && roleLevelField && roleLevelSelect) {
      industryEl.addEventListener('change', function() {
        var industryVal = industryEl.value;
        if (!industryVal) {
          roleLevelField.hidden = true;
          roleLevelSelect.value = '';
          return;
        }

        var sectorMap = content.form.industry_to_sector || {};
        var sector = sectorMap[industryVal] || 'national_average';
        var roleLevels = (content.form.role_levels || {})[sector] || (content.form.role_levels || {})['national_average'] || [];

        // Populate options
        while (roleLevelSelect.firstChild) {
          roleLevelSelect.removeChild(roleLevelSelect.firstChild);
        }
        roleLevels.forEach(function(opt) {
          var option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          roleLevelSelect.appendChild(option);
        });

        roleLevelField.hidden = false;
      });
    }

    // Form progress tracking + localStorage persistence
    var requiredFields = ['zip_code', 'current_wage', 'start_salary', 'start_year'];
    var allFields = ['zip_code', 'current_wage', 'start_salary', 'start_year', 'industry', 'role_level'];


    function saveFormProgress() {
      var data = {};
      allFields.forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.value) data[id] = el.value;
      });
      try { sessionStorage.setItem('ruptura_form', JSON.stringify(data)); } catch(e) {}
    }

    function loadFormProgress() {
      try {
        var saved = sessionStorage.getItem('ruptura_form');
        if (!saved) return;
        var data = JSON.parse(saved);
        Object.keys(data).forEach(function(id) {
          var el = document.getElementById(id);
          if (el) el.value = data[id];
        });

      } catch(e) {}
    }

    allFields.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function() { updateFormProgress(); saveFormProgress(); });
        el.addEventListener('change', function() { updateFormProgress(); saveFormProgress(); });
      }
    });

    loadFormProgress();
  }

  // ------------------------------------
  // CURRENCY INPUT FORMATTING
  // ------------------------------------
  function formatCurrencyInput(e) {
    const input = e.target;
    let raw = input.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const intPart = parts[0];
    const decPart = parts.length > 1 ? '.' + parts[1] : '';
    const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decPart;
    input.value = formatted;
  }

  function stripCurrency(val) {
    return parseFloat((val || '').replace(/[^0-9.]/g, '')) || 0;
  }

  // ------------------------------------
  // VALIDATION
  // ------------------------------------
  function validateForm() {
    let valid = true;
    const currentYear = new Date().getFullYear();

    const checks = {
      zip_code: v => /^\d{5}$/.test(v),
      current_wage: v => stripCurrency(v) > 0,
      start_salary: v => stripCurrency(v) > 0,
      start_year: v => { const y = parseInt(v); return y >= 1975 && y <= currentYear; },
    };

    Object.keys(checks).forEach(key => {
      const input = document.getElementById(key);
      const errEl = document.querySelector('[data-error="' + key + '"]');
      const val = input ? input.value.trim() : '';
      const ok = checks[key](val);
      if (!ok) valid = false;
      if (input) input.classList.toggle('error', !ok);
      if (errEl) errEl.classList.toggle('visible', !ok);
    });

    return valid;
  }

  // ------------------------------------
  // FORM SUBMISSION
  // ------------------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    // Prevent double-submit from rapid Enter key presses
    if (btn.disabled) return;
    if (!validateForm()) return;
    const form = document.getElementById('worker-form');

    const currentYear = new Date().getFullYear();
    formValues = {
      zip_code: document.getElementById('zip_code').value.trim(),
      current_wage: stripCurrency(document.getElementById('current_wage').value),
      start_salary: stripCurrency(document.getElementById('start_salary').value),
      start_year: parseInt(document.getElementById('start_year').value.trim()),
      industry: document.getElementById('industry').value || '',
      role_level: document.getElementById('role_level').value || '',
    };
    formValues.years_experience = currentYear - formValues.start_year;

    const annualSalary = formValues.current_wage;
    const annualStartSalary = formValues.start_salary;

    btn.textContent = content.form.calculating_text;
    btn.classList.add('calculating');
    btn.disabled = true;
    form.classList.add('faded');

    document.getElementById('loading').hidden = false;
    document.getElementById('error-state').hidden = true;

    try {
      const minDelay = new Promise(r => setTimeout(r, 1200));

      const [impactRes, worthRes, localRes] = await Promise.all([
        fetchJSON('/api/impact-calculator', {
          method: 'POST',
          body: {
            start_year: formValues.start_year,
            start_salary: annualStartSalary,
            current_salary: annualSalary,
            industry: formValues.industry || undefined,
            role_level: formValues.role_level || undefined,
            zip_code: formValues.zip_code || undefined,
          }
        }),
        fetchJSON('/api/worth-gap-analyzer', {
          method: 'POST',
          body: {
            current_wage: annualSalary,
            frequency: 'annual',
            zip_code: formValues.zip_code,
            start_year: formValues.start_year,
            years_experience: formValues.years_experience,
            industry: formValues.industry || undefined,
            role_level: formValues.role_level || undefined,
          }
        }),
        fetchJSON('/api/local-data/' + encodeURIComponent(formValues.zip_code)),
        minDelay,
      ]);

      resultsData = {
        impact: impactRes,
        worth: worthRes,
        local: localRes,
        formValues: formValues,
        annualSalary: annualSalary,
      };

      document.getElementById('loading').hidden = true;

      // Reset commitment state
      resetExpandableSections();
      commitmentState = { download: false, share: false, negotiate: false };
      ['download', 'share', 'negotiate'].forEach(function(key, i) {
        var indicator = document.getElementById('step-indicator-' + key);
        if (indicator) {
          indicator.classList.remove('step-complete');
          indicator.textContent = (i + 1).toString();
        }
      });

      ['phase2', 'wins-section', 'phase3a', 'phase3b', 'phase3c', 'phase3d', 'phase-transition'].forEach(id => {
        var el = document.getElementById(id);
        if (el) el.hidden = false;
      });

      // Reset reveal states so staggered animations replay on resubmission
      ['results-card', 'value-generated', 'wages-received', 'hero-stat',
       'hero-context', 'secondary-stat', 'survival-metrics', 'opportunity-cost', 'primary-cta',
       'year-in-hours-block', 'thermal-bar-block'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('revealed');
      });

      // Reset inline display styles from prior positive-outcome submission
      ['value-generated', 'wages-received', 'value-generated-context',
       'wages-received-context', 'gap-claim'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = '';
      });

      // Reset script content for fresh negotiation on resubmission
      var scriptInner = document.getElementById('script-inner');
      if (scriptInner) { while (scriptInner.firstChild) scriptInner.removeChild(scriptInner.firstChild); }
      var scriptContent = document.getElementById('script-content');
      if (scriptContent) scriptContent.classList.remove('expanded');

      // Reset conditional sections (may not re-show depending on new data)
      var survivalEl = document.getElementById('survival-metrics');
      if (survivalEl) survivalEl.hidden = true;
      var yihBlock = document.getElementById('year-in-hours-block');
      if (yihBlock) yihBlock.hidden = true;
      var thermalBlock = document.getElementById('thermal-bar-block');
      if (thermalBlock) thermalBlock.hidden = true;
      var oppCostEl = document.getElementById('opportunity-cost');
      if (oppCostEl) oppCostEl.hidden = true;
      var videoPreviewEl = document.getElementById('video-preview');
      if (videoPreviewEl) videoPreviewEl.hidden = true;

      buildThirdPersonContext();
      populateResults();
      populateSurvivalMetrics();
      populateYearInHours();
      populateThermalBar();
      populateThirdPersonSummary();
      populateOpportunityCost();
      populateGapDecomposition();
      populatePhase3b();
      populatePhase3c();
      populateDownloadCardData();
      populateVideoPreview();
      populateCompensationContext();

      // Sonar ping on submit button when results are ready
      var submitWrapper = document.getElementById('submit-wrapper');
      if (submitWrapper) {
        submitWrapper.classList.add('sonar-active');
        setTimeout(function() { submitWrapper.classList.remove('sonar-active'); }, 1200);
      }

      var prodGap = resultsData.impact.summary.unrealized_productivity_gains;
      var worthAnnual = (resultsData.worth && resultsData.worth.worthGap) ? resultsData.worth.worthGap.annual : 0;
      if (prodGap <= 0 && worthAnnual > 0) {
        announce('Results calculated. You are ' + formatCurrency(worthAnnual) + ' per year below the market rate for your role.');
      } else {
        announce('Results calculated. Your productivity gap is ' + formatCurrency(prodGap) + '.');
      }

      // Delay scroll until card reveal animation starts
      setTimeout(function() {
        document.getElementById('phase2').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 600);

      // Staggered reveal: card -> value generated -> wages -> gap -> context
      setTimeout(function() {
        document.getElementById('results-card').classList.add('revealed');
      }, 400);
      setTimeout(function() {
        var vg = document.getElementById('value-generated');
        if (vg && getComputedStyle(vg).display !== 'none') {
          vg.classList.add('revealed');
          countUp(vg, resultsData.impact.summary.total_value_generated);
        }
      }, 700);
      setTimeout(function() {
        var wr = document.getElementById('wages-received');
        if (wr && getComputedStyle(wr).display !== 'none') {
          wr.classList.add('revealed');
          countUp(wr, resultsData.impact.summary.total_wages_received);
        }
      }, 1100);
      setTimeout(function() {
        var hs = document.getElementById('hero-stat');
        hs.classList.add('revealed');
        if (resultsData.impact.summary.unrealized_productivity_gains > 1000) {
          countUp(hs, resultsData.impact.summary.unrealized_productivity_gains);
        }
      }, 1500);
      setTimeout(function() {
        document.getElementById('hero-context').classList.add('revealed');
      }, 1900);
      // Year in Hours reveal
      setTimeout(function() {
        var yih = document.getElementById('year-in-hours-block');
        if (yih && !yih.hidden) yih.classList.add('revealed');
      }, 2100);
      // Thermal Dollar Bar reveal
      setTimeout(function() {
        var tb = document.getElementById('thermal-bar-block');
        if (tb && !tb.hidden) tb.classList.add('revealed');
      }, 2500);
      // Opportunity cost reveal
      setTimeout(function() {
        var oc = document.getElementById('opportunity-cost');
        if (oc && !oc.hidden) oc.classList.add('revealed');
      }, 2800);
      // Primary CTA reveal — show earlier since it's now above fold
      setTimeout(function() {
        var cta = document.getElementById('primary-cta');
        if (cta) { cta.hidden = false; cta.classList.add('revealed'); }
      }, 1800);

      // Initialize sticky bar after reveal
      setTimeout(function() { initStickyBar(); }, 3400);

    } catch (err) {
      console.error('API error:', err);
      announce('Calculation failed. Please try again.');
      document.getElementById('loading').hidden = true;
      document.getElementById('error-state').hidden = false;
      form.classList.remove('faded');
    }

    btn.textContent = content.form.submit_text;
    btn.classList.remove('calculating');
    btn.disabled = false;
  }

  // ------------------------------------
  // RETRY
  // ------------------------------------
  function handleRetry() {
    document.getElementById('error-state').hidden = true;
    document.getElementById('worker-form').classList.remove('faded');
    document.getElementById('submit-btn').disabled = false;
  }

  // ------------------------------------
  // SURVIVAL METRICS — visceral gap translation
  // ------------------------------------
  function calculateSurvivalMetrics(gapAnnual, annualSalary, monthlyRent) {
    var dailyWage = annualSalary / 260; // ~260 working days per year
    var daysWorkedFree = dailyWage > 0 ? Math.round(gapAnnual / dailyWage) : 0;

    // Months of rent the gap covers — use actual rent when available
    var rentMonths = 0;
    if (monthlyRent > 0) {
      rentMonths = parseFloat((gapAnnual / monthlyRent).toFixed(1));
    } else if (daysWorkedFree > 0) {
      rentMonths = parseFloat((daysWorkedFree / (260 / 12)).toFixed(1));
    }

    return { daysWorkedFree: daysWorkedFree, rentMonths: rentMonths };
  }

  function populateSurvivalMetrics() {
    var impact = resultsData.impact;
    var worth = resultsData.worth;
    var local = resultsData.local;
    var cumulative = impact.summary.unrealized_productivity_gains;
    var startYear = resultsData.formValues.start_year;
    var yearsSpan = Math.max(1, new Date().getFullYear() - startYear);
    var annualGap = cumulative / yearsSpan;

    // If productivity gap is negative but worth gap is positive, use worth gap
    var worthGapAnnual = (worth && worth.worthGap) ? worth.worthGap.annual : 0;
    if (annualGap <= 0 && worthGapAnnual > 0) {
      annualGap = worthGapAnnual;
    }

    if (annualGap <= 0) return;

    var monthlyRent = (local && local.rent) ? local.rent : 0;
    var metrics = calculateSurvivalMetrics(annualGap, resultsData.annualSalary, monthlyRent);

    // Store on resultsData so video card can read the same values
    resultsData.survivalMetrics = {
      annualGap: annualGap,
      daysWorkedFree: metrics.daysWorkedFree,
      rentMonths: metrics.rentMonths
    };

    var container = document.getElementById('survival-metrics');
    var daysEl = document.getElementById('days-free-value');
    var rentEl = document.getElementById('rent-equiv-value');

    // Populate hidden DOM elements (backward compat for video card reads)
    if (daysEl) daysEl.textContent = metrics.daysWorkedFree > 0 ? metrics.daysWorkedFree : '--';
    if (rentEl) rentEl.textContent = metrics.rentMonths > 0 ? metrics.rentMonths : '--';
    // Container stays hidden — video card reads from resultsData.survivalMetrics, not DOM
  }

  // ------------------------------------
  // YEAR IN HOURS — hero stat replacement
  // ------------------------------------
  function populateYearInHours() {
    var sm = resultsData.survivalMetrics;
    var blockEl = document.getElementById('year-in-hours-block');
    if (!sm || sm.daysWorkedFree <= 0) {
      if (blockEl) blockEl.hidden = true;
      resultsData.yearInHours = 0;
      return;
    }

    var hours = sm.daysWorkedFree * 8;
    resultsData.yearInHours = hours;

    var numberEl = document.getElementById('year-in-hours-number');
    if (numberEl) numberEl.textContent = hours;
    if (blockEl) {
      blockEl.hidden = false;
      blockEl.setAttribute('aria-label', hours + ' hours of equivalent unpaid labor this year');
    }
  }

  // ------------------------------------
  // THERMAL DOLLAR BAR — visual dollar breakdown
  // ------------------------------------
  function populateThermalBar() {
    var barBlock = document.getElementById('thermal-bar-block');
    if (!resultsData || !resultsData.impact || !resultsData.impact.summary) {
      if (barBlock) barBlock.hidden = true;
      return;
    }
    var cumulative = resultsData.impact.summary.unrealized_productivity_gains;
    // If productivity gap is negative but worth gap is positive, use worth gap for the bar
    var worthGapAnnual = (resultsData.worth && resultsData.worth.worthGap) ? resultsData.worth.worthGap.annual : 0;
    if (cumulative <= 0 && worthGapAnnual <= 0) {
      if (barBlock) barBlock.hidden = true;
      return;
    }

    var annualSalary = resultsData.annualSalary;
    var startYear = resultsData.formValues.start_year;
    var yearsSpan = Math.max(1, new Date().getFullYear() - startYear);
    var annualGap = cumulative / yearsSpan;
    // Use worth gap when productivity gap is negative
    if (annualGap <= 0 && worthGapAnnual > 0) annualGap = worthGapAnnual;

    var takehome = annualSalary;
    var surplus = annualGap;
    var taxes = estimateTotalTax(annualSalary, resultsData.local ? resultsData.local.stateCode : null);
    var housing = (resultsData.local && resultsData.local.rent) ? resultsData.local.rent * 12 : 0;
    var hasHousing = housing > 0;

    var surplusLabel = cumulative <= 0 ? 'Market shortfall' : 'Structural gap';
    var segments = [
      { key: 'takehome', value: takehome, label: 'Take-home' },
      { key: 'surplus', value: surplus, label: surplusLabel },
      { key: 'taxes', value: taxes, label: 'Fed + state taxes (est.)' }
    ];
    if (hasHousing) {
      segments.push({ key: 'housing', value: housing, label: 'Housing' });
    }

    var total = segments.reduce(function(s, seg) { return s + seg.value; }, 0);
    segments.forEach(function(seg) {
      seg.pct = Math.max(3, Math.round((seg.value / total) * 100));
    });
    // Normalize percentages to sum to 100 (adjust largest segment)
    var pctSum = segments.reduce(function(s, seg) { return s + seg.pct; }, 0);
    if (pctSum !== 100) {
      var largest = segments.reduce(function(max, seg) { return seg.pct > max.pct ? seg : max; });
      largest.pct += (100 - pctSum);
    }

    resultsData.thermalData = { takehome: takehome, surplus: surplus, taxes: taxes, housing: housing };

    var bar = document.getElementById('thermal-bar');
    var legend = document.getElementById('thermal-legend');
    if (!bar || !legend) return;

    while (bar.firstChild) bar.removeChild(bar.firstChild);
    while (legend.firstChild) legend.removeChild(legend.firstChild);

    var colorMap = {
      takehome: 'var(--accent-gold)',
      surplus: 'var(--gap-red)',
      taxes: 'var(--text-tertiary)',
      housing: 'var(--cost-housing)'
    };

    segments.forEach(function(seg) {
      var segDiv = document.createElement('div');
      segDiv.className = 'thermal-segment thermal-segment-' + seg.key;
      segDiv.style.width = seg.pct + '%';
      bar.appendChild(segDiv);

      var legendItem = document.createElement('div');
      legendItem.className = 'thermal-legend-item';

      var dot = document.createElement('span');
      dot.className = 'thermal-legend-dot';
      dot.style.background = colorMap[seg.key];
      legendItem.appendChild(dot);

      var label = document.createElement('span');
      label.className = 'thermal-legend-label';
      label.textContent = seg.label + ': ';
      legendItem.appendChild(label);

      var value = document.createElement('span');
      value.className = 'thermal-legend-value';
      value.textContent = formatCurrency(seg.value) + ' (' + seg.pct + '%)';
      legendItem.appendChild(value);

      legend.appendChild(legendItem);
    });

    // Accessibility
    var ariaLabel = segments.map(function(s) { return s.label + ' ' + formatCurrency(s.value); }).join(', ');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', ariaLabel);

    if (barBlock) barBlock.hidden = false;
  }

  // ------------------------------------
  // THIRD-PERSON CONTEXT — for results card, video card, poster
  // ------------------------------------
  function buildThirdPersonContext() {
    var fv = resultsData.formValues;
    var industryLabel = '';
    var options = (content.form && content.form.fields && content.form.fields.industry && content.form.fields.industry.options) || [];
    for (var i = 0; i < options.length; i++) {
      if (options[i].value === fv.industry) {
        industryLabel = options[i].label;
        break;
      }
    }
    var area = (resultsData.local && resultsData.local.area) ? resultsData.local.area : 'ZIP ' + fv.zip_code;

    resultsData.thirdPerson = {
      jobTitle: industryLabel || 'worker',
      zipArea: area,
      salary: formatCurrency(fv.current_wage),
      experience: fv.years_experience
    };
  }

  // ------------------------------------
  // THIRD-PERSON SUMMARY — shareable one-liner above card
  // ------------------------------------
  function populateThirdPersonSummary() {
    var tp = resultsData.thirdPerson;
    var summaryEl = document.getElementById('third-person-summary');
    if (!summaryEl || !tp || !resultsData.impact || !resultsData.impact.summary) return;

    var cumulative = resultsData.impact.summary.unrealized_productivity_gains;
    var worthGapAnnual = (resultsData.worth && resultsData.worth.worthGap) ? resultsData.worth.worthGap.annual : 0;
    if (cumulative <= 0 && worthGapAnnual <= 0) {
      summaryEl.textContent = '';
      return;
    }

    var hours = resultsData.yearInHours || 0;
    var article = indefiniteArticle(tp.jobTitle);
    var sentence = article.charAt(0).toUpperCase() + article.slice(1) + ' ' + tp.jobTitle + ' employee in ' + tp.zipArea + ' earning ' + tp.salary;
    if (tp.experience > 0) {
      sentence += ' with ' + tp.experience + ' years of experience';
    }
    if (hours > 0) {
      sentence += ' works approximately ' + hours + ' unpaid hours per year.';
    } else if (cumulative <= 0 && worthGapAnnual > 0) {
      sentence += ' earns ' + formatCurrency(worthGapAnnual) + '/yr below the market rate for their role.';
    } else {
      sentence += '.';
    }
    summaryEl.textContent = sentence;
  }

  // ------------------------------------
  // OPPORTUNITY COST — Daily/Weekly/Monthly
  // ------------------------------------
  function populateOpportunityCost() {
    var worth = resultsData.worth;
    var container = document.getElementById('opportunity-cost');

    if (!worth || !worth.opportunityCost || !container) {
      if (container) container.hidden = true;
      return;
    }

    // Derive daily/weekly/monthly from the per-year gap for consistency
    // with the hero number, using currentYear - startYear as the span.
    var cumulative = resultsData.impact.summary.unrealized_productivity_gains;
    var startYear = resultsData.formValues.start_year;
    var yearsSpan = Math.max(1, new Date().getFullYear() - startYear);
    var annualGap = cumulative / yearsSpan;

    // Show annual gap in toggle header text
    var toggleText = document.getElementById('opp-cost-toggle');
    if (toggleText) {
      var spanEl = toggleText.querySelector('.opportunity-cost-toggle-text');
      if (spanEl) spanEl.textContent = formatCurrency(annualGap) + '/yr in lost wages';
    }

    var dailyEl = document.getElementById('opp-cost-daily');
    var weeklyEl = document.getElementById('opp-cost-weekly');
    var monthlyEl = document.getElementById('opp-cost-monthly');
    if (dailyEl) dailyEl.textContent = formatCurrency(annualGap / 260);
    if (weeklyEl) weeklyEl.textContent = formatCurrency(annualGap / 52);
    if (monthlyEl) monthlyEl.textContent = formatCurrency(annualGap / 12);

    container.hidden = false;
  }

  // ------------------------------------
  // POPULATE RESULTS
  // ------------------------------------
  function populateResults() {
    const impact = resultsData.impact;
    const worth = resultsData.worth;
    // Use productivity gap (value created - wages received) as the hero gap.
    // cumulative_economic_impact includes rent burden which inflates the number
    // beyond what's visible from the value/wages comparison, especially at low incomes.
    const cumulative = impact.summary.unrealized_productivity_gains;
    const totalGenerated = impact.summary.total_value_generated;
    const totalReceived = impact.summary.total_wages_received;

    // Worth gap: OEWS market-median comparison (annual).
    // In sectors where the productivity gap is negative (government, education),
    // the worth gap catches workers who are individually underpaid relative to
    // their role's market rate even if the sector-wide gap is favorable.
    const worthGapAnnual = (worth && worth.worthGap) ? worth.worthGap.annual : 0;

    const card = document.getElementById('results-card');
    const heroEl = document.getElementById('hero-stat');
    const contextEl = document.getElementById('hero-context');
    const gapClaimEl = document.getElementById('gap-claim');
    const valueGenEl = document.getElementById('value-generated');
    const valueGenCtxEl = document.getElementById('value-generated-context');
    const wagesEl = document.getElementById('wages-received');
    const wagesCtxEl = document.getElementById('wages-received-context');
    const secondaryEl = document.getElementById('secondary-stat');
    const secondaryCtx = document.getElementById('secondary-stat-context');
    const labelEl = document.getElementById('card-label');

    card.classList.remove('outcome-severe', 'outcome-moderate', 'outcome-positive');
    heroEl.classList.remove('positive');
    secondaryEl.classList.remove('gold');

    // Use the worse signal: if either productivity gap or worth gap says underpaid, show gap.
    // This prevents sectors with negative productivity gaps (government, education)
    // from masking workers who are individually underpaid relative to role market rate.
    var useWorthGapAsHero = cumulative <= 0 && worthGapAnnual > 1000;
    var heroGap = useWorthGapAsHero ? worthGapAnnual : cumulative;

    if (cumulative <= 0 && !useWorthGapAsHero) {
      // Worker is truly fairly compensated: both productivity gap AND worth gap are near zero
      card.classList.add('outcome-positive');
      labelEl.textContent = content.results.fairly_compensated_label || 'YOUR ECONOMIC POSITION';
      valueGenEl.style.display = 'none';
      wagesEl.style.display = 'none';
      valueGenCtxEl.style.display = 'none';
      wagesCtxEl.style.display = 'none';
      gapClaimEl.style.display = 'none';
      heroEl.textContent = content.results.fairly_compensated ? content.results.fairly_compensated.hero_text : 'Fairly Compensated';
      heroEl.classList.add('positive');
      heroEl.setAttribute('aria-label', 'Result: Fairly compensated');
      contextEl.textContent = content.results.fairly_compensated ? content.results.fairly_compensated.context : 'Your compensation meets or exceeds the productivity-adjusted benchmark for your role, industry, and location.';
    } else if (heroGap <= 1000 && heroGap > 0) {
      card.classList.add('outcome-positive');
      labelEl.textContent = content.results.edge_case_label;
      valueGenEl.style.display = 'none';
      wagesEl.style.display = 'none';
      valueGenCtxEl.style.display = 'none';
      wagesCtxEl.style.display = 'none';
      gapClaimEl.style.display = 'none';
      heroEl.textContent = content.results.edge_case.hero_text;
      heroEl.classList.add('positive');
      heroEl.setAttribute('aria-label', 'Result: Near parity with productivity benchmark');
      contextEl.textContent = content.results.edge_case.context;
    } else if (useWorthGapAsHero) {
      // Sector productivity gap is negative, but worker is underpaid relative to role market rate.
      // Show the worth gap (annual market shortfall) instead of the productivity gap.
      var marketMedianAnnual = (worth.marketData && worth.marketData.adjustedMedian)
        ? Math.round(worth.marketData.adjustedMedian * 1680) : null;
      valueGenEl.style.display = 'none';
      valueGenCtxEl.style.display = 'none';
      wagesEl.style.display = 'none';
      wagesCtxEl.style.display = 'none';
      heroEl.textContent = formatCurrency(worthGapAnnual) + '/yr';
      heroEl.setAttribute('aria-label', 'Market gap: ' + formatCurrency(worthGapAnnual) + ' per year below market rate');
      contextEl.textContent = marketMedianAnnual
        ? 'below the market rate for your role (' + formatCurrency(marketMedianAnnual) + '/yr)'
        : 'below the market rate for your role and location';
      gapClaimEl.textContent = content.results.gap_claim;

      if (worthGapAnnual > 15000) {
        card.classList.add('outcome-severe');
        labelEl.textContent = 'YOUR MARKET GAP';
      } else {
        card.classList.add('outcome-moderate');
        labelEl.textContent = 'YOUR MARKET GAP';
      }
    } else {
      valueGenEl.textContent = formatCurrency(totalGenerated);
      valueGenCtxEl.textContent = content.results.value_generated_context.replace('{{year}}', resultsData.formValues.start_year);
      wagesEl.textContent = formatCurrency(totalReceived);
      wagesCtxEl.textContent = content.results.wages_received_context;
      heroEl.textContent = formatCurrency(cumulative);
      heroEl.setAttribute('aria-label', 'Total productivity gap: ' + formatCurrency(cumulative));
      contextEl.textContent = content.results.hero_context_template;
      gapClaimEl.textContent = content.results.gap_claim;

      if (cumulative > 50000) {
        card.classList.add('outcome-severe');
        labelEl.textContent = content.results.severe_label;
      } else {
        card.classList.add('outcome-moderate');
        labelEl.textContent = content.results.card_label;
      }
    }

    // Derive annual gap: cumulative gap / (currentYear - startYear).
    // Uses live year so it auto-updates each calendar year.
    var startYear = resultsData.formValues.start_year;
    var yearsSpan = Math.max(1, new Date().getFullYear() - startYear);
    var annualizedGap = cumulative / yearsSpan;

    // Store display-mode data so all downstream consumers (poster, video, download card)
    // show the same gap the hero displays
    resultsData.useWorthGapAsHero = useWorthGapAsHero;
    resultsData.annualizedHeroGap = useWorthGapAsHero ? worthGapAnnual : (annualizedGap > 0 ? annualizedGap : 0);

    if (useWorthGapAsHero) {
      // Worth-gap hero: show the annual shortfall as secondary stat
      secondaryEl.textContent = formatCurrency(worthGapAnnual * yearsSpan);
      secondaryCtx.textContent = 'total market shortfall over your career';
    } else if (annualizedGap > 0) {
      secondaryEl.textContent = formatCurrency(annualizedGap) + '/yr';
      secondaryCtx.textContent = content.results.secondary_context_template;
    } else if (cumulative <= 0) {
      // Fairly compensated — hide secondary stat
      secondaryEl.textContent = '';
      secondaryCtx.textContent = '';
    } else {
      secondaryEl.textContent = impact.summary.years_of_work_equivalent + ' years';
      secondaryEl.classList.add('gold');
      secondaryCtx.textContent = content.results.unpaid_labor_context;
    }

    populateBreakdown();
    populateMethodology();
    renderCareerTimeline();
  }

  // ------------------------------------
  // BREAKDOWN
  // ------------------------------------
  function populateBreakdown() {
    var inner = document.getElementById('breakdown-inner');
    inner.textContent = '';
    var impact = resultsData.impact;
    var worth = resultsData.worth;

    var cards = [
      { label: 'Productivity Gap', value: formatCurrency(impact.summary.unrealized_productivity_gains), note: impact.metrics.gap.detail, variant: 'red' },
      { label: 'Market Gap', value: worth.worthGap ? formatCurrency(worth.worthGap.annual) + '/yr' : 'N/A', note: worth.marketData ? 'Market median: ' + formatCurrency(worth.marketData.adjustedMedian * 1680) + '/yr' : '', variant: 'gold' },
      { label: 'Housing Gap', value: impact.metrics.housing.value, note: impact.metrics.housing.detail, variant: 'green' },
      { label: 'Rent Burden', value: impact.metrics.rent.value, note: impact.metrics.rent.detail, variant: 'red' },
    ];

    cards.forEach(function(c) {
      var card = document.createElement('div');
      card.className = 'metric-card metric-card--' + c.variant;

      var labelEl = document.createElement('div');
      labelEl.className = 'metric-card__label';
      labelEl.textContent = c.label;
      card.appendChild(labelEl);

      var valueEl = document.createElement('div');
      valueEl.className = 'metric-card__value';
      valueEl.textContent = c.value;
      card.appendChild(valueEl);

      if (c.note) {
        var noteEl = document.createElement('div');
        noteEl.className = 'metric-card__note';
        noteEl.textContent = c.note;
        card.appendChild(noteEl);
      }

      inner.appendChild(card);
    });
  }

  // ------------------------------------
  // GAP DECOMPOSITION — where the money goes
  // ------------------------------------
  function populateGapDecomposition() {
    var container = document.getElementById('gap-decomposition');
    if (!container) return;
    var decomp = resultsData.impact.gap_decomposition;
    if (!decomp || !decomp.totalGap || decomp.totalGap <= 0) {
      container.hidden = true;
      return;
    }

    container.textContent = '';

    var heading = document.createElement('div');
    heading.className = 'decomp-heading';
    heading.textContent = 'Where does the gap go?';
    container.appendChild(heading);

    var context = document.createElement('div');
    context.className = 'decomp-context';
    context.textContent = decomp.context;
    container.appendChild(context);

    // Stacked bar
    var bar = document.createElement('div');
    bar.className = 'decomp-bar';

    var segments = [
      { key: 'depreciation', color: 'var(--accent-gold-hover)', data: decomp.depreciation },
      { key: 'taxes', color: 'var(--text-tertiary)', data: decomp.taxes },
      { key: 'netProfit', color: 'var(--gap-red)', data: decomp.netProfit }
    ];

    segments.forEach(function(seg) {
      var segment = document.createElement('div');
      segment.className = 'decomp-segment decomp-segment-' + seg.key;
      segment.style.width = seg.data.percentage + '%';
      segment.style.backgroundColor = seg.color;
      segment.title = seg.data.label + ': ' + formatCurrency(seg.data.amount) + ' (' + seg.data.percentage + '%)';
      bar.appendChild(segment);
    });
    container.appendChild(bar);

    // Legend
    var legend = document.createElement('div');
    legend.className = 'decomp-legend';
    segments.forEach(function(seg) {
      var item = document.createElement('div');
      item.className = 'decomp-legend-item';

      var dot = document.createElement('span');
      dot.className = 'decomp-dot';
      dot.style.backgroundColor = seg.color;
      item.appendChild(dot);

      var label = document.createElement('span');
      label.className = 'decomp-legend-label';
      label.textContent = seg.data.label;
      item.appendChild(label);

      var value = document.createElement('span');
      value.className = 'decomp-legend-value';
      value.textContent = formatCurrency(seg.data.amount) + ' (' + seg.data.percentage + '%)';
      item.appendChild(value);

      legend.appendChild(item);
    });
    container.appendChild(legend);

    container.hidden = false;
  }

  // ------------------------------------
  // COMPENSATION CONTEXT — occupation + benefits + provenance
  // ------------------------------------
  function populateCompensationContext() {
    var worth = resultsData.worth;
    if (!worth) return;

    var inner = document.getElementById('methodology-inner');
    if (!inner) return;

    var parts = [];

    if (worth.occupationContext) {
      var oc = worth.occupationContext;
      parts.push(
        'Your wage places you in the ' + oc.percentileEstimate +
        ' percentile for your industry (mean: ' + formatCurrency(oc.industryMeanWage) + '/hr).'
      );
    }

    if (worth.benefitsContext) {
      parts.push(worth.benefitsContext.note);
    }

    if (parts.length > 0) {
      var section = createMethodSection('Your Compensation Context', parts.join(' '));
      // Insert before the Challenge This callout
      var callout = inner.querySelector('.challenge-callout');
      if (callout) {
        inner.insertBefore(section, callout);
      } else {
        inner.appendChild(section);
      }
    }

    // Data provenance — append to sources section or add new
    var provenance = resultsData.impact.data_provenance || resultsData.worth.data_provenance;
    if (provenance && provenance.length > 0) {
      var challengeCallout = inner.querySelector('.challenge-callout');
      var provSection = document.createElement('div');
      provSection.className = 'method-section';
      var provTitle = document.createElement('div');
      provTitle.className = 'method-section__title';
      provTitle.textContent = 'Your Data Vintage';
      provSection.appendChild(provTitle);
      var provBody = document.createElement('div');
      provBody.className = 'method-section__body';

      provenance.forEach(function(p) {
        var cite = document.createElement('span');
        cite.className = 'source-citation';
        if (p.url) {
          var link = document.createElement('a');
          link.href = p.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = p.name;
          cite.appendChild(link);
          cite.appendChild(document.createTextNode(' \u2014 ' + p.agency + (p.vintage ? ' (' + p.vintage + ')' : '')));
        } else {
          cite.textContent = p.name + ' \u2014 ' + p.agency + (p.vintage ? ' (' + p.vintage + ')' : '');
        }
        provBody.appendChild(cite);
      });

      provSection.appendChild(provBody);
      if (challengeCallout) {
        inner.insertBefore(provSection, challengeCallout);
      } else {
        inner.appendChild(provSection);
      }
    }
  }

  function toggleBreakdown() {
    const trigger = document.getElementById('breakdown-trigger');
    const contentEl = document.getElementById('breakdown-content');
    const expanded = trigger.classList.toggle('expanded');
    contentEl.classList.toggle('expanded');
    trigger.setAttribute('aria-expanded', expanded);
  }

  // ------------------------------------
  // PROGRESSIVE DISCLOSURE — shared helpers
  // ------------------------------------
  var CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function createExpandButton(id, controlsId, label) {
    var btn = document.createElement('button');
    btn.className = 'section-expand-btn';
    btn.id = id;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', controlsId);
    var span = document.createElement('span');
    span.textContent = label;
    btn.appendChild(span);
    // Chevron icon
    var iconWrapper = document.createElement('span');
    iconWrapper.className = 'section-expand-chevron';
    iconWrapper.innerHTML = CHEVRON_SVG;
    btn.appendChild(iconWrapper.firstChild);
    return btn;
  }

  function toggleSection(btn, expandable) {
    var expanded = btn.classList.toggle('expanded');
    expandable.classList.toggle('expanded');
    btn.setAttribute('aria-expanded', String(expanded));

    // Trigger fade-in for items revealed by the expand
    if (expanded) {
      setTimeout(function() {
        expandable.querySelectorAll('.stat-card:not(.visible), .validation-block:not(.visible), .win-card:not(.visible)').forEach(function(el) {
          el.classList.add('visible');
        });
        var reframe = expandable.querySelector('.reframe-statement');
        if (reframe && !reframe.classList.contains('visible')) {
          reframe.classList.add('visible');
        }
      }, 300);
    }
  }

  function resetExpandableSections() {
    ['validation', 'phase3c'].forEach(function(key) {
      var btn = document.getElementById(key + '-expand');
      var expandable = document.getElementById(key + '-expandable');
      if (btn) {
        btn.classList.remove('expanded');
        btn.setAttribute('aria-expanded', 'false');
      }
      if (expandable) expandable.classList.remove('expanded');
    });
  }

  // ------------------------------------
  // METHODOLOGY
  // ------------------------------------
  function populateMethodology() {
    var inner = document.getElementById('methodology-inner');
    if (!inner) return;
    inner.textContent = '';
    var m = resultsData.impact.methodology;
    if (!m) return;

    // Section 1: How We Calculate
    var calcSection = createMethodSection(
      'How We Calculate Your Value',
      'We estimate what your labor produces using Bureau of Economic Analysis value-added data for your industry, adjusted for your metro area and experience level. We then compare that structural benchmark to what you actually earn.'
    );
    if (m.fair_value_formula) {
      var formula = document.createElement('div');
      formula.className = 'method-formula';
      formula.textContent = m.fair_value_formula;
      calcSection.querySelector('.method-section__body').appendChild(formula);
    }
    if (m.interpolation) {
      var interp = document.createElement('p');
      interp.textContent = m.interpolation;
      calcSection.querySelector('.method-section__body').appendChild(interp);
    }
    inner.appendChild(calcSection);

    // Section 2: Step By Step
    var stepsText = 'Step 1: Look up industry value-added per worker (BEA NIPA). ' +
      'Step 2: Adjust for your metro area using regional GDP multipliers. ' +
      'Step 3: Apply a career-length labor share adjustment based on how much the labor share in your sector has declined during your working years. ' +
      'Step 4: Factor in your experience using a Mincer-style earnings curve. ' +
      'Step 5: Compare to your reported wage to calculate the gap.';
    inner.appendChild(createMethodSection('Step by Step', stepsText));

    // Section 3: Labor Share Framework
    var prodCtx = resultsData.worth ? resultsData.worth.productivityContext : null;
    var laborText = 'Instead of applying a flat percentage, we use BEA labor share data to calculate how much of productivity growth should have reached you. ';
    if (prodCtx && prodCtx.laborShare && prodCtx.laborShare.peakShare) {
      var ls = prodCtx.laborShare;
      laborText += 'Your sector\u2019s labor share peaked at ' + (ls.peakShare * 100).toFixed(0) + '% and currently sits at ' + (ls.currentShare * 100).toFixed(0) + '%. ';
      laborText += 'Over your career, you\u2019ve worked through ' + (ls.careerFraction * 100).toFixed(0) + '% of that decline, giving an adjustment factor of ' + prodCtx.factor + '\u00d7.';
    } else if (prodCtx && prodCtx.productivityGrowth) {
      laborText += 'Workers in your sector now produce ' + prodCtx.productivityGrowth.toFixed(0) + '% more but wages grew only ' + prodCtx.wageGrowth.toFixed(0) + '%. That divergence is the basis for your gap estimate.';
    } else {
      laborText += 'This accounts for the well-documented divergence between productivity and compensation that began in the mid-1970s.';
    }
    inner.appendChild(createMethodSection('Labor Share Framework', laborText));

    // Section 4: Assumptions & Limitations
    var assumText = '';
    if (m.seniority_model) assumText += m.seniority_model + ' ';
    if (m.work_year) assumText += m.work_year + ' ';
    if (m.rent_burden) assumText += m.rent_burden + ' ';
    assumText += 'We use gross output productivity (BLS), which shows ~110% growth since 1979 vs. EPI\u2019s net measure (~85%). The labor share adjustment mitigates this by grounding the estimate in what capital actually captured.';
    inner.appendChild(createMethodSection('Assumptions & Limitations', assumText));

    // Section 5: Data Sources
    var srcSection = document.createElement('div');
    srcSection.className = 'method-section';
    var srcTitle = document.createElement('div');
    srcTitle.className = 'method-section__title';
    srcTitle.textContent = 'Data Sources';
    srcSection.appendChild(srcTitle);
    var srcBody = document.createElement('div');
    srcBody.className = 'method-section__body';
    m.sources.forEach(function(s) {
      var cite = document.createElement('span');
      cite.className = 'source-citation';
      if (s.url) {
        var a = document.createElement('a');
        a.href = s.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = s.name;
        cite.appendChild(a);
        cite.appendChild(document.createTextNode(' \u2014 ' + s.type));
      } else {
        cite.textContent = s.name + ' \u2014 ' + s.type;
      }
      srcBody.appendChild(cite);
    });
    srcSection.appendChild(srcBody);
    inner.appendChild(srcSection);

    // Challenge This callout
    var callout = document.createElement('div');
    callout.className = 'challenge-callout';
    var calloutHeading = document.createElement('div');
    calloutHeading.className = 'challenge-callout__heading';
    calloutHeading.textContent = 'Challenge This';
    callout.appendChild(calloutHeading);
    var calloutBody = document.createElement('div');
    calloutBody.className = 'challenge-callout__body';
    calloutBody.textContent = 'We publish our assumptions because we believe in transparent economics. If you see a flaw, we want to know.';
    callout.appendChild(calloutBody);
    var calloutLink = document.createElement('a');
    calloutLink.className = 'challenge-callout__link';
    calloutLink.href = '/methodology';
    calloutLink.target = '_blank';
    calloutLink.rel = 'noopener noreferrer';
    calloutLink.textContent = 'Full methodology, sources & limitations \u2192';
    callout.appendChild(calloutLink);
    inner.appendChild(callout);
  }

  function createMethodSection(title, bodyText) {
    var section = document.createElement('div');
    section.className = 'method-section';
    var titleEl = document.createElement('div');
    titleEl.className = 'method-section__title';
    titleEl.textContent = title;
    section.appendChild(titleEl);
    var bodyEl = document.createElement('div');
    bodyEl.className = 'method-section__body';
    var p = document.createElement('p');
    p.textContent = bodyText;
    bodyEl.appendChild(p);
    section.appendChild(bodyEl);
    return section;
  }

  // ------------------------------------
  // PHASE 3B — personalized data
  // ------------------------------------
  // Store original templates so we can re-apply on resubmission
  var phase3bTemplates = [];

  function capturePhase3bTemplates() {
    var answers = document.querySelectorAll('#phase3b .validation-answer');
    phase3bTemplates = [];
    answers.forEach(function(el) {
      phase3bTemplates.push(el.textContent);
    });
  }

  function populatePhase3b() {
    const answers = document.querySelectorAll('#phase3b .validation-answer');
    const worth = resultsData.worth;
    const impact = resultsData.impact;

    // Capture templates on first run (before any replacement)
    if (phase3bTemplates.length === 0) {
      capturePhase3bTemplates();
    }

    // Use the same annualized gap the hero displays for consistency
    var heroGap = resultsData.annualizedHeroGap != null
      ? resultsData.annualizedHeroGap
      : (worth.worthGap ? worth.worthGap.annual : 0);

    const replacements = {
      '{{worth_gap_annual}}': formatCurrency(heroGap),
      '{{total_productivity_growth}}': impact.metrics.productivity.value,
      '{{total_wage_growth}}': impact.metrics.wages.value,
    };

    answers.forEach(function(el, i) {
      // Always start from the original template, not the already-replaced DOM text
      let text = phase3bTemplates[i] || el.textContent;
      Object.keys(replacements).forEach(function(token) {
        text = text.replace(token, replacements[token]);
      });
      el.textContent = text;
    });
  }

  // ------------------------------------
  // PHASE 3C — raise visualization
  // ------------------------------------
  function populatePhase3c() {
    const annual = resultsData.annualSalary;
    const worth = resultsData.worth;
    // Use the same annualized gap the hero displays for consistency
    const gapAnnual = resultsData.annualizedHeroGap != null
      ? resultsData.annualizedHeroGap
      : (worth.worthGap ? worth.worthGap.annual : 0);

    // If the gap is zero or negative, the user earns at or above market rate.
    // Hide the raise visualization and show an empowering "ahead" message instead.
    if (gapAnnual <= 0) {
      var phase3c = document.getElementById('phase3c');
      var raiseHeading = document.getElementById('raise-heading');
      var barChart = document.getElementById('bar-chart');
      var barDiff = document.getElementById('bar-difference');
      var projCards = document.getElementById('projection-cards');
      var ctxLine = document.getElementById('context-line');
      var costTranslator = document.getElementById('cost-translator');
      var urgencySection = document.getElementById('urgency-section');
      var timelineSection = document.getElementById('career-timeline-section');

      // Hide the raise-specific elements
      if (barChart) barChart.hidden = true;
      if (barDiff) barDiff.hidden = true;
      if (projCards) projCards.hidden = true;
      if (costTranslator) costTranslator.hidden = true;
      if (urgencySection) urgencySection.hidden = true;

      // Hide expand button and auto-expand container (career timeline still shows)
      var phase3cBtn = document.getElementById('phase3c-expand');
      var phase3cExpandable = document.getElementById('phase3c-expandable');
      if (phase3cBtn) phase3cBtn.hidden = true;
      if (phase3cExpandable) phase3cExpandable.classList.add('expanded');

      // Rewrite heading and context for "ahead" case
      if (raiseHeading) raiseHeading.textContent = content.phase3c.ahead_heading || "Your pay is competitive";
      if (ctxLine) ctxLine.textContent = content.phase3c.ahead_context || "Your compensation meets or exceeds the market-adjusted rate for your experience. That\u2019s leverage \u2014 use it to help a coworker.";

      // Career timeline and wins still show (they remain relevant)
      return;
    }

    var halfGap = gapAnnual / 2;
    var projected = annual + halfGap;
    var maxVal = Math.max(annual, projected);

    // Ensure all elements are visible (may have been hidden from a prior negative-gap run)
    var barChart = document.getElementById('bar-chart');
    var barDiff = document.getElementById('bar-difference');
    var projCards = document.getElementById('projection-cards');
    var costTranslatorEl = document.getElementById('cost-translator');
    var urgencySectionEl = document.getElementById('urgency-section');
    if (barChart) barChart.hidden = false;
    if (barDiff) barDiff.hidden = false;
    if (projCards) projCards.hidden = false;
    if (costTranslatorEl) costTranslatorEl.hidden = false;
    if (urgencySectionEl) urgencySectionEl.hidden = false;

    // Restore expand button visibility (may have been hidden from a prior negative-gap run)
    var phase3cBtn = document.getElementById('phase3c-expand');
    var phase3cExpandable = document.getElementById('phase3c-expandable');
    if (phase3cBtn) phase3cBtn.hidden = false;
    if (phase3cExpandable) phase3cExpandable.classList.remove('expanded');

    document.getElementById('raise-heading').textContent = content.phase3c.raise_heading;
    document.getElementById('bar-current').style.width = (annual / maxVal * 80) + '%';
    document.getElementById('bar-projected').style.width = (projected / maxVal * 80) + '%';
    document.getElementById('bar-value-current').textContent = formatCurrency(annual);
    document.getElementById('bar-value-projected').textContent = formatCurrency(projected);
    document.getElementById('bar-difference').textContent = content.results.bar_difference_template.replace('{{amount}}', formatCurrency(halfGap));

    var rationaleEl = document.getElementById('half-gap-rationale');
    if (rationaleEl && content.phase3c.half_gap_rationale) {
      rationaleEl.textContent = content.phase3c.half_gap_rationale;
    }

    var periods = content.phase3c.projection_periods;
    var multipliers = [1, 5, 10];
    periods.forEach(function(period, i) {
      var el = document.querySelector('[data-period="' + period + '"]');
      if (el) el.textContent = '+' + formatCurrency(halfGap * multipliers[i]);
    });

    // Use local rent data for context line (form no longer collects rent)
    var localRent = resultsData.local && resultsData.local.rent ? resultsData.local.rent : 0;
    if (localRent > 0) {
      var months = Math.floor(halfGap / localRent);
      document.getElementById('context-line').textContent =
        content.results.context_rent_template.replace('{{months}}', months);
    } else {
      var groceryMonths = Math.floor(halfGap / 400);
      document.getElementById('context-line').textContent =
        content.results.context_grocery_template.replace('{{months}}', groceryMonths);
    }

    renderCostTranslator();
    renderUrgencyChart();
  }

  // ============================================
  // COST TRANSLATOR VISUALIZATION
  // ============================================
  function renderCostTranslator() {
    var local = resultsData.local;
    if (!local || (!local.rent && !local.food && !local.healthcare)) return;

    // Use the same gap source as phase3c for consistency
    var worth = resultsData.worth;
    var gapAnnual = resultsData.annualizedHeroGap != null
      ? resultsData.annualizedHeroGap
      : (worth && worth.worthGap ? worth.worthGap.annual : 0);
    if (gapAnnual <= 0) return;

    var costData = { rent: local.rent || 0, food: local.food || 0, healthcare: local.healthcare || 0 };
    var activeTab = 'rent';
    var container = document.getElementById('cost-translator');
    var iconGrid = document.getElementById('cost-icon-grid');
    var wrapper = container.querySelector('.cost-icon-grid-wrapper');
    var summary = document.getElementById('cost-summary');
    var tabs = container.querySelectorAll('.cost-tab');
    var slider = container.querySelector('.cost-slider');
    var switching = false;

    // Pre-populate all tab-months badges
    ['rent', 'food', 'healthcare'].forEach(function(cat) {
      var badge = document.getElementById('cost-tab-months-' + cat);
      if (badge) {
        var cost = costData[cat];
        var months = cost > 0 ? Math.min(12, Math.floor(gapAnnual / cost)) : 0;
        badge.textContent = months + ' mo';
      }
    });

    function buildIcons(category, monthsCovered) {
      iconGrid.textContent = '';
      for (var i = 0; i < 12; i++) {
        var iconDiv = document.createElement('div');
        iconDiv.className = 'cost-icon ' + (i < monthsCovered ? 'filled' : 'empty');
        iconDiv.innerHTML = COST_ICONS[category];
        iconGrid.appendChild(iconDiv);
      }
    }

    function revealIcons() {
      if (!prefersReducedMotion) {
        var icons = iconGrid.querySelectorAll('.cost-icon');
        icons.forEach(function(icon, idx) {
          setTimeout(function() { icon.classList.add('revealed'); }, idx * 80);
        });
      } else {
        iconGrid.querySelectorAll('.cost-icon').forEach(function(icon) { icon.classList.add('revealed'); });
      }
    }

    function setSummaryText(monthsCovered, category) {
      summary.textContent = '';
      var pre = document.createTextNode('Your gap covers ');
      var highlight = document.createElement('span');
      highlight.className = 'cost-highlight';
      highlight.textContent = monthsCovered + ' month' + (monthsCovered !== 1 ? 's' : '');
      var post = document.createTextNode(' of ' + COST_LABELS[category] + ' per year.');
      summary.appendChild(pre);
      summary.appendChild(highlight);
      summary.appendChild(post);
    }

    function updateDisplay(category, animate) {
      if (switching) return;
      activeTab = category;
      var monthlyCost = costData[category];
      var monthsCovered = monthlyCost > 0 ? Math.min(12, Math.floor(gapAnnual / monthlyCost)) : 0;

      // Update tab active states + slider position
      tabs.forEach(function(tab, idx) {
        var isActive = tab.getAttribute('data-tab') === category;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) slider.setAttribute('data-pos', idx);
      });

      if (animate && !prefersReducedMotion) {
        // Crossfade: add switching class → wait for fade out → swap → remove switching → reveal
        switching = true;
        summary.classList.add('switching');
        iconGrid.classList.add('switching');
        setTimeout(function() {
          setSummaryText(monthsCovered, category);
          buildIcons(category, monthsCovered);
          summary.classList.remove('switching');
          iconGrid.classList.remove('switching');
          revealIcons();
          switching = false;
        }, 200);
      } else {
        setSummaryText(monthsCovered, category);
        buildIcons(category, monthsCovered);
        revealIcons();
      }
    }

    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var cat = this.getAttribute('data-tab');
        if (cat !== activeTab) updateDisplay(cat, true);
      });
    });

    updateDisplay('rent', false);
    container.hidden = false;

    var costObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          updateDisplay(activeTab, false);
          costObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    costObserver.observe(wrapper || iconGrid);
  }

  // ============================================
  // CAREER TIMELINE VISUALIZATION
  // ============================================
  function renderCareerTimeline() {
    var breakdown = resultsData.impact.yearly_breakdown;
    if (!breakdown || breakdown.length === 0) return;

    var section = document.getElementById('career-timeline-section');
    var timeline = document.getElementById('career-timeline');

    timeline.innerHTML = '';

    var maxFairValue = 0;
    breakdown.forEach(function(entry) {
      if (entry.fair_value > maxFairValue) maxFairValue = entry.fair_value;
    });
    if (maxFairValue === 0) maxFairValue = 1;

    breakdown.forEach(function(entry) {
      var row = document.createElement('div');
      row.className = 'timeline-row';
      row.tabIndex = 0;

      var yearSpan = document.createElement('span');
      yearSpan.className = 'timeline-year';
      yearSpan.textContent = entry.year;

      var barsDiv = document.createElement('div');
      barsDiv.className = 'timeline-bars';

      var goldBar = document.createElement('div');
      goldBar.className = 'timeline-bar-gold';
      goldBar.style.width = (entry.income / maxFairValue * 100) + '%';

      var gapValue = entry.fair_value - entry.income;
      var redBar = document.createElement('div');
      redBar.className = 'timeline-bar-red';
      redBar.style.width = (Math.max(0, gapValue) / maxFairValue * 100) + '%';

      barsDiv.appendChild(goldBar);
      barsDiv.appendChild(redBar);

      var tooltip = document.createElement('div');
      tooltip.className = 'timeline-tooltip';
      tooltip.textContent = entry.year + ': Earned ' + formatCurrency(entry.income) + ' | Benchmark: ' + formatCurrency(entry.fair_value);

      row.appendChild(yearSpan);
      row.appendChild(barsDiv);
      row.appendChild(tooltip);
      timeline.appendChild(row);
    });

    // Auto-reveal rows on scroll into view (no trigger button)
    var timelineObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          revealTimelineRows();
          timelineObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    timelineObserver.observe(timeline);

    section.hidden = false;
  }

  function revealTimelineRows() {
    var rows = document.querySelectorAll('#career-timeline .timeline-row');
    if (prefersReducedMotion) {
      rows.forEach(function(row) { row.classList.add('revealed'); });
      return;
    }
    rows.forEach(function(row, idx) {
      setTimeout(function() { row.classList.add('revealed'); }, idx * 40);
    });
  }

  // ============================================
  // STICKY BOTTOM ACTION BAR
  // ============================================
  function initStickyBar() {
    var stickyBar = document.getElementById('sticky-bar');
    var phase3d = document.getElementById('phase3d');
    if (!stickyBar || !phase3d) return;

    stickyBar.hidden = false;

    var stickyObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          stickyBar.classList.remove('visible');
        } else {
          stickyBar.classList.add('visible');
        }
      });
    }, { threshold: 0.5 });

    stickyObserver.observe(phase3d);
  }

  // ============================================
  // GAP LEDGER (replaces old urgency SVG chart)
  // ============================================
  function renderUrgencyChart() {
    var worth = resultsData.worth;
    if (!worth) return;

    var opp = worth.opportunityCost;
    var lifetime = worth.lifetimeImpact;
    var gapAnnual = resultsData.annualizedHeroGap != null
      ? resultsData.annualizedHeroGap
      : (worth.worthGap ? worth.worthGap.annual : 0);
    if (gapAnnual <= 0) return;

    var section = document.getElementById('urgency-section');

    // --- Rate rows ---
    var dailyGap = opp ? opp.dailyGap : Math.round(gapAnnual / 240 * 100) / 100;
    var monthlyGap = opp ? opp.monthlyGap : Math.round(gapAnnual / 12 * 100) / 100;

    document.getElementById('gap-daily').textContent = formatCurrency(dailyGap);
    document.getElementById('gap-monthly').textContent = formatCurrency(monthlyGap);
    document.getElementById('gap-annual').textContent = formatCurrency(gapAnnual);

    // --- Anchor sentence ---
    var anchor = document.getElementById('gap-ledger-anchor');
    anchor.textContent = 'Based on your inputs, the gap between your pay and your market-adjusted value is:';

    // --- Year segment track ---
    var track = document.getElementById('gap-year-track');
    track.textContent = '';
    var startYear = resultsData.formValues ? resultsData.formValues.start_year : new Date().getFullYear();
    var currentYear = new Date().getFullYear();
    var retireAge = 65;
    var age = resultsData.formValues ? resultsData.formValues.age : null;
    var totalYears = age ? Math.max(retireAge - (age - (currentYear - startYear)), 10) : 30;
    var elapsed = Math.max(0, currentYear - startYear);
    var remaining = Math.max(1, totalYears - elapsed);
    var segmentCount = elapsed + remaining;

    for (var i = 0; i < segmentCount; i++) {
      var seg = document.createElement('div');
      seg.className = 'gap-year-segment ' + (i < elapsed ? 'elapsed' : 'remaining');
      track.appendChild(seg);
    }

    // --- Track caption ---
    var caption = document.getElementById('gap-track-caption');
    caption.textContent = elapsed + ' year' + (elapsed !== 1 ? 's' : '') + ' at this rate' +
      (remaining > 0 ? ' \u00B7 ' + remaining + ' year' + (remaining !== 1 ? 's' : '') + ' ahead' : '');

    // --- Counterfactual ---
    var cfValue = document.getElementById('gap-counterfactual-value');
    var cfSub = document.getElementById('gap-counterfactual-sub');
    var cfBlock = document.getElementById('gap-counterfactual');

    // Use lifetime projection for counterfactual, or estimate from remaining years
    var actNowGain = 0;
    if (lifetime && lifetime.yearlyProjection && lifetime.yearlyProjection.length > 0) {
      var last = lifetime.yearlyProjection[lifetime.yearlyProjection.length - 1];
      actNowGain = last.investmentValue || last.cumulativeLost || (gapAnnual * remaining);
    } else {
      actNowGain = gapAnnual * remaining;
    }
    cfValue.textContent = '+' + formatCurrency(actNowGain);
    cfSub.textContent = 'over your remaining ' + remaining + ' working years';

    section.hidden = false;

    // --- Staggered reveal animation ---
    var ledgerObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          // Reveal year segments with stagger
          var segments = track.querySelectorAll('.gap-year-segment');
          if (prefersReducedMotion) {
            segments.forEach(function(s) { s.classList.add('revealed'); });
          } else {
            segments.forEach(function(s, idx) {
              setTimeout(function() { s.classList.add('revealed'); }, idx * 50);
            });
          }

          // Reveal counterfactual block after segments
          var cfDelay = prefersReducedMotion ? 0 : segmentCount * 50 + 200;
          setTimeout(function() { cfBlock.classList.add('revealed'); }, cfDelay);

          ledgerObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    ledgerObserver.observe(section);
  }

  // ------------------------------------
  // DOWNLOAD CARD DATA
  // ------------------------------------
  function populateDownloadCardData() {
    const impact = resultsData.impact;
    const cumulative = impact.summary.unrealized_productivity_gains;
    const worth = resultsData.worth;
    const worthGapAnnual = (worth && worth.worthGap) ? worth.worthGap.annual : 0;

    if (resultsData.useWorthGapAsHero) {
      // Worth-gap mode: show annual market gap as hero
      document.getElementById('dl-hero').textContent = formatCurrency(worthGapAnnual) + '/yr';
      document.getElementById('dl-context').textContent = 'below the market rate for your role';
      document.getElementById('dl-secondary').textContent =
        formatCurrency(worthGapAnnual * Math.max(1, new Date().getFullYear() - resultsData.formValues.start_year)) +
        ' total market shortfall';
    } else {
      document.getElementById('dl-hero').textContent = formatCurrency(cumulative);
      document.getElementById('dl-context').textContent = content.results.hero_context_template;
      if (worthGapAnnual > 0) {
        document.getElementById('dl-secondary').textContent =
          formatCurrency(worthGapAnnual) + '/yr ' + content.results.secondary_context_template;
      }
    }
  }

  // ------------------------------------
  // VIDEO PREVIEW — static screenshot
  // ------------------------------------
  function populateVideoPreview() {
    var preview = document.getElementById('video-preview');
    if (preview) preview.hidden = false;
  }

  // ------------------------------------
  // DOWNLOAD
  // ------------------------------------
  function createStoneSvg() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 60 60');
    svg.setAttribute('class', 'stone-svg');

    // Progress ring (outer)
    var orbit = document.createElementNS(ns, 'circle');
    orbit.setAttribute('cx', '30'); orbit.setAttribute('cy', '30'); orbit.setAttribute('r', '27');
    orbit.setAttribute('class', 'stone-orbit');
    svg.appendChild(orbit);

    var progress = document.createElementNS(ns, 'circle');
    progress.setAttribute('cx', '30'); progress.setAttribute('cy', '30'); progress.setAttribute('r', '27');
    progress.setAttribute('class', 'stone-progress');
    progress.setAttribute('transform', 'rotate(-90 30 30)');
    svg.appendChild(progress);

    // Chalice icon — small bowl top, long thin stem, wide base (wine glass proportions)
    var chalice = document.createElementNS(ns, 'path');
    chalice.setAttribute('d', 'M20,12 C20,12 21,22 24,25 C26,27 28,28 30,28 C32,28 34,27 36,25 C39,22 40,12 40,12 M30,28 L30,46 M22,48 L38,48');
    chalice.setAttribute('class', 'stone-triangle');
    chalice.setAttribute('fill', 'none');
    chalice.setAttribute('stroke-linecap', 'round');
    svg.appendChild(chalice);

    return svg;
  }

  async function handleDownload() {
    const btn = document.getElementById('download-btn');
    const textEl = document.getElementById('download-btn-text');
    const svgIcon = btn.querySelector('svg:not(.stone-svg)');

    if (window.RupturaVideoCard && window.RupturaVideoCard.isSupported()) {
      btn.disabled = true;

      // Replace button content with philosopher's stone animation
      if (svgIcon) svgIcon.style.display = 'none';
      textEl.style.display = 'none';

      var stoneEl = document.createElement('div');
      stoneEl.className = 'philosopher-stone';
      stoneEl.appendChild(createStoneSvg());
      btn.appendChild(stoneEl);

      var progressCircle = stoneEl.querySelector('.stone-progress');
      var circumference = 2 * Math.PI * 27;
      progressCircle.style.strokeDasharray = circumference;
      progressCircle.style.strokeDashoffset = circumference;

      var videoComplete = false;

      function restoreVideoBtn() {
        if (stoneEl.parentNode) stoneEl.parentNode.removeChild(stoneEl);
        if (svgIcon) svgIcon.style.display = '';
        textEl.style.display = '';
        btn.disabled = false;
      }

      // Safety timeout: if generation hangs, fall back to PNG
      var videoTimeout = setTimeout(function() {
        if (videoComplete) return;
        videoComplete = true;
        restoreVideoBtn();
        console.warn('Video generation timed out after 30s, falling back to PNG');
        textEl.textContent = content.results.download_text;
        downloadPNG();
      }, 30000);

      window.RupturaVideoCard.generate(resultsData, content,
        function(p) {
          if (videoComplete) return;
          var offset = circumference * (1 - p);
          progressCircle.style.strokeDashoffset = offset;
        },
        function() {
          if (videoComplete) return;
          videoComplete = true;
          clearTimeout(videoTimeout);
          // Complete: gold burst then restore
          stoneEl.classList.add('stone-complete');
          setTimeout(function() {
            restoreVideoBtn();
            btn.classList.add('btn-success');
            textEl.textContent = content.results.download_success;
            announce('Your results card has been downloaded.');
            markStepComplete('download');
            setTimeout(function() { btn.classList.remove('btn-success'); textEl.textContent = content.results.download_text; }, 1500);
          }, 700);
        },
        function(err) {
          if (videoComplete) return;
          videoComplete = true;
          clearTimeout(videoTimeout);
          restoreVideoBtn();
          console.warn('Video card failed, falling back to PNG:', err);
          textEl.textContent = content.results.download_text;
          downloadPNG();
        }
      );
      return;
    }
    downloadPNG();
  }

  async function downloadPNG() {
    const btn = document.getElementById('download-btn');
    const textEl = document.getElementById('download-btn-text');
    const svgIcon = btn.querySelector('svg:not(.stone-svg)');

    // Show philosopher's stone loading animation
    btn.disabled = true;
    if (svgIcon) svgIcon.style.display = 'none';
    textEl.style.display = 'none';

    var stoneEl = document.createElement('div');
    stoneEl.className = 'philosopher-stone';
    stoneEl.appendChild(createStoneSvg());
    btn.appendChild(stoneEl);

    // Indeterminate progress: pulse the ring
    var progressCircle = stoneEl.querySelector('.stone-progress');
    var circumference = 2 * Math.PI * 27;
    progressCircle.style.strokeDasharray = circumference;
    progressCircle.style.strokeDashoffset = circumference * 0.3;

    function restoreButton() {
      if (stoneEl.parentNode) stoneEl.parentNode.removeChild(stoneEl);
      if (svgIcon) svgIcon.style.display = '';
      textEl.style.display = '';
      btn.disabled = false;
    }

    if (!html2canvasLoaded) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      html2canvasLoaded = true;
    }

    try {
      const target = document.getElementById('download-card');
      const canvas = await window.html2canvas(target, { width: 1080, height: 1920, scale: 1, backgroundColor: '#0C0F14', useCORS: true });
      canvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ruptura-impact.png';
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');

      stoneEl.classList.add('stone-complete');
      setTimeout(function() {
        restoreButton();
        btn.classList.add('btn-success');
        textEl.textContent = content.results.download_success;
        announce('Your results card has been downloaded.');
        markStepComplete('download');
        setTimeout(function() { btn.classList.remove('btn-success'); textEl.textContent = content.results.download_text; }, 1500);
      }, 700);
    } catch (err) {
      console.error('Download failed:', err);
      restoreButton();
    }
  }

  // ------------------------------------
  // SHARE
  // ------------------------------------
  async function handleShare() {
    const url = 'https://econ.ruptura.co';

    // Build share text using third-person framing
    var shareText = url;
    if (resultsData && resultsData.thirdPerson && resultsData.impact && resultsData.impact.summary) {
      var gap = resultsData.impact.summary.unrealized_productivity_gains;
      var tp = resultsData.thirdPerson;
      var hours = resultsData.yearInHours || 0;
      if (gap && gap > 0) {
        var shareArticle = indefiniteArticle(tp.jobTitle);
        shareText = shareArticle.charAt(0).toUpperCase() + shareArticle.slice(1) + ' ' + tp.jobTitle + ' in ' + tp.zipArea + ' earning ' + tp.salary;
        if (hours > 0) shareText += ' works approximately ' + hours + ' unpaid hours per year.';
        else shareText += ' has a ' + formatCurrency(gap) + ' productivity-wage gap.';
        shareText += ' ' + url;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: content.meta.title, text: shareText, url: url });
        announce('Results shared successfully.');
        markStepComplete('share');
      } catch (e) { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        announce('Link copied to clipboard.');
        var textEl = this.querySelector('span');
        if (textEl) {
          var original = textEl.textContent;
          textEl.textContent = content.results.share_copied;
          setTimeout(function() { textEl.textContent = original; }, 1500);
        }
        markStepComplete('share');
      } catch (e) {
        console.error('Copy failed', e);
      }
    }
  }

  // ------------------------------------
  // PROTEST POSTER GENERATOR
  // Two sizes: 'story' (1080x1920) and 'square' (1080x1080)
  // Third-person framing. Statement-style. Protest poster aesthetic.
  // ------------------------------------
  async function generatePoster(size) {
    if (!resultsData) return;

    var cumulative = resultsData.impact.summary.unrealized_productivity_gains;
    var worthGapAnnual = (resultsData.worth && resultsData.worth.worthGap) ? resultsData.worth.worthGap.annual : 0;
    if (cumulative <= 0 && worthGapAnnual <= 0) return;

    // Loading state: disable button and show generating text
    var btnId = size === 'square' ? 'poster-download-square' : 'poster-download-story';
    var posterBtn = document.getElementById(btnId);
    var originalPosterText = posterBtn ? posterBtn.textContent : '';
    if (posterBtn) posterBtn.disabled = true;
    if (posterBtn) posterBtn.textContent = 'Generating...';

    var tp = resultsData.thirdPerson || {};
    var sm = resultsData.survivalMetrics || {};
    var startYear = resultsData.formValues.start_year;
    var yearsSpan = Math.max(1, new Date().getFullYear() - startYear);
    var annualGap = resultsData.useWorthGapAsHero ? Math.round(worthGapAnnual) : Math.round(cumulative / yearsSpan);
    var totalValueGenerated = resultsData.impact.summary.total_value_generated || 0;
    var totalWagesReceived = resultsData.impact.summary.total_wages_received || 0;
    var annualValue = Math.round(totalValueGenerated / yearsSpan);
    var receivePercent = totalValueGenerated > 0 ? Math.round((totalWagesReceived / totalValueGenerated) * 100) : 0;
    var hours = resultsData.yearInHours || 0;

    if (totalValueGenerated <= 0) {
      if (posterBtn) posterBtn.disabled = false;
      if (posterBtn) posterBtn.textContent = originalPosterText;
      return;
    }
    var workdays = hours > 0 ? Math.round(hours / 8) : 0;
    var monthlyRent = (resultsData.local && resultsData.local.rent) ? resultsData.local.rent : 0;
    var rentMonths = monthlyRent > 0 ? Math.round(annualGap / monthlyRent) : 0;

    // Pre-load logo
    var logo = await ensurePosterLogo();

    // --- Build poster data ---
    var zipCode = resultsData.formValues.zip_code || '';
    var bulletHeader = (tp.jobTitle || 'WORKER').toUpperCase() + '  \u2022  ZIP ' + zipCode + '  \u2022  ' + Math.round(yearsSpan) + ' YRS';

    // --- Canvas setup ---
    var isStory = size !== 'square';
    var PW = 1080;
    var PH = isStory ? 1920 : 1080;

    var canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = PH;
    var ctx = canvas.getContext('2d');

    var BG = '#0C0F14';
    var GOLD = '#E8A633';
    var GOLD_DARK = '#D4A054';
    var RED = '#E63946';
    var WHITE = '#F0EDE8';
    var MUTED = '#9CA3AF';

    // Gradient background matching site aesthetic
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, PW, PH);
    var grad = ctx.createLinearGradient(0, 0, 0, PH);
    grad.addColorStop(0, BG);
    grad.addColorStop(0.3, 'rgba(232, 166, 51, 0.12)');
    grad.addColorStop(0.5, 'rgba(212, 160, 84, 0.10)');
    grad.addColorStop(0.75, 'rgba(196, 91, 74, 0.08)');
    grad.addColorStop(1, BG);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, PW, PH);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var cx = PW / 2;

    // Build personal intro line: "I have been working in (industry) for (X) years"
    var industryName = (tp.jobTitle || 'my industry').toLowerCase();
    var introLine = 'I have been working in ' + industryName + ' for ' + Math.round(yearsSpan) + ' years';

    if (isStory) {
      // ====== STORY SIZE (1080x1920) — Three-Tier Escalation ======

      // --- ZONE 1: Personal context ---
      ctx.fillStyle = WHITE;
      ctx.font = '400 30px "Inter", sans-serif';
      ctx.fillText(introLine, cx, 180);

      // --- ZONE 2: Value production → percentage received ---

      // Tier 1: What I produce
      ctx.fillStyle = WHITE;
      ctx.font = '700 44px "Space Grotesk", sans-serif';
      ctx.fillText('I PRODUCE', cx, 400);

      ctx.save();
      ctx.shadowColor = 'rgba(232, 166, 51, 0.25)';
      ctx.shadowBlur = 60;
      ctx.fillStyle = GOLD;
      ctx.font = '700 120px "JetBrains Mono", monospace';
      ctx.fillText('$' + annualValue.toLocaleString(), cx, 560);
      ctx.restore();

      ctx.fillStyle = MUTED;
      ctx.font = '400 28px "Inter", sans-serif';
      ctx.fillText('in value per year', cx, 650);

      // Tier 2: What I receive
      ctx.fillStyle = WHITE;
      ctx.font = '700 44px "Space Grotesk", sans-serif';
      ctx.fillText('BUT I ONLY KEEP', cx, 840);

      ctx.save();
      ctx.shadowColor = 'rgba(230, 57, 70, 0.3)';
      ctx.shadowBlur = 50;
      ctx.fillStyle = RED;
      ctx.font = '700 140px "JetBrains Mono", monospace';
      ctx.fillText(receivePercent + '%', cx, 1020);
      ctx.restore();

      ctx.fillStyle = MUTED;
      ctx.font = '400 26px "Inter", sans-serif';
      ctx.fillText('of my own value', cx, 1120);

      // Tier 3: The gap in dollars
      if (annualGap > 0) {
        ctx.fillStyle = WHITE;
        ctx.font = '400 28px "Inter", sans-serif';
        ctx.fillText("That's", cx, 1260);

        ctx.save();
        ctx.shadowColor = 'rgba(232, 166, 51, 0.2)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = GOLD;
        ctx.font = '700 72px "JetBrains Mono", monospace';
        ctx.fillText('$' + annualGap.toLocaleString() + '/yr', cx, 1360);
        ctx.restore();

      }

      // --- ZONE 3: Footer (logo only) ---

      // Logo
      if (logo) {
        var logoH = 36;
        var logoW = Math.round(logoH * (1062 / 135));
        ctx.drawImage(logo, cx - logoW / 2, PH - 130, logoW, logoH);
      } else {
        ctx.fillStyle = GOLD_DARK;
        ctx.font = '700 22px "Space Grotesk", sans-serif';
        if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '6px';
        ctx.fillText('RUPTURA', cx, PH - 115);
        if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
      }

    } else {
      // ====== SQUARE SIZE (1080x1080) — Three-Tier Compressed ======

      // --- Context header ---
      ctx.save();
      ctx.fillStyle = WHITE;
      ctx.font = '400 22px "Inter", sans-serif';
      ctx.fillText(introLine, cx, 80);

      // --- Tier 1: What I produce ---
      ctx.fillStyle = WHITE;
      ctx.font = '700 34px "Space Grotesk", sans-serif';
      ctx.fillText('I PRODUCE', cx, 200);

      ctx.save();
      ctx.shadowColor = 'rgba(232, 166, 51, 0.25)';
      ctx.shadowBlur = 40;
      ctx.fillStyle = GOLD;
      ctx.font = '700 80px "JetBrains Mono", monospace';
      ctx.fillText('$' + annualValue.toLocaleString(), cx, 300);
      ctx.restore();

      ctx.fillStyle = MUTED;
      ctx.font = '400 22px "Inter", sans-serif';
      ctx.fillText('in value per year', cx, 365);

      // --- Tier 2: What I receive ---
      ctx.fillStyle = WHITE;
      ctx.font = '700 34px "Space Grotesk", sans-serif';
      ctx.fillText('BUT I ONLY KEEP', cx, 470);

      ctx.save();
      ctx.shadowColor = 'rgba(230, 57, 70, 0.3)';
      ctx.shadowBlur = 40;
      ctx.fillStyle = RED;
      ctx.font = '700 96px "JetBrains Mono", monospace';
      ctx.fillText(receivePercent + '%', cx, 580);
      ctx.restore();

      ctx.fillStyle = MUTED;
      ctx.font = '400 20px "Inter", sans-serif';
      ctx.fillText('of my own value', cx, 645);

      // --- Tier 3: The gap ---
      if (annualGap > 0) {
        ctx.fillStyle = GOLD;
        ctx.font = '700 48px "JetBrains Mono", monospace';
        ctx.fillText('$' + annualGap.toLocaleString() + '/yr', cx, 760);

      }

      // --- Footer (logo only) ---
      if (logo) {
        var logoH = 28;
        var logoW = Math.round(logoH * (1062 / 135));
        ctx.drawImage(logo, cx - logoW / 2, PH - 60, logoW, logoH);
      } else {
        ctx.fillStyle = GOLD_DARK;
        ctx.font = '700 18px "Space Grotesk", sans-serif';
        if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '5px';
        ctx.fillText('RUPTURA', cx, PH - 50);
        if (typeof ctx.letterSpacing !== 'undefined') ctx.letterSpacing = '0px';
      }
    }

    // Download
    var filename = isStory ? 'ruptura-poster-story.png' : 'ruptura-poster-square.png';
    canvas.toBlob(function(blob) {
      if (!blob) {
        if (posterBtn) posterBtn.disabled = false;
        if (posterBtn) posterBtn.textContent = originalPosterText;
        return;
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 1000);

      // Restore button
      if (posterBtn) posterBtn.disabled = false;
      if (posterBtn) posterBtn.textContent = originalPosterText;
    }, 'image/png');
  }

  // Poster text wrapping helper (centers multi-line text around a Y position)
  function wrapTextPoster(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var lines = [];
    var line = '';
    for (var i = 0; i < words.length; i++) {
      var testLine = line + words[i] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && i > 0) {
        lines.push(line.trim());
        line = words[i] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    var startY = y - ((lines.length - 1) * lineHeight) / 2;
    for (var j = 0; j < lines.length; j++) {
      ctx.fillText(lines[j], x, startY + j * lineHeight);
    }
  }

  // ------------------------------------
  // NEGOTIATION SCRIPT
  // ------------------------------------
  async function handleNegotiation() {
    const btn = document.getElementById('negotiation-btn');
    const collectBtn = document.getElementById('collect-btn');
    const scriptContent = document.getElementById('script-content');
    const scriptInner = document.getElementById('script-inner');

    if (scriptInner.children.length > 0) {
      if (!scriptContent.classList.contains('expanded')) {
        scriptContent.classList.add('expanded');
      }
      scriptContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    btn.disabled = true;
    if (collectBtn) collectBtn.disabled = true;
    var stickyBtn = document.getElementById('sticky-script-btn');
    if (stickyBtn) stickyBtn.disabled = true;
    const btnText = document.getElementById('negotiation-btn-text');
    const collectBtnText = document.getElementById('collect-btn-text');
    const originalText = btnText ? btnText.textContent : '';
    const originalCollectText = collectBtnText ? collectBtnText.textContent : '';
    if (btnText) btnText.textContent = content.form.calculating_text;
    if (collectBtnText) collectBtnText.textContent = content.form.calculating_text;

    try {
      const worth = resultsData.worth || {};
      const data = await fetchJSON('/api/negotiation-script', {
        method: 'POST',
        body: {
          current_salary: resultsData.annualSalary,
          frequency: 'annual',
          market_median: (worth && worth.marketData && worth.marketData.adjustedMedian)
            ? worth.marketData.adjustedMedian * 1680
            : null,
          years_at_company: resultsData.formValues.years_experience,
          industry: resultsData.formValues.industry || null,
          role: resultsData.formValues.role_level || null,
        }
      });

      // Build talking points + analytics from API data and resultsData
      var impact = resultsData.impact;
      var worthData = resultsData.worth || {};
      var yearsWorked = new Date().getFullYear() - resultsData.formValues.start_year;
      var totalValueGen = impact.summary.total_value_generated;
      var totalWages = impact.summary.total_wages_received;
      var cumulativeGap = impact.summary.unrealized_productivity_gains;
      var annualizedGap = yearsWorked > 0 ? Math.round(cumulativeGap / yearsWorked) : 0;
      var heroGap = resultsData.annualizedHeroGap || annualizedGap;
      var industryName = resultsData.formValues.industry || 'your industry';
      var roleName = resultsData.formValues.role_level || 'your role';

      // Build sections as structured objects for both on-screen and print
      var sections = [];

      // Section 1: Your Numbers (the core facts)
      var numbersBullets = [];
      if (totalValueGen > 0) {
        numbersBullets.push('Value produced over your career: ' + formatCurrency(totalValueGen));
        numbersBullets.push('Total compensation received: ' + formatCurrency(totalWages));
      }
      if (heroGap > 0) {
        numbersBullets.push('Annual gap: ' + formatCurrency(heroGap) + '/yr');
      }
      if (data.marketMedian) {
        numbersBullets.push('Market median for your role and area: ' + formatCurrency(data.marketMedian) + '/yr');
      }
      numbersBullets.push('Your current pay: ' + formatCurrency(resultsData.annualSalary) + '/yr');
      sections.push({ title: 'Your Numbers', bullets: numbersBullets });

      // Section 2: How We Calculated This
      var calcBullets = [];
      if (impact.methodology) {
        calcBullets.push('Value produced is based on industry-specific productivity data from the Bureau of Labor Statistics. In ' + industryName + ', productivity has outpaced wages by ' + (impact.metrics.gap ? impact.metrics.gap.value : 'a significant margin') + ' since ' + resultsData.formValues.start_year + '.');
        calcBullets.push('We apply a conservative 25% attribution share \u2014 not all productivity gains flow to individual workers. Capital, technology, and overhead absorb the rest.');
        if (impact.inputs && impact.inputs.occupation_factor) {
          calcBullets.push('Your role level (' + roleName + ') adjusts the estimate using OEWS occupational wage percentiles.');
        }
        calcBullets.push('Compensation is modeled year-by-year using CPI inflation and experience growth, calibrated to your actual starting and current salary.');
      }
      sections.push({ title: 'How Value Produced Is Calculated', bullets: calcBullets });

      // Section 3: Talking Points (what to actually say)
      var talkingPoints = [];
      if (data.mode === 'at_above_market') {
        talkingPoints.push('Your pay exceeds the market median by ' + data.marketDiffPercent + '%. You are in a strong position.');
        talkingPoints.push('Focus on maintaining your position: document wins, stay current on market trends.');
        (data.recommendations || []).forEach(function(r) { talkingPoints.push(r); });
      } else if (data.mode === 'below_market') {
        if (data.theNumber) {
          talkingPoints.push('Your target: ' + formatCurrency(data.theNumber.experienceAdjustedTarget) + '/yr (a ' + data.theNumber.raisePercentage + '% adjustment)');
        }
        talkingPoints.push('"Based on BLS occupational wage data, the market rate for this role is ' + formatCurrency(data.marketMedian) + '. My compensation is ' + data.marketDiffPercent + '% below that benchmark."');
        if (yearsWorked > 3) {
          talkingPoints.push('"I have been in this role for ' + yearsWorked + ' years. Workers at my experience level typically earn at or above market median."');
        }
        talkingPoints.push('Lead with your contributions, not your needs.');
        talkingPoints.push('Use a precise number \u2014 research shows precise asks are more effective than round numbers.');
      } else {
        talkingPoints.push('Market data was not available for this specific role and location.');
        talkingPoints.push('Look up your occupation at bls.gov/oes for the actual market median in your area.');
        (data.recommendations || []).forEach(function(r) { talkingPoints.push(r); });
      }
      sections.push({ title: 'Talking Points', bullets: talkingPoints });

      // Section 4: If They Push Back (only for below-market)
      if (data.mode === 'below_market' && data.counterofferResponses) {
        var counterBullets = [];
        if (data.counterofferResponses.lowBall) counterBullets.push('Low offer: ' + data.counterofferResponses.lowBall);
        if (data.counterofferResponses.waitUntilReview) counterBullets.push('"Wait until review": ' + data.counterofferResponses.waitUntilReview);
        if (data.counterofferResponses.noRoomInBudget) counterBullets.push('"No budget": ' + data.counterofferResponses.noRoomInBudget);
        if (data.counterofferResponses.needToThinkAboutIt) counterBullets.push('"Need to think": ' + data.counterofferResponses.needToThinkAboutIt);
        sections.push({ title: 'If They Push Back', bullets: counterBullets });
      }

      // Section 5: Preparation Notes (all paths)
      if (data.prepNotes) {
        var prepBullets = [];
        if (data.prepNotes.bestTimeToAsk) prepBullets.push('Best time to ask: ' + data.prepNotes.bestTimeToAsk);
        if (data.prepNotes.documentEverything) prepBullets.push(data.prepNotes.documentEverything);
        if (data.prepNotes.followUpEmail) prepBullets.push(data.prepNotes.followUpEmail);
        sections.push({ title: 'Preparation', bullets: prepBullets });
      }

      // Section 6: Data Sources
      var sourceBullets = [
        'Bureau of Labor Statistics \u2014 CPI inflation, occupational wages (OEWS)',
        'Economic Policy Institute \u2014 productivity-wage gap (1979\u2013present)',
        'Bureau of Economic Analysis \u2014 regional price parities, industry value added',
      ];
      sections.push({ title: 'Data Sources', bullets: sourceBullets });

      // Render sections using safe DOM methods (no innerHTML)
      while (scriptInner.firstChild) scriptInner.removeChild(scriptInner.firstChild);
      sections.forEach(function(s) {
        var div = document.createElement('div');
        div.className = 'script-section';
        var title = document.createElement('div');
        title.className = 'script-section-title';
        title.textContent = s.title;
        div.appendChild(title);

        var list = document.createElement('ul');
        list.className = 'script-bullet-list';
        s.bullets.forEach(function(b) {
          var li = document.createElement('li');
          li.className = 'script-bullet';
          li.textContent = b;
          list.appendChild(li);
        });
        div.appendChild(list);
        scriptInner.appendChild(div);
      });

      addSaveScriptButton(scriptInner, sections);
      scriptContent.classList.add('expanded');
      announce('Negotiation script generated. Review your personalized talking points below.');
      scriptContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
      markStepComplete('negotiate');
    } catch (err) {
      console.error('Negotiation script error:', err);
    }

    if (btnText) btnText.textContent = originalText;
    btn.disabled = false;
    if (collectBtnText) collectBtnText.textContent = originalCollectText;
    if (collectBtn) collectBtn.disabled = false;
    if (stickyBtn) stickyBtn.disabled = false;
  }

  // ------------------------------------
  // SAVE SCRIPT (PRINT-FRIENDLY ONE-PAGER)
  // ------------------------------------
  function addSaveScriptButton(container, sections) {
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn-secondary btn-full-width';
    saveBtn.style.marginTop = '24px';
    saveBtn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>' +
      '<span>Print Talking Points</span>';

    saveBtn.addEventListener('click', function() {
      var salary = formatCurrency(resultsData.annualSalary);
      var heroGap = resultsData.annualizedHeroGap || 0;
      var impact = resultsData.impact;
      var totalValueGen = impact ? formatCurrency(impact.summary.total_value_generated) : '$0';
      var totalWages = impact ? formatCurrency(impact.summary.total_wages_received) : '$0';

      // Build print-friendly HTML document using safe string construction
      // All dynamic values are escaped via escapeHtml before insertion
      var parts = [];
      parts.push('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">');
      parts.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
      parts.push('<title>Ruptura - Your Talking Points</title><style>');
      parts.push('*{box-sizing:border-box;margin:0;padding:0}');
      parts.push('body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a1a;line-height:1.6;max-width:700px;margin:0 auto;padding:40px 24px}');
      parts.push('.header{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #D4A054}');
      parts.push('.header h1{font-size:22px;font-weight:700;margin-bottom:4px}');
      parts.push('.header p{font-size:13px;color:#666}');
      parts.push('.analytics{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}');
      parts.push('.analytics-item{flex:1;min-width:120px;background:#f8f8f8;border-radius:8px;padding:12px;text-align:center}');
      parts.push('.analytics-label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.05em}');
      parts.push('.analytics-value{font-size:16px;font-weight:700;margin-top:4px}');
      parts.push('.section{margin-bottom:20px}');
      parts.push('.section-title{font-size:13px;font-weight:600;color:#D4A054;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #eee}');
      parts.push('.bullet-list{list-style:none;padding:0}');
      parts.push('.bullet-list li{font-size:14px;color:#333;padding:4px 0 4px 16px;position:relative}');
      parts.push('.bullet-list li:before{content:"\\2022";position:absolute;left:0;color:#D4A054;font-weight:700}');
      parts.push('.footer{margin-top:28px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#999}');
      parts.push('@media print{body{padding:16px}.analytics-item{border:1px solid #ddd}}');
      parts.push('</style></head><body>');
      parts.push('<div class="header"><h1>Your Talking Points</h1><p>Prepared by Ruptura</p></div>');
      parts.push('<div class="analytics">');
      parts.push('<div class="analytics-item"><div class="analytics-label">Current Salary</div><div class="analytics-value">' + escapeHtml(salary) + '</div></div>');
      parts.push('<div class="analytics-item"><div class="analytics-label">Value Produced</div><div class="analytics-value">' + escapeHtml(totalValueGen) + '</div></div>');
      parts.push('<div class="analytics-item"><div class="analytics-label">Total Received</div><div class="analytics-value">' + escapeHtml(totalWages) + '</div></div>');
      if (heroGap > 0) {
        parts.push('<div class="analytics-item"><div class="analytics-label">Annual Gap</div><div class="analytics-value">' + escapeHtml(formatCurrency(heroGap)) + '/yr</div></div>');
      }
      parts.push('</div>');

      sections.forEach(function(s) {
        parts.push('<div class="section"><div class="section-title">' + escapeHtml(s.title) + '</div>');
        parts.push('<ul class="bullet-list">');
        s.bullets.forEach(function(b) {
          parts.push('<li>' + escapeHtml(b) + '</li>');
        });
        parts.push('</ul></div>');
      });

      parts.push('<div class="footer">Generated by Ruptura | ruptura.co | Data from BLS, EPI, BEA</div>');
      parts.push('</body></html>');

      // Open in new tab and trigger print
      var w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(parts.join(''));
        w.document.close();
        setTimeout(function() { w.print(); }, 500);
      }
    });

    container.appendChild(saveBtn);
  }

  // ------------------------------------
  // SCROLL OBSERVER
  // ------------------------------------
  function initScrollObserver() {
    const lineObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.getAttribute('data-index')) || 0;
          if (!prefersReducedMotion) {
            setTimeout(() => { entry.target.classList.add('visible'); }, idx * 150);
          } else {
            entry.target.classList.add('visible');
          }
          lineObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.opening-line, .opening-reveal').forEach(el => lineObserver.observe(el));

    const fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          fadeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    // Staggered observer for commitment ladder steps
    var stepObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var steps = document.querySelectorAll('.commitment-step');
          var idx = Array.prototype.indexOf.call(steps, entry.target);
          var delay = prefersReducedMotion ? 0 : idx * 120;
          setTimeout(function() { entry.target.classList.add('visible'); }, delay);
          stepObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    const mutObs = new MutationObserver(() => {
      document.querySelectorAll('.stat-card:not(.visible), .validation-block:not(.visible), .win-card:not(.visible)').forEach(el => {
        fadeObserver.observe(el);
      });
      document.querySelectorAll('.commitment-step:not(.visible)').forEach(el => {
        stepObserver.observe(el);
      });
    });
    mutObs.observe(document.body, { childList: true, subtree: true, attributes: true });

    document.querySelectorAll('.stat-card, .validation-block, .win-card').forEach(el => {
      fadeObserver.observe(el);
    });
    document.querySelectorAll('.commitment-step').forEach(el => {
      stepObserver.observe(el);
    });

    const reframeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          reframeObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    const reframe = document.getElementById('reframe-statement');
    if (reframe) reframeObserver.observe(reframe);

    // Scroll warmth gradient
    if (!prefersReducedMotion) initScrollWarmth();
  }

  // ------------------------------------
  // SCROLL WARMTH — subtle background color shift
  // ------------------------------------
  function initScrollWarmth() {
    var layer = document.getElementById('scroll-warmth-layer');
    if (!layer) return;

    var lastUpdate = 0;
    var ticking = false;

    function updateWarmth() {
      var phase2 = document.getElementById('phase2');
      var phase3d = document.getElementById('phase3d');
      if (!phase2 || !phase3d) { ticking = false; return; }

      var start = phase2.offsetTop;
      var end = phase3d.offsetTop;
      var range = end - start;
      if (range <= 0) { ticking = false; return; }

      var scroll = window.scrollY;
      var progress = Math.max(0, Math.min(1, (scroll - start) / range));
      layer.style.setProperty('--scroll-warmth', progress.toFixed(3));
      ticking = false;
    }

    window.addEventListener('scroll', function() {
      var now = Date.now();
      if (now - lastUpdate < 50) return; // 50ms minimum between updates (~20fps)
      lastUpdate = now;
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateWarmth);
      }
    }, { passive: true });
  }

  // ------------------------------------
  // UTILITIES
  // ------------------------------------
  // ------------------------------------
  // COUNT-UP ANIMATION
  // ------------------------------------
  function countUp(element, targetValue, duration) {
    if (!targetValue || targetValue <= 0) return;
    if (prefersReducedMotion) {
      element.textContent = formatCurrency(targetValue);
      return;
    }
    duration = duration || 1200;
    var startTime = null;
    var startValue = 0;
    var target = Math.round(targetValue);

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function tick(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var easedProgress = easeOutCubic(progress);
      var currentValue = Math.round(startValue + (target - startValue) * easedProgress);
      element.textContent = formatCurrency(currentValue);
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  function formatCurrency(num) {
    if (num == null || isNaN(num)) return '$0';
    const abs = Math.abs(Math.round(num));
    const formatted = abs.toLocaleString('en-US');
    return (num < 0 ? '-$' : '$') + formatted;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function fetchJSON(url, opts = {}) {
    const config = { headers: { 'Content-Type': 'application/json' } };
    if (opts.method) config.method = opts.method;
    if (opts.body) config.body = JSON.stringify(opts.body);
    const resp = await fetch(url, config);
    if (!resp.ok) throw new Error('API ' + resp.status);
    return resp.json();
  }

  // ------------------------------------
  // HEADER SCROLL BEHAVIOR
  // ------------------------------------
  function initHeader() {
    // Header is always visible — no scroll-triggered show/hide
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
})();
