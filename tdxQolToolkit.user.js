// ==UserScript==
// @name         TDX Quality of Life Toolkit
// @namespace    Any TDX Instance
// @version      2.1.0
// @description  General-purpose toolkit for any TeamDynamix (TDX) instance's ticket detail, update, and edit pages: feed auto-expand, system-entry filtering, service portal links, keyboard shortcuts, templates menu keyboard fix, off-hold date validation, and archived KB article highlighting (Client Portal KB pages). Domain is auto-detected — no @match editing required.
// @author       CJ Elardo, Alex Taylor, Claude
// @match        *://*/TDNext/Apps/*/Tickets/TicketDet*
// @match        *://*/TDNext/Apps/*/Tickets/Update*
// @match        *://*/TDNext/Apps/*/Tickets/Edit*
// @match        *://*/TDClient/*/Portal/KB/Article*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @icon         https://www.google.com/s2/favicons?domain=teamdynamix.com
// @homepage     https://github.com/UAA-Technical-Support-Center/TDX-Quality-of-Life-Toolkit
// @support      https://github.com/UAA-Technical-Support-Center/TDX-Quality-of-Life-Toolkit/issues
// @updateURL    https://github.com/UAA-Technical-Support-Center/TDX-Quality-of-Life-Toolkit/raw/refs/heads/main/tdxQolToolkit.user.js
// @downloadURL  https://github.com/UAA-Technical-Support-Center/TDX-Quality-of-Life-Toolkit/raw/refs/heads/main/tdxQolToolkit.user.js
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
  //   - TDX KB Archived Article Highlighter (v0.1.0)
  // ==========================================================================

  // ---------- Naming ----------
  // Prefix for everything this script puts on the page: element ids, class
  // names, data attributes, <style> ids, console tags, and flags set on
  // CKEditor instances. The UA-specific companion script (uaTdxQol.user.js)
  // runs alongside this one and uses 'ua-qol-', so the two never mistake
  // each other's elements for their own. Change this one line when forking.
  const ID_PREFIX = 'qol-';
  const LOG_TAG = `[${ID_PREFIX.replace(/-$/, '')}]`;       // "[qol]"
  const EDITOR_HOOK_FLAG = `_${ID_PREFIX}saveHooked`;        // "_qol-saveHooked"

  const TICKET_DET_ANY_APP = /^\/TDNext\/Apps\/\d+\/Tickets\/TicketDet(\.aspx)?(?:$|[/?])/i;
  const TICKET_UPDATE_ANY_APP = /^\/TDNext\/Apps\/\d+\/Tickets\/Update(\.aspx)?(?:$|[/?])/i;
  // Edit page shares the same btnSubmit Save button as Update, so
  // update-page-shortcuts covers both — but Templates Menu Fix and Off Hold
  // Date Validator are genuinely Update-specific (Templates dropdown and
  // off-hold status fields aren't part of the Edit form), so they stay
  // scoped to TICKET_UPDATE_ANY_APP alone.
  const TICKET_EDIT_ANY_APP = /^\/TDNext\/Apps\/\d+\/Tickets\/Edit(\.aspx)?(?:$|[/?])/i;
  // Client Portal KB article view: covers /KB/Article/<id>/<slug> and
  // /KB/ArticleDet?ID=<id>, but deliberately not /KB/ArticleEdit etc. (the
  // @match for this path is broader; this regex is the real gate).
  const KB_ARTICLE_ANY_PORTAL = /^\/TDClient\/\d+\/Portal\/KB\/Article(?:Det)?(?:\.aspx)?(?:$|\/)/i;

  // This script runs in Tampermonkey's sandboxed JS world (it uses GM_*
  // grants, not @grant none), so its own `window` is NOT the page's real
  // window — page-set globals like CKEDITOR are invisible to a plain
  // `window.CKEDITOR` lookup here. `unsafeWindow` is what Tampermonkey
  // provides specifically to reach into the real page window from a
  // sandboxed script; fall back to `window` in case this ever runs
  // unsandboxed instead.
  function getCKEditor() {
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    return pageWindow.CKEDITOR;
  }

  // ---------- Module registry ----------
  const modules = [];
  const seenIds = new Set();

  function registerModule({ id, label, defaultEnabled = true, matches, init }) {
    if (!id || !label || typeof matches !== 'function' || typeof init !== 'function') {
      console.error(LOG_TAG + ' invalid module registration:', { id, label });
      return;
    }
    if (seenIds.has(id)) {
      console.error(`${LOG_TAG} duplicate module id "${id}" — skipped`);
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

  registerModule({
    id: 'update-page-shortcuts',
    label: 'Update Page Keyboard Shortcuts',
    defaultEnabled: true,
    matches: (pathname) => TICKET_UPDATE_ANY_APP.test(pathname) || TICKET_EDIT_ANY_APP.test(pathname),
    init: initUpdatePageShortcuts
  });

  registerModule({
    id: 'archived-article-highlighter',
    label: 'Archived KB Article Highlighter',
    defaultEnabled: true,
    matches: (pathname) => KB_ARTICLE_ANY_PORTAL.test(pathname),
    init: initArchivedArticleHighlighter
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
      if (document.getElementById(ID_PREFIX + 'service-portal-open')) return; // already inserted

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
      openLi.id = ID_PREFIX + 'service-portal-open';
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
      copyLi.id = ID_PREFIX + 'service-portal-copy';
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
      const CHECKBOX_ID = ID_PREFIX + 'show-system-checkbox';
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
    const OPEN_CLASS = ID_PREFIX + 'kb-force-open';
    const STYLE_ID = ID_PREFIX + 'templates-menu-kb-fix-style';
    const FIXED_ATTR = 'data-' + ID_PREFIX + 'kb-fixed';

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        li.dropdown-submenu.${OPEN_CLASS} > ul.dropdown-menu {
          display: block !important;
        }
      `;
      document.head.appendChild(style);
    }

    function annotate(menu) {
      if (menu.hasAttribute(FIXED_ATTR)) return;
      menu.setAttribute(FIXED_ATTR, '1');
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
        case 'Enter':
        case ' ': {
          // Custom ARIA menus (role="menuitem") are expected to handle
          // activation themselves rather than rely on the browser's native
          // Enter-on-focused-link behavior, which is what was causing
          // Enter to move focus correctly but not actually select anything.
          e.preventDefault(); e.stopPropagation();
          currentA.click();
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
      'r': 'divReassignTicket', // Reassign
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

    hookFeedCommentSaveShortcut();
  }

  // CKEditor-specific hook for the feed's comment/reply editors. Unlike the
  // Update page's single static "Comments_Content" editor, the feed spawns a
  // fresh CKEditor instance (id "feed-rte-<number>") every time a comment or
  // reply box is opened, with no stable id on its Save button either — so
  // this listens for ANY editor matching that id pattern as it's created,
  // and locates its Save button by walking up to the nearest ancestor
  // containing a button with the floppy-disk icon, rather than relying on a
  // fixed element id or exact wrapper class name.
  function hookFeedCommentSaveShortcut() {
    const FEED_EDITOR_ID_PATTERN = /^feed-rte-\d+$/;
    const MAIN_COMMENT_EDITOR_ID = 'txtComments_txtEditor_txtBody';
    const MAIN_COMMENT_SAVE_BUTTON_ID = 'btnSaveComment';

    function findNearbySaveButton(fromEl) {
      let node = fromEl;
      for (let i = 0; i < 6 && node; i++) {
        const candidates = node.querySelectorAll('button.btn.btn-primary');
        for (const btn of candidates) {
          if (btn.querySelector('.fa-floppy-o')) return btn;
        }
        node = node.parentElement;
      }
      return null;
    }

    function attachToEditor(editor, findButton) {
      if (editor[EDITOR_HOOK_FLAG]) return; // idempotent per editor instance
      editor[EDITOR_HOOK_FLAG] = true;
      editor.on('key', function (evt) {
        const ck = getCKEditor();
        const comboCode = ck.CTRL + ck.ALT + 83; // Ctrl+Alt+S
        if (evt.data.keyCode === comboCode) {
          const btn = findButton(editor);
          if (btn) btn.click();
          evt.cancel();
          return false;
        }
      });
    }

    // Dispatches a newly-seen editor to the right hookup, based on its id:
    // the main "Add Comment" box has a stable id and a stable Save button
    // id, while feed replies get a fresh numbered id each time and have to
    // locate their Save button by walking nearby ancestors instead.
    function attachIfMatching(editor) {
      const id = editor.element && editor.element.$ && editor.element.$.id;
      if (id === MAIN_COMMENT_EDITOR_ID) {
        attachToEditor(editor, () => document.getElementById(MAIN_COMMENT_SAVE_BUTTON_ID));
      } else if (FEED_EDITOR_ID_PATTERN.test(id)) {
        attachToEditor(editor, (ed) => {
          const container = ed.container && ed.container.$;
          return container ? findNearbySaveButton(container) : null;
        });
      }
    }

    function attachToAllExisting() {
      const ck = getCKEditor();
      if (!(ck && ck.instances)) return;
      Object.values(ck.instances).forEach(attachIfMatching);
    }

    function registerInstanceReadyListener() {
      const ck = getCKEditor();
      if (!ck) return false;
      ck.on('instanceReady', function (evt) {
        attachIfMatching(evt.editor);
      });
      attachToAllExisting(); // catch anything already created before we attached
      return true;
    }

    // The main comment editor is static and present from page load, so
    // CKEDITOR itself should become available quickly — a bounded wait is
    // fine here (unlike feed-reply editors, which are genuinely
    // unpredictable in timing since they depend on user action).
    if (!registerInstanceReadyListener()) {
      let tries = 0;
      (function waitForCKEditor() {
        if (registerInstanceReadyListener()) return;
        tries++;
        if (tries < 40) setTimeout(waitForCKEditor, 250); // ~10s
      })();
    }

    // Per-entry "Comment" buttons spawn a fresh feed-rte-N editor shortly
    // after being clicked. Rather than polling for new instances from page
    // load indefinitely, only look once we know one is actually about to
    // appear — a short, bounded poll triggered by the click itself.
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('button.btn.btn-link');
      if (!btn || btn.textContent.trim() !== 'Comment') return;
      let tries = 0;
      (function pollForNewFeedEditor() {
        attachToAllExisting();
        tries++;
        if (tries < 20) setTimeout(pollForNewFeedEditor, 150); // ~3s
      })();
    }, true);
  }

  // ---------- Update Page Keyboard Shortcuts ----------
  let updatePageShortcutsInitialized = false;

  function initUpdatePageShortcuts() {
    if (updatePageShortcutsInitialized) return;
    updatePageShortcutsInitialized = true;

    const shortcuts = {
      's': 'btnSubmit', // Save
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
      // Ctrl+Alt+S works even while typing in most fields, since that's the
      // whole point of a modifier-based override. Chosen over plain Ctrl+S
      // (Firefox reserves that at the browser-chrome level — preventDefault
      // can't suppress its native Save Page dialog there) and over Alt+S
      // alone (collides with Firefox's History-menu accesskey on Windows/
      // Linux). Checked via e.code (physical key position) rather than
      // e.key (produced character), since Option remaps letters on Mac
      // keyboards and non-US layouts can produce different characters at
      // the same physical key. NOTE: this listener still can't reach
      // keystrokes typed inside the Comments box specifically, since that's
      // rendered inside a CKEditor <iframe> — see hookCKEditorSaveShortcut
      // below for that case.
      if (e.ctrlKey && e.altKey && !e.metaKey && e.code === 'KeyS') {
        e.preventDefault();
        const el = document.getElementById(shortcuts['s']);
        if (el) el.click();
        return;
      }

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

    hookCKEditorSaveShortcut(shortcuts);
  }

  // CKEditor-specific hook: the Comments box renders inside a CKEditor
  // <iframe>, a separate document the page-level keydown listener above
  // can't see into. CKEditor exposes its own 'key' event, fired for every
  // keystroke inside the editable area before its own default handling —
  // this bridges the gap without needing raw access to the iframe's DOM.
  function hookCKEditorSaveShortcut(shortcuts) {
    const COMMENTS_EDITOR_ID = 'Comments_Content';

    function attachToEditor(editor) {
      if (editor[EDITOR_HOOK_FLAG]) return; // idempotent, in case of re-init
      editor[EDITOR_HOOK_FLAG] = true;
      editor.on('key', function (evt) {
        const ck = getCKEditor();
        const comboCode = ck.CTRL + ck.ALT + 83; // Ctrl+Alt+S ('S' = keyCode 83)
        if (evt.data.keyCode === comboCode) {
          const el = document.getElementById(shortcuts['s']);
          if (el) el.click();
          evt.cancel();
          return false;
        }
      });
    }

    function tryAttachExisting() {
      const ck = getCKEditor();
      if (ck && ck.instances && ck.instances[COMMENTS_EDITOR_ID]) {
        attachToEditor(ck.instances[COMMENTS_EDITOR_ID]);
        return true;
      }
      return false;
    }

    if (tryAttachExisting()) return;

    let tries = 0;
    (function waitForCKEditor() {
      const ck = getCKEditor();
      if (ck) {
        ck.on('instanceReady', function (evt) {
          if (evt.editor.element && evt.editor.element.$.id === COMMENTS_EDITOR_ID) {
            attachToEditor(evt.editor);
          }
        });
        if (tryAttachExisting()) return; // instance may already exist by now
      }
      tries++;
      if (tries < 20) setTimeout(waitForCKEditor, 250); // give up after ~5s
    })();
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
      warningMsg.id = ID_PREFIX + 'off-hold-warning';
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
          console.warn(LOG_TAG + ' off-hold-date-validator: invalid date format:', rawValue);
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
        console.error(LOG_TAG + ' off-hold-date-validator: error in updateUI:', err);
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

      // Safety net: some date-picker widgets (jQuery UI / Kendo are both
      // loaded on these pages) set the field's value via JS without firing
      // a native 'input'/'change' event, which would otherwise leave the
      // validator stuck showing stale state after the user picks a date.
      // This is a plain fixed-rate timer, NOT a MutationObserver — a timer
      // fires at a predictable rate regardless of what else happens on the
      // page, so it can't turn into the reactive feedback loop that froze
      // the browser previously. updateUI() is a no-op when nothing has
      // actually changed, so each tick costs almost nothing.
      setInterval(() => {
        attachListenersIfNeeded();
        updateUI();
      }, 500);
    });
  }

  // ---------- Archived KB Article Highlighter ----------
  // Client Portal KB articles, technician view only (the public view has no
  // #divDetails panel, so this is a no-op there). When the article's status
  // is Archived, adds a red "ARCHIVED" badge to the <h1> and a banner above
  // it. TDX's own divArchivedWarning (below the tags) is left untouched.
  //
  // Colors are set explicitly rather than via Bootstrap's alert-danger /
  // label-danger, so a TDX theme override can't drop contrast below WCAG AA:
  //   Banner text  #7a1f1f on #f2dede  ~7.9:1  (AA and AAA)
  //   Badge text   #ffffff on #a94442  ~5.8:1  (AA)
  // Meaning is never carried by color alone — both say "ARCHIVED" in text.
  let archivedHighlighterInitialized = false;

  function initArchivedArticleHighlighter() {
    if (archivedHighlighterInitialized) return;
    archivedHighlighterInitialized = true;

    const ARCHIVED_STATUS = 'archived';
    const STATUS_DIV_ID = 'ctl00_ctl00_cpContent_cpContent_divStatus';
    const BANNER_ID = ID_PREFIX + 'archived-banner';
    const BADGE_ID = ID_PREFIX + 'archived-badge';
    const STYLE_ID = ID_PREFIX + 'archived-style';
    const HEADLINE_CLASS = ID_PREFIX + 'archived-headline';

    const CSS = `
      #${BANNER_ID} {
        color: #7a1f1f;
        background-color: #f2dede;
        border: 1px solid #ebccd1;
        border-left: 6px solid #a94442;
        border-radius: var(--tdx-border-radius, 4px);
        padding: 15px;
        margin: 20px 0 0;
      }
      #${BANNER_ID} .${HEADLINE_CLASS} {
        display: block;
        font-size: 1.25em;
        font-weight: 700;
        letter-spacing: 0.05em;
      }
      #${BADGE_ID} {
        background-color: #a94442;
        color: #ffffff;
        font-size: 0.55em;
        letter-spacing: 0.05em;
        vertical-align: middle;
        margin-right: 0.5em;
      }
    `;

    // Exact ASP.NET id first; suffix match as a fallback in case the
    // generated ctl00_... prefix ever changes.
    function findStatusDiv() {
      const details = document.getElementById('divDetails');
      if (!details) return null;
      return details.querySelector('#' + STATUS_DIV_ID)
        || details.querySelector('[id$="_divStatus"]');
    }

    // Prefer the status label span; fall back to the div's text minus the
    // "Status:" prefix if TDX ever drops the .label wrapper. Exact match so
    // a hypothetical "Pending Archive" status wouldn't trigger it.
    function getStatusText(statusDiv) {
      const label = statusDiv.querySelector('.label');
      const raw = label
        ? label.textContent
        : statusDiv.textContent.replace(/^\s*Status:\s*/i, '');
      return raw.trim();
    }

    function injectStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    function markArchived() {
      const main = document.getElementById('divMainContent');
      const h1 = main && main.querySelector('h1');
      if (!h1) return;

      injectStyle();

      if (!document.getElementById(BADGE_ID)) {
        const badge = document.createElement('span');
        badge.id = BADGE_ID;
        badge.className = 'label';
        badge.textContent = 'ARCHIVED';
        h1.insertBefore(badge, h1.firstChild);
      }

      if (!document.getElementById(BANNER_ID)) {
        const banner = document.createElement('div');
        banner.id = BANNER_ID;
        banner.innerHTML = `
          <span class="${HEADLINE_CLASS}">
            <span class="fa-solid fa-box-archive fa-fw" aria-hidden="true"></span>
            ARCHIVED
          </span>
          This article is archived.
        `;
        h1.parentNode.insertBefore(banner, h1);
      }
    }

    // Status is server-rendered, so this normally resolves immediately; the
    // short timeout just avoids lingering on pages without a Details panel.
    waitForElement(findStatusDiv, (statusDiv) => {
      if (getStatusText(statusDiv).toLowerCase() === ARCHIVED_STATUS) {
        markArchived();
      }
    }, 5000);
  }

  // ==========================================================================
  // Config helpers
  // ==========================================================================
  // Deliberately NOT derived from ID_PREFIX. These are the keys Tampermonkey
  // has already saved everyone's settings under (module toggles, Portal App
  // ID, Off Hold threshold); renaming would silently reset them. GM storage
  // is also per-script, so this can't collide with the UA companion script.
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
          console.error(`${LOG_TAG} module "${mod.id}" failed:`, e);
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
