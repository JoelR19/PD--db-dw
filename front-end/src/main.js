// ===== Config =====
const API_BASE = 'http://localhost:3000/api'; // adjust if your port changes

// ===== Helpers =====
// Shortcut for querySelector
const $ = (sel, ctx = document) => ctx.querySelector(sel);
// Shortcut for querySelectorAll (returns array)
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// Format a number as Colombian pesos (no decimals)
const fmtMoney = (n) =>
  Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// Format a date to YYYY-MM-DD
const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);

// ===== State =====
const state = {
  clientId: '', // Filter: client
  from: '', // Filter: date from
  to: '', // Filter: date to
  limit: 10, // Rows per page
  offset: 0, // Starting index for pagination
  totalRows: 0 // Estimated rows per page (no exact count from API, so next/prev is handled loosely)
};

// ===== Base UI =====
function mountUI() {
  // Build the main content area
  const main = $('main');
  main.className = 'p-4 md:p-8 text-white';
  main.innerHTML = `
    <div class="max-w-7xl mx-auto grid grid-cols-1 gap-4">
      <header class="flex flex-col gap-2">
        <h1 class="text-2xl font-semibold">Invoice Balances</h1>
        <p class="text-sm text-gray-300">View of invoices, payments and balances.</p>
      </header>

      <!-- Filters Section -->
      <section class="bg-slate-800 rounded-2xl p-4 shadow">
        <form id="filters" class="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label class="block text-sm mb-1">Client</label>
            <select id="f-client" class="w-full bg-slate-900 rounded-xl px-3 py-2 outline-none">
              <option value="">All</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1">From</label>
            <input id="f-from" type="date" class="w-full bg-slate-900 rounded-xl px-3 py-2 outline-none" />
          </div>
          <div>
            <label class="block text-sm mb-1">To</label>
            <input id="f-to" type="date" class="w-full bg-slate-900 rounded-xl px-3 py-2 outline-none" />
          </div>
          <div class="flex gap-2">
            <button id="btn-apply" class="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-4 py-2">Apply</button>
            <button id="btn-clear" type="button" class="bg-slate-700 hover:bg-slate-600 rounded-xl px-4 py-2">Clear</button>
          </div>
        </form>
      </section>

      <!-- Table Section -->
      <section class="bg-slate-800 rounded-2xl p-2 md:p-4 shadow overflow-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-gray-300">
            <tr>
              <th class="px-3 py-2">Invoice</th>
              <th class="px-3 py-2">Client</th>
              <th class="px-3 py-2">Period</th>
              <th class="px-3 py-2 text-right">Billed</th>
              <th class="px-3 py-2 text-right">Paid</th>
              <th class="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody id="tbody" class="divide-y divide-slate-700"></tbody>
        </table>

        <!-- Empty state -->
        <div id="empty" class="hidden p-6 text-center text-gray-400">No results</div>
      </section>

      <!-- Pagination Section -->
      <section class="flex items-center justify-between bg-slate-800 rounded-2xl p-3 shadow">
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-300">Rows:</label>
          <select id="f-limit" class="bg-slate-900 rounded-xl px-2 py-1">
            <option>10</option>
            <option>25</option>
            <option>50</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <button id="prev" class="bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-1 disabled:opacity-40">Previous</button>
          <span id="pageLabel" class="text-sm text-gray-300">Page 1</span>
          <button id="next" class="bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-1 disabled:opacity-40">Next</button>
        </div>
      </section>
    </div>
  `;

  // ===== Event Listeners =====

  // Apply filters
  $('#filters').addEventListener('submit', (ev) => {
    ev.preventDefault();
    state.clientId = $('#f-client').value;
    state.from = $('#f-from').value;
    state.to = $('#f-to').value;
    state.offset = 0;
    loadBalances();
  });

  // Clear filters
  $('#btn-clear').addEventListener('click', () => {
    $('#f-client').value = '';
    $('#f-from').value = '';
    $('#f-to').value = '';
    state.clientId = '';
    state.from = '';
    state.to = '';
    state.offset = 0;
    loadBalances();
  });

  // Change rows per page
  $('#f-limit').addEventListener('change', () => {
    state.limit = Number($('#f-limit').value);
    state.offset = 0;
    loadBalances();
  });

  // Previous page
  $('#prev').addEventListener('click', () => {
    if (state.offset <= 0) return;
    state.offset = Math.max(0, state.offset - state.limit);
    loadBalances();
  });

  // Next page
  $('#next').addEventListener('click', () => {
    // No exact count; if the next page returns empty, "Next" will be disabled
    state.offset += state.limit;
    loadBalances();
  });
}

// ===== Data Fetch Helpers =====
async function api(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Load clients for the dropdown
async function loadClients() {
  const rows = await api('/clients', { limit: 100, offset: 0 }); // Load first 100 clients
  const sel = $('#f-client');
  rows.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.id} · ${c.full_name}`;
    sel.appendChild(opt);
  });
}

// Load invoice balances from API
async function loadBalances() {
  const params = {
    client_id: state.clientId,
    limit: state.limit,
    offset: state.offset
  };

  const data = await api('/invoice-balances', params);

  // Filter locally by date if provided
  let rows = data;
  if (state.from) rows = rows.filter((r) => r.billing_period >= state.from);
  if (state.to) rows = rows.filter((r) => r.billing_period <= state.to);

  renderTable(rows);

  // Pagination buttons control
  $('#prev').disabled = state.offset === 0;
  $('#next').disabled = rows.length < state.limit;
  const page = Math.floor(state.offset / state.limit) + 1;
  $('#pageLabel').textContent = `Page ${page}`;
}

// Render table rows
function renderTable(rows) {
  const tbody = $('#tbody');
  const empty = $('#empty');
  tbody.innerHTML = '';

  if (!rows.length) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-700/40';
    tr.innerHTML = `
      <td class="px-3 py-2 whitespace-nowrap">${r.invoice_number}</td>
      <td class="px-3 py-2">${r.full_name ?? ''}</td>
      <td class="px-3 py-2">${fmtDate(r.billing_period)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(r.amount_billed)}</td>
      <td class="px-3 py-2 text-right">${fmtMoney(r.amount_paid)}</td>
      <td class="px-3 py-2 text-right ${Number(r.balance_due) > 0 ? 'text-yellow-300' : 'text-emerald-300'}">
        ${fmtMoney(r.balance_due)}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Initialization =====
(async function init() {
  try {
    mountUI();
    await api('/health'); // API health check
    await loadClients();
    await loadBalances();
  } catch (err) {
    console.error(err);
    const main = $('main');
    main.innerHTML = `
      <div class="p-6 text-red-300 bg-slate-800 rounded-2xl max-w-3xl">
        Error connecting to API. Check that the server is running at <code>http://localhost:3000</code>.
      </div>`;
  }
})();
