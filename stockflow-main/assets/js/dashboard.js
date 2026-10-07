// assets/js/dashboard.js
document.addEventListener("DOMContentLoaded", async () => {

  // 1. Wait for global state engine setup wrapper context
  if (!window.APP || typeof window.APP.init !== 'function') {
    await new Promise(res => {
      const check = () => (window.APP && typeof window.APP.init === 'function') ? res() : setTimeout(check, 30);
      check();
    });
  }

  // 2. Execute Boot Loading Routine safely
  await window.APP.init();

  // 3. SECURE AUTH GUARD - Run strictly post-hydration
  if (!window.APP.isAuthenticated()) {
    console.warn("Unauthorized access detected. Dropping router thread back to login page.");
    window.location.replace(window.CONFIG?.routes?.login || 'index.html');
    return;
  }

  // 4. Element Selectors Mapping
  const supabase = window.APP.supabase;
  const els = {
    currentDate: document.getElementById("current-date"),
    userDisplayName: document.getElementById("user-name"), 
    weekSelect: document.getElementById("week-select"),
    btnCloseWeek: document.getElementById("btn-close-week"),
    btnOpenWeek: document.getElementById("btn-open-week"),
    totalRevenue: document.getElementById("total-revenue"),
    itemsSold: document.getElementById("items-sold"),
    lowStockCount: document.getElementById("low-stock-count"),
    weekStatus: document.getElementById("week-status"),
    tableBody: document.getElementById("stock-table-body"),
    logoutBtn: document.querySelector(".logout-btn")
  };

  // Hydrate User Profile Information into the HTML sidebar panel
  if (els.userDisplayName && window.APP.user?.full_name) {
    els.userDisplayName.textContent = window.APP.user.full_name;
    
    // Dynamic sidebar avatar initialization mapping
    const avatarEl = document.querySelector(".user-profile img");
    if (avatarEl) {
      avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(window.APP.user.full_name)}&background=C8A2D9&color=fff`;
    }
  }

  // Display configuration dates
  if (els.currentDate) {
    els.currentDate.textContent = new Date().toLocaleDateString("en-GH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }

  function populateWeekDropdown() {
    if (!els.weekSelect) return;
    if (!window.APP.academic?.weeks?.length) {
      els.weekSelect.innerHTML = `<option value="">No Configured Weeks In DB</option>`;
      updateWeekStatus(null); // Force unlock rules for blank tables
      return;
    }

    const opts = window.APP.academic.weeks.map(w => {
      const term = window.APP.academic.terms?.find(t => t.id === w.term_id);
      const year = window.APP.academic.years?.find(y => y.id === term?.academic_year_id);
      return `<option value="${w.id}" data-week="${w.week_number}" data-is-open="${w.is_open}">
        ${year?.name || 'Year'} — ${term?.name || 'Term'} — ${w.name}
      </option>`;
    }).join('');
    els.weekSelect.innerHTML = `<option value="">Select Target Week</option>` + opts;
  }

  function selectDefaultWeek() {
    if (!els.weekSelect || els.weekSelect.options.length <= 1) return;
    
    // Attempt to locate an explicitly open week row
    const openOption = [...els.weekSelect.options].find(o => o.dataset.isOpen === "true");
    if (openOption) {
      openOption.selected = true;
    } else {
      els.weekSelect.selectedIndex = 1; // Default fallback to first entry
    }
    handleWeekChange();
  }

  async function handleWeekChange() {
    if (!els.weekSelect) return;
    const opt = els.weekSelect.selectedOptions[0];
    
    if (!opt || !opt.value) {
      updateWeekStatus(null);
      renderTable([]);
      updateStats({ totalRevenue: 0, itemsSold: 0, lowStockCount: 0 });
      return;
    }
    
    const week = window.APP.academic.weeks.find(w => w.id === opt.value);
    window.APP.academic.currentWeek = week;
    
    updateWeekStatus(week ? week.is_open : null);
    if (week) {
      await loadStockForWeek(week.id);
    }
  }

  async function loadStockForWeek(weekId) {
    try {
      await window.APP.loadStock(weekId);
      renderTable(window.APP.inventory.items);
      updateStats(window.APP.inventory.stats);
    } catch (err) {
      console.error(err);
      window.APP.showToast("Failed to interpret week stock rows", "error");
      renderTable([]);
    }
  }

  function renderTable(data) {
    if (!els.tableBody) return;
    if (!data || data.length === 0) {
      els.tableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:#777;padding:30px;"><i class="fas fa-folder-open"></i> No inventory entries logged for this week.</td></tr>`;
      return;
    }
    
    els.tableBody.innerHTML = data.map(item => {
      const currencySymbol = window.CONFIG?.settings?.currency || 'GH₵';
      return `
        <tr>
          <td><strong>${item.name}</strong></td>
          <td><span class="badge">${item.size}</span></td>
          <td>${item.opening}</td>
          <td>${item.add}</td>
          <td>${item.total}</td>
          <td>${item.sold}</td>
          <td>${currencySymbol} ${Number(item.price).toFixed(2)}</td>
          <td>${item.closing}</td>
          <td>${currencySymbol} ${Number(item.revenue).toFixed(2)}</td>
          <td>
            <button class="btn-icon" onclick="window.openActionModal('${item.name.replace(/'/g, "\\'")}')" ${!window.APP.academic.currentWeek?.is_open ? 'disabled' : ''}>
              <i class="fas fa-edit"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function updateStats(stats) {
    const symbol = window.CONFIG?.settings?.currency || 'GH₵';
    if (els.totalRevenue) els.totalRevenue.textContent = `${symbol} ${(stats?.totalRevenue || 0).toFixed(2)}`;
    if (els.itemsSold) els.itemsSold.textContent = stats?.itemsSold || 0;
    if (els.lowStockCount) els.lowStockCount.textContent = stats?.lowStockCount || 0;
  }

  function updateWeekStatus(isOpen) {
    if (!els.weekStatus) return;

    if (isOpen === null) {
      els.weekStatus.textContent = 'NO WEEK SELECTED';
      els.weekStatus.className = 'value status-closed';
      if (els.btnCloseWeek) els.btnCloseWeek.disabled = true;
      if (els.btnOpenWeek) els.btnOpenWeek.disabled = true;
      return;
    }

    els.weekStatus.textContent = isOpen ? 'OPEN' : 'CLOSED';
    els.weekStatus.className = `value ${isOpen ? 'status-open' : 'status-closed'}`;
    
    // Toggle active system states smoothly
    if (els.btnCloseWeek) els.btnCloseWeek.disabled = !isOpen;
    if (els.btnOpenWeek) els.btnOpenWeek.disabled = isOpen;
  }

  // Bind Dropdown Change Events
  els.weekSelect?.addEventListener("change", handleWeekChange);

  // 🔓 CLOSE WEEK BUTTON ACTION
  els.btnCloseWeek?.addEventListener("click", async () => {
    const week = window.APP.academic.currentWeek;
    if (!week) return;
    
    if (!confirm(`Are you sure you want to close ${week.name}? This will lock adjustments.`)) return;

    try {
      const { error } = await supabase
        .from("term_weeks")
        .update({ status: 'CLOSED', closed_at: new Date().toISOString() })
        .eq("id", week.id);
        
      if (error) throw error;
      
      window.APP.showToast("Week closed out successfully", "success");
      await window.APP._loadAcademic(); 
      populateWeekDropdown();
      
      // Update selected choice pointer reference
      const storedId = week.id;
      if (els.weekSelect) els.weekSelect.value = storedId;
      await handleWeekChange();
    } catch(e) {
      console.error(e);
      window.APP.showToast("Failed to update status mutation table", "error");
    }
  });

  // 🔒 OPEN WEEK BUTTON ACTION
  els.btnOpenWeek?.addEventListener("click", async () => {
    const week = window.APP.academic.currentWeek;
    if (!week) return;

    try {
      const { error } = await supabase
        .from("term_weeks")
        .update({ status: 'OPEN', opened_at: new Date().toISOString() })
        .eq("id", week.id);
        
      if (error) throw error;
      
      window.APP.showToast("Week cycle opened successfully", "success");
      await window.APP._loadAcademic();
      populateWeekDropdown();
      
      // Keep structural select option alignment
      const storedId = week.id;
      if (els.weekSelect) els.weekSelect.value = storedId;
      await handleWeekChange();
    } catch(e) {
      console.error(e);
      window.APP.showToast("Failed to clear authorization lock paths", "error");
    }
  });

  els.logoutBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    await window.APP.signOut();
  });

  // Kickstart view mapping layout operations
  populateWeekDropdown();
  selectDefaultWeek();

  // Modal Actions Controllers mapping
  window.openActionModal = function(itemName) {
    const modalItemField = document.getElementById('modal-item-name');
    if (modalItemField) modalItemField.value = itemName;
    document.getElementById('action-modal')?.classList.remove('hidden');
  };
  
  document.querySelector('.close-modal')?.addEventListener('click', () => {
    document.getElementById('action-modal').classList.add('hidden');
  });
});