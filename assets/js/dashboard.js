// assets/js/dashboard.js
document.addEventListener("DOMContentLoaded", async () => {
  // ==============================
  // 1. WAIT FOR SUPABASE CLIENT
  // ==============================
  let retries = 0;
  while (!window.supabaseClient && retries < 30) {
    await new Promise(r => setTimeout(r, 100));
    retries++;
  }

  if (!window.supabaseClient) {
    console.error("Supabase not initialized");
    window.location.href = "index.html";
    return;
  }

  const supabase = window.supabaseClient;
  const CONFIG = window.CONFIG || {};

  // ==============================
  // 2. STATE VARIABLES
  // ==============================
  let currentUser = null;
  let academicData = { years: [], terms: [], weeks: [] };
  let selectedWeek = { weekId: null, year: null, weekNumber: null, isOpen: false };

  // Sample Data for Fallback/Testing
  const sampleInventory = [
    { name: "GIRLS BLUE P.E KIT", size: "SIZE 100", opening: 21, add: 0, sold: 0, price: 50 },
    { name: "SOCKS - SMALL",       size: "SMALL",    opening: 70, add: 0, sold: 5, price: 40 },
    { name: "PE KIT - LARGE",      size: "LARGE",    opening: 20, add: 0, sold: 2, price: 30 },
  ];

  // ==============================
  // 3. DOM ELEMENTS
  // ==============================
  const els = {
    currentDate:   document.getElementById('current-date'),
    weekSelect:    document.getElementById('week-select'),
    btnCloseWeek:  document.getElementById('btn-close-week'),
    btnOpenWeek:   document.getElementById('btn-open-week'),

    // Stats
    totalRevenue:  document.getElementById('total-revenue'),
    itemsSold:     document.getElementById('items-sold'),
    lowStockCount: document.getElementById('low-stock-count'),
    weekStatus:    document.getElementById('week-status'),

    // Table
    tableBody: document.getElementById('stock-table-body'),

    // User Profile
    userName:   document.querySelector('.user-profile .info h4'),
    userRole:   document.querySelector('.user-profile .info p'),
    userAvatar: document.querySelector('.user-profile img'),

    // Logout (sidebar anchor)
    logoutBtn: document.querySelector('.logout-btn')
  };

  // ==============================
  // 4. TOAST HELPER
  // ==============================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' :
                         type === 'error'   ? 'times-circle' :
                         'info-circle'}"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 3500);
  }

  // ==============================
  // 5. AUTH & USER STATE
  // ==============================
  async function loadCurrentUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.warn("No active session. Redirecting to login...");
        window.location.href = CONFIG.routes?.login || "index.html";
        return;
      }

      console.log("🔍 Auth User ID:", session.user.id);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', session.user.id)
        .maybeSingle();

      console.log("📄 Profile Data:", profile);
      if (error) console.error("❌ Profile Fetch Error:", error);

      const displayName =
        profile?.full_name ||
        profile?.username ||
        session.user.email?.split('@')[0] ||
        'Administrator';

      const displayRole = profile?.role || 'staff';

      currentUser = {
        id:        session.user.id,
        username:  profile?.username || 'admin',
        full_name: displayName,
        role:      displayRole
      };

      console.log("✅ Current User Set:", currentUser);

      // Update UI
      if (els.userName)   els.userName.textContent = currentUser.full_name;
      if (els.userRole)   els.userRole.textContent  = currentUser.role.toUpperCase();

      if (els.userAvatar) {
        const initials = currentUser.full_name
          .split(' ')
          .map(n => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();

        els.userAvatar.src =
          `https://ui-avatars.com/api/?name=${initials}&background=C8A2D9&color=fff`;
      }

    } catch (err) {
      console.error("Auth error:", err);
      showToast("Session expired. Please login again.", "error");
      setTimeout(() => {
        window.location.href = CONFIG.routes?.login || "index.html";
      }, 1500);
    }
  }

  // ==============================
  // 6. LOGOUT
  // ==============================
  async function handleLogout(e) {
    if (e) e.preventDefault();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      localStorage.clear();
      sessionStorage.clear();
      showToast("Logged out successfully.", "success");

      setTimeout(() => {
        window.location.href = CONFIG.routes?.login || "index.html";
      }, 1000);
    } catch (err) {
      console.error("Logout error:", err.message);
      showToast("Failed to log out. Please try again.", "error");
    }
  }

  // Expose globally so onclick="handleLogout(event)" works
  window.handleLogout = handleLogout;

  if (els.logoutBtn) {
    els.logoutBtn.addEventListener("click", handleLogout);
  }

  // ==============================
  // 7. ACADEMIC DATA LOADING
  // ==============================
  async function loadAcademicData() {
    try {
      const [
        { data: years,  error: yearsErr  },
        { data: terms,  error: termsErr  },
        { data: weeks,  error: weeksErr  }
      ] = await Promise.all([
        supabase.from('academic_years').select('*').order('name', { ascending: false }),
        supabase.from('terms').select('*').order('term_number'),
        supabase.from('term_weeks').select('*').order('week_number')
      ]);

      if (yearsErr) console.error("Years error:", yearsErr);
      if (termsErr) console.error("Terms error:", termsErr);
      if (weeksErr) console.error("Weeks error:", weeksErr);

      academicData = {
        years: years || [],
        terms: terms || [],
        weeks: weeks || []
      };

      populateWeekDropdown();
      selectDefaultWeek();

    } catch (err) {
      console.error("Failed to load academic data:", err);
      showToast("Could not load academic data. Showing sample data.", "error");
      renderTable(sampleInventory);
    }
  }

  function populateWeekDropdown() {
    if (!els.weekSelect) return;

    const options = academicData.weeks.map(w => {
      const term = academicData.terms.find(t => t.id === w.term_id);
      const year = term
        ? academicData.years.find(y => y.id === term.academic_year_id)
        : null;

      const label = `${year ? year.name : 'Year'} — ${term ? term.name : ''} — ${w.name}`;

      return `<option
        value="${w.id}"
        data-year="${year ? year.name.split('/')[0] : ''}"
        data-week="${w.week_number}"
        data-is-open="${w.is_open}">
        ${label}
      </option>`;
    }).join('');

    els.weekSelect.innerHTML = '<option value="">Select Week</option>' + options;
  }

  function selectDefaultWeek() {
    if (!els.weekSelect) return;

    // Prefer an open week
    const openOption = Array.from(els.weekSelect.options)
      .find(opt => opt.dataset.isOpen === 'true');

    if (openOption) {
      openOption.selected = true;
    } else if (els.weekSelect.options.length > 1) {
      els.weekSelect.selectedIndex = els.weekSelect.options.length - 1;
    }

    if (els.weekSelect.value) handleWeekChange();
  }

  function handleWeekChange() {
    const opt = els.weekSelect.selectedOptions[0];
    if (!opt || !opt.value) return;

    selectedWeek = {
      weekId:     opt.value,
      year:       opt.dataset.year,
      weekNumber: parseInt(opt.dataset.week),
      isOpen:     opt.dataset.isOpen === 'true'
    };

    // Week status badge
    if (els.weekStatus) {
      if (selectedWeek.isOpen) {
        els.weekStatus.textContent   = "OPEN";
        els.weekStatus.style.color   = "#10b981";
      } else {
        els.weekStatus.textContent   = "CLOSED";
        els.weekStatus.style.color   = "#ef4444";
      }
    }

    // Close / Open buttons
    if (els.btnCloseWeek) els.btnCloseWeek.disabled = !selectedWeek.isOpen;
    if (els.btnOpenWeek)  els.btnOpenWeek.disabled  =  selectedWeek.isOpen;

    console.log("Loading stock for Week ID:", selectedWeek.weekId);
    fetchWeeklyStock(selectedWeek.weekId);
  }

  // ==============================
  // 8. FETCH WEEKLY STOCK FROM DB
  // ==============================
  async function fetchWeeklyStock(weekId) {
    try {
      const { data, error } = await supabase
        .from('weekly_stock')
        .select(`
          id,
          opening_stock,
          added_stock,
          sold_qty,
          products (
            name,
            size,
            unit_price
          )
        `)
        .eq('week_id', weekId);

      if (error) throw error;

      if (!data || data.length === 0) {
        console.warn("No stock data found for this week. Showing sample data.");
        renderTable(sampleInventory);
        return;
      }

      // Map DB rows to the shape renderTable() expects
      const mapped = data.map(row => ({
        name:    row.products?.name    || 'Unknown',
        size:    row.products?.size    || '—',
        opening: row.opening_stock     || 0,
        add:     row.added_stock       || 0,
        sold:    row.sold_qty          || 0,
        price:   row.products?.unit_price || 0
      }));

      renderTable(mapped);

    } catch (err) {
      console.error("Failed to fetch weekly stock:", err);
      showToast("Could not load stock data. Showing sample.", "error");
      renderTable(sampleInventory);
    }
  }

  // ==============================
  // 9. TABLE RENDERING & STATS
  // ==============================
  function renderTable(data) {
    if (!els.tableBody) return;
    els.tableBody.innerHTML = '';

    let totalRevenue  = 0;
    let totalSold     = 0;
    let lowStockCount = 0;

    if (data.length === 0) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center; padding:2rem; color:#9ca3af;">
            <i class="fas fa-box-open" style="font-size:2rem; margin-bottom:0.5rem; display:block;"></i>
            No stock data available for this week.
          </td>
        </tr>`;
      return;
    }

    data.forEach(item => {
      const total   = item.opening + item.add;
      const closing = total - item.sold;
      const revenue = item.sold * item.price;

      totalRevenue  += revenue;
      totalSold     += item.sold;
      if (closing < 5) lowStockCount++;

      const statusBadge = closing < 5
        ? `<span class="badge badge-danger">Low Stock</span>`
        : `<span class="badge badge-success">OK</span>`;

      els.tableBody.innerHTML += `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td>${item.size}</td>
          <td>${item.opening}</td>
          <td>${item.add}</td>
          <td class="col-total">${total}</td>
          <td>${item.sold}</td>
          <td>GH¢ ${item.price.toFixed(2)}</td>
          <td class="${closing < 5 ? 'text-danger' : ''}"><strong>${closing}</strong></td>
          <td>${statusBadge}</td>
          <td class="col-revenue">GH¢ ${revenue.toFixed(2)}</td>
          <td>
            <button class="btn-primary btn-sm"
              onclick="openSaleModal('${item.name}', ${item.price})">
              <i class="fas fa-plus"></i> Sell
            </button>
          </td>
        </tr>`;
    });

    // Update Stats Cards
    if (els.totalRevenue)  els.totalRevenue.textContent  = `GH¢ ${totalRevenue.toFixed(2)}`;
    if (els.itemsSold)     els.itemsSold.textContent      = totalSold;
    if (els.lowStockCount) els.lowStockCount.textContent  = lowStockCount;
  }

  // ==============================
  // 10. CLOSE / OPEN WEEK
  // ==============================
  if (els.btnCloseWeek) {
    els.btnCloseWeek.addEventListener('click', async () => {
      if (!selectedWeek.weekId) return;
      if (!confirm(`Close Week ${selectedWeek.weekNumber}? This will prevent new sales entries.`)) return;

      try {
        const { error } = await supabase
          .from('term_weeks')
          .update({ is_open: false })
          .eq('id', selectedWeek.weekId);

        if (error) throw error;

        showToast(`Week ${selectedWeek.weekNumber} closed successfully.`, "success");
        await loadAcademicData();
      } catch (err) {
        console.error("Close week error:", err);
        showToast("Failed to close week.", "error");
      }
    });
  }

  if (els.btnOpenWeek) {
    els.btnOpenWeek.addEventListener('click', async () => {
      if (!selectedWeek.weekId) return;
      if (!confirm(`Re-open Week ${selectedWeek.weekNumber}?`)) return;

      try {
        const { error } = await supabase
          .from('term_weeks')
          .update({ is_open: true })
          .eq('id', selectedWeek.weekId);

        if (error) throw error;

        showToast(`Week ${selectedWeek.weekNumber} re-opened successfully.`, "success");
        await loadAcademicData();
      } catch (err) {
        console.error("Open week error:", err);
        showToast("Failed to re-open week.", "error");
      }
    });
  }

  // ==============================
  // 11. SALE MODAL
  // ==============================
  const modal    = document.getElementById('action-modal');
  const closeBtn = document.querySelector('.close-modal');

  window.openSaleModal = function (itemName, price) {
    if (!modal) return;
    const nameEl  = document.getElementById('modal-item-name');
    const priceEl = document.getElementById('modal-price');
    if (nameEl)  nameEl.value  = itemName;
    if (priceEl) priceEl.value = price;
    modal.classList.remove('hidden');
  };

  if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');

  window.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });

  // ==============================
  // 12. DATE DISPLAY
  // ==============================
  if (els.currentDate) {
    els.currentDate.textContent = new Date().toLocaleDateString('en-GH', {
      weekday: 'long',
      year:    'numeric',
      month:   'long',
      day:     'numeric'
    });
  }

  // Week selector change
  if (els.weekSelect) {
    els.weekSelect.addEventListener('change', handleWeekChange);
  }

  // ==============================
  // 13. INIT
  // ==============================
  await loadCurrentUser();
  await loadAcademicData();
});