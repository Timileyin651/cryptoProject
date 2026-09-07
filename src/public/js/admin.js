/**
 * Admin section helpers.
 * Uses cookie-based auth (the browser already has the httpOnly accessToken cookie
 * set by the login flow). No secrets are exposed in HTML or client-side JS.
 */
(function () {
  'use strict';

  // ── Authenticated fetch wrapper ─────────────────────────────────────
  // The browser sends the httpOnly cookie automatically on same-origin
  // requests. We do NOT read or expose any token in JS.
  window.adminFetch = function adminFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin'; // send cookies
    var method = (opts.method || 'GET').toUpperCase();
    // Inject CSRF token on state-changing requests
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      var csrfToken = window.__csrfToken || '';
      opts.headers = Object.assign({
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      }, opts.headers || {});
    }
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      opts.headers = opts.headers || {};
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(url, opts);
  };

  // ── Toast ───────────────────────────────────────────────────────────
  window.adminToast = function adminToast(msg, ms) {
    var el = document.getElementById('admin-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'admin-toast';
      el.className = 'admin-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, ms || 3000);
  };

  // ── Confirm then act ────────────────────────────────────────────────
  window.adminConfirm = function adminConfirm(msg, fn) {
    if (confirm(msg)) fn();
  };

  // ── Generic search filter ───────────────────────────────────────────
  window.adminTableSearch = function adminTableSearch(inputId, tableSelector) {
    var input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', function (e) {
      var q = e.target.value.toLowerCase();
      var rows = document.querySelectorAll((tableSelector || '.admin-table') + ' tbody tr');
      rows.forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
      });
    });
  };

  // ── Pagination helper ───────────────────────────────────────────────
  window.adminPaginate = function adminPaginate(containerId, currentPage, totalPages, baseUrl) {
    var el = document.getElementById(containerId);
    if (!el || totalPages <= 1) return;
    var html = '';
    if (currentPage > 1) {
      html += '<a href="' + baseUrl + '&page=' + (currentPage - 1) + '">&laquo;</a>';
    }
    for (var i = 1; i <= totalPages; i++) {
      html += '<a href="' + baseUrl + '&page=' + i + '" class="' + (i === currentPage ? 'active' : '') + '">' + i + '</a>';
    }
    if (currentPage < totalPages) {
      html += '<a href="' + baseUrl + '&page=' + (currentPage + 1) + '">&raquo;</a>';
    }
    el.innerHTML = html;
  };

  // ── Close modal on Escape ───────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var modals = document.querySelectorAll('.admin-modal');
      modals.forEach(function (m) { m.style.display = 'none'; });
    }
  });

  // ── Close modal on backdrop click ───────────────────────────────────
  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('admin-modal')) {
      e.target.style.display = 'none';
    }
  });
})();
