/* board-ai.js — Board Mind chat panel for the Scenius Wall */
/* global window, document, indexedDB, fetch, CustomEvent */
(function () {
  'use strict';

  /* ── styles injected into the page ─────────────────────────── */
  var CSS = [
    '#ai-btn{position:fixed;bottom:62px;right:12px;z-index:31;',
    'width:42px;height:42px;border-radius:12px;',
    'background:rgba(20,27,46,.75);border:1px solid rgba(242,237,227,.18);',
    'color:#F2EDE3;font-size:18px;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;',
    'transition:.15s;user-select:none;box-shadow:0 4px 16px rgba(0,0,0,.35)}',
    '#ai-btn:hover{background:rgba(217,164,65,.8);border-color:#D9A441}',
    '#ai-btn.open{background:#D9A441;border-color:#D9A441;color:#141B2E}',

    '#ai-panel{position:fixed;bottom:0;left:0;right:0;z-index:45;',
    'height:46vh;min-height:280px;max-height:540px;',
    'background:#18243A;border-top:1px solid rgba(242,237,227,.12);',
    'display:flex;flex-direction:column;',
    'transform:translateY(102%);transition:transform .22s ease;',
    'box-shadow:0 -12px 44px rgba(0,0,0,.55)}',
    '#ai-panel.open{transform:translateY(0)}',

    '#ai-head{display:flex;align-items:center;gap:8px;',
    'padding:10px 14px;border-bottom:1px solid rgba(242,237,227,.09);flex:0 0 auto}',
    '.ai-brand{font-family:Fraunces,serif;font-weight:800;font-size:14px;',
    'color:#F2EDE3;flex:1;letter-spacing:-.01em}',
    '.ai-brand small{font-family:"IBM Plex Mono",monospace;font-weight:400;',
    'font-size:8.5px;letter-spacing:.18em;text-transform:uppercase;',
    'color:#D9A441;display:block;margin-top:-1px}',
    '#ai-clear{font-family:"IBM Plex Mono",monospace;font-size:10px;',
    'letter-spacing:.06em;text-transform:uppercase;cursor:pointer;',
    'color:rgba(242,237,227,.36);border:none;background:none;padding:4px 8px}',
    '#ai-clear:hover{color:rgba(242,237,227,.8)}',
    '#ai-close{font-size:18px;color:rgba(242,237,227,.4);cursor:pointer;',
    'background:none;border:none;padding:2px 8px;line-height:1}',
    '#ai-close:hover{color:#F2EDE3}',

    '#ai-log{flex:1;overflow-y:auto;padding:12px 14px;',
    'display:flex;flex-direction:column;gap:9px;scroll-behavior:smooth}',
    '#ai-log::-webkit-scrollbar{width:4px}',
    '#ai-log::-webkit-scrollbar-thumb{background:rgba(242,237,227,.14);border-radius:2px}',

    '.ai-msg{font-size:13px;line-height:1.5;max-width:88%;word-break:break-word}',
    '.ai-msg.user{align-self:flex-end;',
    'background:rgba(217,164,65,.15);border:1px solid rgba(217,164,65,.32);',
    'color:#F2EDE3;padding:7px 11px;border-radius:10px 10px 3px 10px}',
    '.ai-msg.ai{align-self:flex-start;',
    'background:rgba(242,237,227,.05);border:1px solid rgba(242,237,227,.11);',
    'color:#C8B98A;padding:7px 11px;border-radius:10px 10px 10px 3px}',
    '.ai-msg.ops{align-self:flex-start;',
    'background:rgba(63,184,175,.1);border:1px solid rgba(63,184,175,.3);',
    'color:#3FB8AF;padding:5px 10px;border-radius:8px;',
    'font-family:"IBM Plex Mono",monospace;font-size:10.5px;white-space:pre-line}',
    '.ai-msg.err{align-self:flex-start;',
    'background:rgba(194,73,61,.1);border:1px solid rgba(194,73,61,.28);',
    'color:#E07060;padding:7px 11px;border-radius:8px}',
    '.ai-thinking{color:rgba(242,237,227,.32);font-style:italic;',
    'font-family:"IBM Plex Mono",monospace;font-size:11px}',

    '#ai-form{display:flex;gap:8px;padding:10px 14px;',
    'border-top:1px solid rgba(242,237,227,.09);flex:0 0 auto}',
    '#ai-input{flex:1;background:rgba(242,237,227,.06);',
    'border:1px solid rgba(242,237,227,.15);color:#F2EDE3;',
    'border-radius:9px;padding:9px 12px;font-size:13px;',
    'font-family:Inter,system-ui,sans-serif;resize:none;',
    'min-height:40px;max-height:96px;line-height:1.4}',
    '#ai-input::placeholder{color:rgba(242,237,227,.36)}',
    '#ai-input:focus{outline:none;border-color:rgba(217,164,65,.45)}',
    '#ai-send{background:#D9A441;border:none;color:#141B2E;',
    'font-weight:700;font-size:13px;font-family:inherit;',
    'border-radius:9px;padding:9px 16px;cursor:pointer;white-space:nowrap;transition:.15s}',
    '#ai-send:hover{background:#c9943a}',
    '#ai-send:disabled{opacity:.4;cursor:default}',
  ].join('');

  var sEl = document.createElement('style');
  sEl.textContent = CSS;
  document.head.appendChild(sEl);

  document.body.insertAdjacentHTML('beforeend', [
    '<button id="ai-btn" title="Board Mind — AI assistant">✦</button>',
    '<div id="ai-panel">',
    '  <div id="ai-head">',
    '    <div class="ai-brand">Board Mind<small>canvas AI</small></div>',
    '    <button id="ai-clear">Clear</button>',
    '    <button id="ai-close">✕</button>',
    '  </div>',
    '  <div id="ai-log"></div>',
    '  <form id="ai-form" autocomplete="off">',
    '    <textarea id="ai-input" rows="1"',
    '      placeholder="Ask about the board, request new cards, surface connections… (Enter to send)"></textarea>',
    '    <button id="ai-send" type="submit">Send</button>',
    '  </form>',
    '</div>',
  ].join(''));

  /* ── element refs ───────────────────────────────────────────── */
  var panelEl  = document.getElementById('ai-panel');
  var btnEl    = document.getElementById('ai-btn');
  var logEl    = document.getElementById('ai-log');
  var inputEl  = document.getElementById('ai-input');
  var sendBtn  = document.getElementById('ai-send');

  /* ── state ──────────────────────────────────────────────────── */
  var history       = [];
  var busy          = false;
  var currentBoardId = null;

  /* ── IndexedDB for per-board conversation history ───────────── */
  var AI_DB    = 'sceniusAIDB';
  var AI_STORE = 'conversations';
  var aiDb     = null;

  function openAIDB() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(AI_DB, 1);
      req.onupgradeneeded = function (e) {
        e.target.result.createObjectStore(AI_STORE, { keyPath: 'boardId' });
      };
      req.onsuccess = function (e) { res(e.target.result); };
      req.onerror   = function () { rej(req.error); };
    });
  }

  function aiDbOp(mode, fn) {
    if (!aiDb) return Promise.resolve(null);
    return new Promise(function (res, rej) {
      var tx  = aiDb.transaction(AI_STORE, mode);
      var st  = tx.objectStore(AI_STORE);
      var req = fn(st);
      req.onsuccess = function () { res(req.result); };
      req.onerror   = function () { rej(req.error); };
    });
  }

  function loadHistory(boardId) {
    return aiDbOp('readonly', function (st) { return st.get(boardId); })
      .then(function (rec) { return (rec && rec.history) ? rec.history : []; })
      .catch(function () { return []; });
  }

  function saveHistory(boardId, hist) {
    return aiDbOp('readwrite', function (st) {
      return st.put({ boardId: boardId, history: hist });
    }).catch(function () {});
  }

  /* ── panel open / close ─────────────────────────────────────── */
  function openPanel() {
    var boardId = (window.SceniusBoard && window.SceniusBoard.getBoardId())
      ? window.SceniusBoard.getBoardId() : 'default';
    var promise = (boardId !== currentBoardId)
      ? loadHistory(boardId).then(function (h) {
          currentBoardId = boardId;
          history = h;
          rebuildLog();
        })
      : Promise.resolve();
    promise.then(function () {
      panelEl.classList.add('open');
      btnEl.classList.add('open');
      inputEl.focus();
      scrollLog();
    });
  }

  function closePanel() {
    panelEl.classList.remove('open');
    btnEl.classList.remove('open');
  }

  btnEl.addEventListener('click', function () {
    if (panelEl.classList.contains('open')) { closePanel(); } else { openPanel(); }
  });
  document.getElementById('ai-close').addEventListener('click', closePanel);
  document.getElementById('ai-clear').addEventListener('click', function () {
    if (!confirm('Clear this board\'s conversation history?')) return;
    history = [];
    saveHistory(currentBoardId, history);
    logEl.innerHTML = '';
  });

  /* ── board-switch event (fired by SceniusBoard adapter) ──────── */
  window.addEventListener('scenius:boardswitch', function (e) {
    var newId = e.detail && e.detail.id;
    if (newId && newId !== currentBoardId) {
      loadHistory(newId).then(function (h) {
        currentBoardId = newId;
        history = h;
        if (panelEl.classList.contains('open')) rebuildLog();
      });
    }
  });

  /* ── textarea auto-grow, Enter to send ─────────────────────── */
  inputEl.addEventListener('input', function () {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
  });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  /* ── log rendering ──────────────────────────────────────────── */
  function addMsg(text, cls) {
    var el = document.createElement('div');
    el.className = 'ai-msg ' + cls;
    el.textContent = text;
    logEl.appendChild(el);
    scrollLog();
    return el;
  }

  function scrollLog() { logEl.scrollTop = logEl.scrollHeight; }

  function rebuildLog() {
    logEl.innerHTML = '';
    history.forEach(function (h) {
      addMsg(h.content, h.role === 'user' ? 'user' : 'ai');
    });
  }

  /* ── apply board_ops returned by the function ───────────────── */
  function applyOps(ops) {
    if (!Array.isArray(ops) || !ops.length) return;
    var board = window.SceniusBoard;
    if (!board) return;
    var results = [];
    ops.forEach(function (op) {
      try {
        if (op.op === 'create_card') {
          var id = board.createCard(op.card || {});
          results.push('+ card "' + ((op.card && op.card.t) || '').slice(0, 36) + '"');
        } else if (op.op === 'update_card' && op.id) {
          board.updateCard(op.id, op.set || {});
          results.push('✎ updated ' + op.id);
        } else if (op.op === 'link_cards' && op.a && op.b) {
          board.linkCards(op.a, op.b);
          results.push('⥄ linked ' + op.a + ' ↔ ' + op.b);
        } else {
          results.push('? unknown op: ' + op.op);
        }
      } catch (e) {
        results.push('⚠ ' + op.op + ' failed: ' + e.message);
      }
    });
    if (results.length) addMsg(results.join('\n'), 'ops');
  }

  /* ── send ───────────────────────────────────────────────────── */
  function submit() {
    var msg = inputEl.value.trim();
    if (!msg || busy) return;
    busy = true;
    sendBtn.disabled = true;
    inputEl.value = '';
    inputEl.style.height = 'auto';

    addMsg(msg, 'user');
    var thinking = addMsg('…', 'ai ai-thinking');

    var board = (window.SceniusBoard && window.SceniusBoard.get) ? window.SceniusBoard.get() : null;
    var historySlice = history.slice(-20);

    fetch('/.netlify/functions/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, board: board, history: historySlice }),
    })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
        return data;
      });
    })
    .then(function (data) {
      thinking.remove();
      var reply = data.reply || '(no reply)';
      addMsg(reply, 'ai');
      applyOps(data.board_ops || []);
      history.push({ role: 'user', content: msg });
      history.push({ role: 'assistant', content: reply });
      return saveHistory(currentBoardId, history);
    })
    .catch(function (err) {
      thinking.remove();
      addMsg('Error: ' + err.message, 'err');
    })
    .then(function () {
      busy = false;
      sendBtn.disabled = false;
      inputEl.focus();
    });
  }

  document.getElementById('ai-form').addEventListener('submit', function (e) {
    e.preventDefault();
    submit();
  });

  /* ── public API ─────────────────────────────────────────────── */
  window.BoardMind = {
    askWith: function (prompt) {
      openPanel();
      setTimeout(function () {
        inputEl.value = prompt;
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 96) + 'px';
        submit();
      }, 80);
    },
  };

  /* ── init ───────────────────────────────────────────────────── */
  openAIDB()
    .then(function (db) { aiDb = db; })
    .catch(function () { aiDb = null; });

}());
