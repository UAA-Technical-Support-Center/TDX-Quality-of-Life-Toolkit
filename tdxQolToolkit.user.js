// ==UserScript==
// @name         TDX Quality of Life Toolkit
// @namespace    Any TDX Instance
// @version      2.0.0
// @description  General-purpose toolkit for any TeamDynamix (TDX) instance's ticket detail and update pages: feed auto-expand, system-entry filtering, service portal links, keyboard shortcuts, templates menu keyboard fix, and off-hold date validation. Domain is auto-detected — no @match editing required.
// @author       CJ Elardo, Alex Taylor, Claude
// @match        *://*/TDNext/Apps/*/Tickets/TicketDet*
// @match        *://*/TDNext/Apps/*/Tickets/Update*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @icon         https://www.google.com/s2/favicons?domain=teamdynamix.com
// @updateURL    https://internal-site.example.com/scripts/tdx-toolkit.user.js
// @downloadURL  https://internal-site.example.com/scripts/tdx-toolkit.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==========================================================================
  // General-purpose TDX toolkit. Domain is auto-detected via location.origin
  // — no manual @match editing needed to run on a different TDX instance.
  //
  // Consolidated from:
  //   - View or Copy Service Portal Ticket (v0.3)
  //   - TDX Always Expand Feed (PoC, rewritten to remove leaked setInterval)
  //   - Hide System Feed Entries
  //   - TDX Templates Menu Keyboard Fix
  //   - TeamDynamix Ticket Shortcuts (v1.0)
  //   - TDX Off Hold Date Validator (v1.0, rewritten to detect hold statuses
  //     dynamically instead of hardcoding instance-specific status IDs)
  // ==========================================================================

  const TICKET_DET_ANY_APP = /^\/TDNext\/Apps\/\d+\/Tickets\/TicketDet(\.aspx)?(?:$|[/?])/i;
  const TICKET_UPDATE_ANY_APP = /^\/TDNext\/Apps\/\d+\/Tickets\/Update(\.aspx)?(?:$|[/?])/i;

  // ---------- Module registry ----------
  const modules = [];
  const seenIds = new Set();

  function registerModule({ id, label, defaultEnabled = true, matches, init }) {
    if (!id || !label || typeof matches !== 'function' || typeof init !== 'function') {
      console.error('[toolkit] invalid module registration:', { id, label });
      return;
    }
    if (seenIds.has(id)) {
      console.error(`[toolkit] duplicate module id "${id}" — skipped`);
      return;
    }
    seenIds.add(id);
    modules.push({ id, label, defaultEnabled, matches, init });
  }

  // ---------- Register modules here ----------
  registerModule({
    id: 'service-portal-links',
    label: 'Service Portal View/Copy Buttons',
    defaultEnabled: true,
    matches: (pathname) => TICKET_DET_ANY_APP.test(pathname),
    init: initServicePortalLinks
  });

  registerModule({
    id: 'auto-expand-feed',
    label: 'Auto-Expand Feed',
    defaultEnabled: true,
    matches: (pathname) => TICKET_DET_ANY_APP.test(pathname),
    init: initAutoExpandFeed
  });

  registerModule({
    id: 'hide-system-entries',
    label: 'Hide System Feed Entries (checkbox)',
    defaultEnabled: true,
    matches: (pathname) => TICKET_DET_ANY_APP.test(pathname),
    init: initHideSystemEntries
  });

  registerModule({
    id: 'templates-menu-keyboard-fix',
    label: 'Templates Menu Keyboard Fix',
    defaultEnabled: true,
    matches: (pathname) => TICKET_UPDATE_ANY_APP.test(pathname),
    init: initTemplatesMenuKeyboardFix
  });

  registerModule({
    id: 'ticket-shortcuts',
    label: 'Ticket Keyboard Shortcuts',
    defaultEnabled: true,
    matches: (pathname) => TICKET_DET_ANY_APP.test(pathname),
    init: initTicketShortcuts
  });

  registerModule({
    id: 'off-hold-date-validator',
    label: 'Off Hold Date Validator',
    defaultEnabled: true,
    matches: (pathname) => TICKET_UPDATE_ANY_APP.test(pathname),
    init: initOffHoldDateValidator
  });

  // Add new modules here — just call registerModule({...})

  // ==========================================================================
  // Module implementations
  // ==========================================================================

  // ---------- Service Portal Links ----------
  // Domain is auto-detected from location.origin — works on any TDX
  // instance without editing. The numeric Client Portal Application ID
  // (the "123" in tdx.domain/TDClient/123/Portal/...) is NOT reliably auto-detectable
  // from a ticket page and must be configured once via the Tampermonkey menu.
  function initServicePortalLinks() {
    waitForElement('#btnRefresh', (btnRefresh) => {
      if (document.getElementById('toolkit-service-portal-open')) return; // already inserted

      const refreshLi = btnRefresh.parentNode;
      const toolbarList = refreshLi.parentNode;

      function getTicketId() {
        const ticketId = new URLSearchParams(window.location.search).get('TicketID');
        if (!ticketId) alert('Item ID not found!');
        return ticketId;
      }

      function buildPortalUrl(ticketId) {
        const portalAppId = getModuleOption('service-portal-links', 'portalAppId', '');
        if (!portalAppId) {
          alert('Set your Client Portal Application ID first via the Tampermonkey menu: "Set Portal App ID for Service Portal Links".');
          return null;
        }
        return `${location.origin}/TDClient/${portalAppId}/Portal/Requests/TicketRequests/TicketDet?TicketID=${ticketId}`;
      }

      const openLi = document.createElement('li');
      openLi.id = 'toolkit-service-portal-open';
      openLi.innerHTML = `<button type="button" class="btn btn-primary btn-sm" title="To Service Portal">
        <span class="fa fa-external-link fa-nopad" aria-hidden="true"></span>
        <span class="hidden-xs padding-left-xs">To Service Portal</span>
      </button>`;
      toolbarList.insertBefore(openLi, refreshLi.nextSibling);
      openLi.querySelector('button').addEventListener('click', () => {
        const ticketId = getTicketId();
        if (!ticketId) return;
        const url = buildPortalUrl(ticketId);
        if (url) window.open(url, '_blank');
      });

      const copyLi = document.createElement('li');
      copyLi.id = 'toolkit-service-portal-copy';
      copyLi.innerHTML = `<button type="button" class="btn btn-primary btn-sm" title="Copy Service Portal URL">
        <span class="fa fa-copy fa-nopad" aria-hidden="true"></span>
        <span class="hidden-xs padding-left-xs">Copy Service Portal URL</span>
      </button>`;
      toolbarList.insertBefore(copyLi, openLi.nextSibling);
      copyLi.querySelector('button').addEventListener('click', () => {
        const ticketId = getTicketId();
        if (!ticketId) return;
        const url = buildPortalUrl(ticketId);
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          const icon = copyLi.querySelector('.fa');
          icon.classList.remove('fa-copy');
          icon.classList.add('fa-check');
          setTimeout(() => {
            icon.classList.remove('fa-check');
            icon.classList.add('fa-copy');
          }, 2000);
        }, () => alert('Failed to copy URL.'));
      });
    });
  }

  // ---------- Auto-Expand Feed ----------
  function initAutoExpandFeed() {
    waitForElement('#ticketFeed', (feedRoot) => {
      function findMoreButton() {
        // Exact className match (not .btn-link alone) deliberately excludes
        // the "Show Relative Timestamps" button, which shares the same
        // container shape but has extra classes.
        const buttons = feedRoot.querySelectorAll('div.text-center button');
        for (const btn of buttons) {
          if (btn.className === 'btn btn-link') return btn;
        }
        return null;
      }

      function tryExpand() {
        const btn = findMoreButton();
        if (btn && !btn.hasAttribute('disabled')) {
          btn.click();
        }
      }

      tryExpand();
      const observer = new MutationObserver(tryExpand);
      observer.observe(feedRoot, { childList: true, subtree: true });
    });
  }

  // ---------- Hide System Feed Entries ----------
  function initHideSystemEntries() {
    waitForElement('#ticketFeed', (feedRoot) => {
      const CHECKBOX_ID = 'toolkit-show-system-checkbox';
      let showSystem = true;

      function applyFilter() {
        feedRoot.querySelectorAll('.feed-entry').forEach((entry) => {
          const isSystemEntry = !!entry.querySelector('.profile-image.system');
          if (isSystemEntry) {
            entry.style.display = showSystem ? '' : 'none';
          }
        });
      }

      function ensureCheckbox() {
        if (document.getElementById(CHECKBOX_ID)) return;
        const formGroup = feedRoot.querySelector('form.form-inline div.form-group');
        if (!formGroup) return;

        const label = document.createElement('label');
        label.className = 'checkbox-inline';
        label.htmlFor = CHECKBOX_ID;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = CHECKBOX_ID;
        checkbox.checked = showSystem;
        checkbox.addEventListener('change', () => {
          showSystem = checkbox.checked;
          applyFilter();
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(' Show System'));
        formGroup.appendChild(label);
      }

      ensureCheckbox();
      applyFilter();

      const observer = new MutationObserver(() => {
        ensureCheckbox();
        applyFilter();
      });
      observer.observe(feedRoot, { childList: true, subtree: true });
    });
  }

  // ---------- Templates Menu Keyboard Fix ----------
  let templatesMenuKeyboardFixInitialized = false;

  function initTemplatesMenuKeyboardFix() {
    if (templatesMenuKeyboardFixInitialized) return;
    templatesMenuKeyboardFixInitialized = true;

    const TOGGLE_ID = 'lnkShowTemplates';
    const OPEN_CLASS = 'js-kb-force-open';

    if (!document.getElementById('toolkit-templates-menu-kb-fix-style')) {
      const style = document.createElement('style');
      style.id = 'toolkit-templates-menu-kb-fix-style';
      style.textContent = `
        li.dropdown-submenu.${OPEN_CLASS} > ul.dropdown-menu {
          display: block !important;
        }
      `;
      document.head.appendChild(style);
    }

    function annotate(menu) {
      if (menu.dataset.kbFixed) return;
      menu.dataset.kbFixed = '1';
      menu.setAttribute('role', 'menu');
      menu.querySelectorAll(':scope > li > a').forEach(a => a.setAttribute('role', 'menuitem'));
      menu.querySelectorAll('li.dropdown-submenu > a').forEach(a => {
        a.setAttribute('aria-haspopup', 'true');
        if (!a.hasAttribute('aria-expanded')) a.setAttribute('aria-expanded', 'false');
      });
      menu.querySelectorAll('li.dropdown-submenu > ul.dropdown-menu').forEach(ul => {
        ul.setAttribute('role', 'menu');
        ul.querySelectorAll(':scope > li > a').forEach(a => a.setAttribute('role', 'menuitem'));
      });
    }

    function visibleItems(ul) {
      return Array.from(ul.children)
        .filter(li => li.tagName === 'LI')
        .map(li => li.querySelector(':scope > a'))
        .filter(a => a && a.offsetParent !== null);
    }

    function closeSubmenu(li) {
      li.classList.remove(OPEN_CLASS);
      const trigger = li.querySelector(':scope > a');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function closeAllSubmenus(scope) {
      scope.querySelectorAll('li.' + OPEN_CLASS).forEach(closeSubmenu);
    }

    function openSubmenu(li, menu) {
      closeAllSubmenus(menu);
      li.classList.add(OPEN_CLASS);
      const trigger = li.querySelector(':scope > a');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }

    document.addEventListener('keydown', function (e) {
      const menu = e.target.closest('ul.dropdown-menu.multi-level');
      if (!menu) return;
      annotate(menu);

      const currentA = e.target.closest('a');
      if (!currentA) return;
      const currentLi = currentA.closest('li');
      const parentUl = currentA.closest('ul.dropdown-menu');
      if (!parentUl) return;

      const items = visibleItems(parentUl);
      const idx = items.indexOf(currentA);

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault(); e.stopPropagation();
          (items[idx + 1] || items[0])?.focus();
          break;
        }
        case 'ArrowUp': {
          e.preventDefault(); e.stopPropagation();
          (items[idx - 1] || items[items.length - 1])?.focus();
          break;
        }
        case 'ArrowRight': {
          if (currentLi?.classList.contains('dropdown-submenu')) {
            e.preventDefault(); e.stopPropagation();
            openSubmenu(currentLi, menu);
            const sub = currentLi.querySelector(':scope > ul.dropdown-menu');
            visibleItems(sub)[0]?.focus();
          }
          break;
        }
        case 'ArrowLeft': {
          const ownerLi = parentUl.closest('li.dropdown-submenu');
          if (ownerLi && parentUl !== menu) {
            e.preventDefault(); e.stopPropagation();
            closeSubmenu(ownerLi);
            ownerLi.querySelector(':scope > a')?.focus();
          }
          break;
        }
        case 'Escape': {
          e.preventDefault(); e.stopPropagation();
          const ownerLi = parentUl.closest('li.dropdown-submenu');
          if (ownerLi && parentUl !== menu) {
            closeSubmenu(ownerLi);
            ownerLi.querySelector(':scope > a')?.focus();
          } else {
            closeAllSubmenus(menu);
            document.body.click(); // lets Bootstrap's own outside-click handler close the dropdown
            document.getElementById(TOGGLE_ID)?.focus();
          }
          break;
        }
        case 'Home': {
          e.preventDefault(); e.stopPropagation();
          items[0]?.focus();
          break;
        }
        case 'End': {
          e.preventDefault(); e.stopPropagation();
          items[items.length - 1]?.focus();
          break;
        }
      }
    }, true); // capture, so we run before/instead of Bootstrap's own dropdown keydown handler
  }

  // ---------- Ticket Keyboard Shortcuts ----------
  let ticketShortcutsInitialized = false;

  function initTicketShortcuts() {
    if (ticketShortcutsInitialized) return;
    ticketShortcutsInitialized = true;

    const shortcuts = {
      'u': 'btnUpdateTicket',   // Update
      'c': 'btnComment',        // Comment
      'm': 'divMergeInto',      // Merge Into
      't': 'btnTakeTicket',     // Take Service Request
    };

    function isTypingContext(target) {
      if (!target) return false;
      const tag = target.tagName ? target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
      if (target.isContentEditable) return true;
      if (target.closest && target.closest('.cke_editable')) return true;
      return false;
    }

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isTypingContext(e.target)) return;
      const key = e.key.toLowerCase();
      const elementId = shortcuts[key];
      if (!elementId) return;
      const el = document.getElementById(elementId);
      if (!el) return;
      e.preventDefault();
      el.click();
    }, true);
  }

  // ---------- Off Hold Date Validator ----------
  // Detects "this status requires a hold date" dynamically, by checking
  // whether TDX itself has shown the Goes-Off-Hold field — rather than
  // hardcoding a list of status IDs, which are specific to each TDX
  // instance's own status configuration and aren't portable.
  //
  // IMPORTANT: does NOT use a MutationObserver at all for detecting the
  // post-status-change DOM update. An earlier version watched the page's
  // <form> ancestor for childList changes — but on these ASP.NET pages the
  // entire page is wrapped in a single <form>, so that "scoped" observer was
  // really watching the whole document. Selecting a hold status appears to
  // trigger a partial postback that also rebuilds the CKEditor toolbar
  // (dozens of DOM insertions), each of which re-triggered our callback,
  // which itself forces a layout read — a feedback loop severe enough to
  // freeze the entire browser, not just the tab. Instead, we just recheck a
  // small, fixed number of times on a plain timer after a status change.
  // That's bounded no matter how much unrelated DOM activity a postback (or
  // a co-located rich text editor) causes elsewhere on the page.
  const DEFAULT_OFF_HOLD_THRESHOLD_DAYS = 14;
  let offHoldValidatorInitialized = false;

  function initOffHoldDateValidator() {
    if (offHoldValidatorInitialized) return;
    offHoldValidatorInitialized = true;

    let attachedInput = null;
    let attachedSelect = null;
    let warningMsg = null;
    let lastAppliedStateKey = null; // skip redundant DOM writes when nothing changed

    function isVisible(el) {
      return !!el && el.offsetParent !== null;
    }

    function ensureWarningMsg() {
      if (warningMsg && document.body.contains(warningMsg)) return warningMsg;
      warningMsg = document.createElement('span');
      warningMsg.id = 'toolkit-off-hold-warning';
      warningMsg.style.marginLeft = '10px';
      warningMsg.style.fontWeight = 'bold';
      warningMsg.style.display = 'none';
      const buttonContainer = document.getElementById('divButtonsContainer');
      if (buttonContainer) buttonContainer.appendChild(warningMsg);
      return warningMsg;
    }

    function applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, state) {
      const stateKey = JSON.stringify(state);
      if (stateKey === lastAppliedStateKey) return; // nothing changed — skip DOM writes
      lastAppliedStateKey = stateKey;

      if (state.kind === 'reset') {
        saveButton.disabled = false;
        saveButton.classList.remove('disabled');
        saveButton.style.opacity = '1';
        msg.style.display = 'none';
        if (goesOffHoldLabel) { goesOffHoldLabel.style.border = ''; goesOffHoldLabel.style.padding = ''; }
        goesOffHoldInput.style.border = '';
      } else {
        msg.textContent = state.text;
        msg.style.color = state.color;
        msg.style.display = 'inline';
        saveButton.disabled = state.disableSave;
        saveButton.classList.toggle('disabled', state.disableSave);
        saveButton.style.opacity = state.disableSave ? '0.5' : '1';
        if (goesOffHoldLabel) {
          goesOffHoldLabel.style.border = `2px solid ${state.color}`;
          goesOffHoldLabel.style.borderRadius = '4px';
          goesOffHoldLabel.style.padding = '2px 4px';
        }
        goesOffHoldInput.style.border = `2px solid ${state.color}`;
        goesOffHoldInput.style.borderRadius = '4px';
      }
    }

    function updateUI() {
      const goesOffHoldInput = document.getElementById('NewGoesOffHoldDate');
      const saveButton = document.getElementById('btnSubmit');
      if (!goesOffHoldInput || !saveButton) return; // not on this view (yet)

      const msg = ensureWarningMsg();
      const goesOffHoldGroup = goesOffHoldInput.closest('.form-group');
      const goesOffHoldLabel = goesOffHoldGroup ? goesOffHoldGroup.querySelector('label') : null;

      try {
        // TDX itself only shows this field when the selected status
        // requires an Off Hold date — so its visibility IS the "is this a
        // hold status" signal. No hardcoded status ID list needed, so this
        // works regardless of an instance's own status configuration.
        const isHoldStatus = isVisible(goesOffHoldInput);

        if (!isHoldStatus) {
          applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, { kind: 'reset' });
          return;
        }

        const rawValue = goesOffHoldInput.value.trim();
        if (!rawValue) {
          applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, {
            kind: 'warn', text: 'Set an Off Hold date before saving.', color: '#B73D26', disableSave: true
          });
          return;
        }

        const enteredDate = new Date(rawValue);
        const now = new Date();

        if (isNaN(enteredDate.getTime())) {
          console.warn('[toolkit] off-hold-date-validator: invalid date format:', rawValue);
          applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, {
            kind: 'warn', text: 'Invalid date format', color: '#B73D26', disableSave: true
          });
          return;
        }

        const diffDays = (enteredDate - now) / (1000 * 60 * 60 * 24);
        const thresholdDays = getModuleOption('off-hold-date-validator', 'thresholdDays', DEFAULT_OFF_HOLD_THRESHOLD_DAYS);

        if (enteredDate <= now) {
          applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, {
            kind: 'warn', text: 'Invalid date - you cannot set a date before now.', color: '#B73D26', disableSave: true
          });
        } else if (diffDays > thresholdDays) {
          applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, {
            kind: 'warn', text: `You set an Off Hold date ${Math.round(diffDays)} days from now.`, color: '#E77A1C', disableSave: false
          });
        } else {
          applyState(saveButton, goesOffHoldInput, goesOffHoldLabel, msg, { kind: 'reset' });
        }
      } catch (err) {
        console.error('[toolkit] off-hold-date-validator: error in updateUI:', err);
      }
    }

    function attachListenersIfNeeded() {
      const goesOffHoldInput = document.getElementById('NewGoesOffHoldDate');
      const statusSelect = document.getElementById('NewStatusId');

      if (goesOffHoldInput && goesOffHoldInput !== attachedInput) {
        goesOffHoldInput.addEventListener('input', updateUI);
        goesOffHoldInput.addEventListener('change', updateUI);
        attachedInput = goesOffHoldInput;
      }
      if (statusSelect && statusSelect !== attachedSelect) {
        statusSelect.addEventListener('change', handleStatusChange);
        attachedSelect = statusSelect;
      }
    }

    function handleStatusChange() {
      attachListenersIfNeeded();
      updateUI();
      // Recheck a handful of times in case an async partial postback swaps
      // in fresh DOM a moment later. Fixed delays, fixed count — bounded
      // regardless of how much unrelated DOM activity happens on the page.
      [100, 300, 600, 1000, 1600].forEach((delay) => {
        setTimeout(() => {
          attachListenersIfNeeded();
          updateUI();
        }, delay);
      });
    }

    waitForElement('#NewStatusId', () => {
      attachListenersIfNeeded();
      updateUI();
    });
  }

  // ==========================================================================
  // Config helpers
  // ==========================================================================
  const CONFIG_PREFIX = 'toolkit_';

  function isEnabled(moduleId, defaultEnabled) {
    return GM_getValue(CONFIG_PREFIX + moduleId + '_enabled', defaultEnabled);
  }

  function setEnabled(moduleId, value) {
    GM_setValue(CONFIG_PREFIX + moduleId + '_enabled', value);
  }

  function getModuleOption(moduleId, key, fallback) {
    return GM_getValue(CONFIG_PREFIX + moduleId + '_' + key, fallback);
  }

  function setModuleOption(moduleId, key, value) {
    GM_setValue(CONFIG_PREFIX + moduleId + '_' + key, value);
  }

  // ==========================================================================
  // Wait-for-element helper
  // ==========================================================================
  function waitForElement(finder, callback, timeoutMs = 15000) {
    const resolve = typeof finder === 'function'
      ? finder
      : () => document.querySelector(finder);

    const existing = resolve();
    if (existing) return callback(existing);

    const observer = new MutationObserver(() => {
      const el = resolve();
      if (el) {
        observer.disconnect();
        callback(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    if (timeoutMs) {
      setTimeout(() => observer.disconnect(), timeoutMs);
    }
  }

  // ==========================================================================
  // Router
  // ==========================================================================
  function runModulesForPath(pathname) {
    modules.forEach((mod) => {
      if (mod.matches(pathname) && isEnabled(mod.id, mod.defaultEnabled)) {
        try {
          mod.init();
        } catch (e) {
          console.error(`[toolkit] module "${mod.id}" failed:`, e);
        }
      }
    });
  }

  runModulesForPath(location.pathname);

  // ---------- SPA navigation detection ----------
  let lastPath = location.pathname;
  new MutationObserver(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      runModulesForPath(lastPath);
    }
  }).observe(document.body, { childList: true, subtree: true });

  // ==========================================================================
  // Minimal settings menu
  // ==========================================================================
  modules.forEach((mod) => {
    GM_registerMenuCommand(
      `${isEnabled(mod.id, mod.defaultEnabled) ? '✅' : '⬜'} ${mod.label}`,
      () => {
        const current = isEnabled(mod.id, mod.defaultEnabled);
        setEnabled(mod.id, !current);
        alert(`${mod.label} ${!current ? 'enabled' : 'disabled'}. Reload the page to apply.`);
      }
    );
  });

  // "Set Portal App ID" menu entry for service-portal-links
  GM_registerMenuCommand('Set Portal App ID for Service Portal Links', () => {
    const current = getModuleOption('service-portal-links', 'portalAppId', '');
    const next = prompt(
      'TDClient Client Portal Application ID (numeric — found in your Client Portal URL, e.g. the "123" in tdx.domain/TDClient/123/Portal/...):',
      current
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed && !/^\d+$/.test(trimmed)) {
      alert('Please enter a numeric Portal Application ID.');
      return;
    }
    setModuleOption('service-portal-links', 'portalAppId', trimmed);
    alert('Portal App ID updated. Reload the page to apply.');
  });

  // "Set off-hold warning threshold" menu entry
  GM_registerMenuCommand('Set Off Hold warning threshold (days)', () => {
    const current = getModuleOption('off-hold-date-validator', 'thresholdDays', DEFAULT_OFF_HOLD_THRESHOLD_DAYS);
    const next = prompt('Warn when the Off Hold date is more than this many days out:', current);
    const parsed = Number(next);
    if (next !== null && Number.isFinite(parsed) && parsed > 0) {
      setModuleOption('off-hold-date-validator', 'thresholdDays', parsed);
      alert('Off Hold warning threshold updated. Reload the page to apply.');
    } else if (next !== null) {
      alert('Please enter a positive number of days.');
    }
  });
})();
