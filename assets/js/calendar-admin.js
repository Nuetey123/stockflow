// assets/js/calendar-admin.js
document.addEventListener('DOMContentLoaded', async () => {
  const supabase = window.supabaseClient;

  // ===== UI HELPERS =====
  function showToast(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `padding:12px 20px;border-radius:8px;color:white;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:slideIn 0.3s ease;background:${type==='error'?'#ef4444':'#10b981'};`;
    toast.innerHTML = `<span>${msg}</span><span style="margin-left:10px;cursor:pointer" onclick="this.parentElement.remove()">✕</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  window.switchTab = (tab) => {
    document.querySelectorAll('#tab-years, #tab-terms, #tab-weeks').forEach(t => t.classList.add('hidden'));
    document.querySelectorAll('#adminTabs a').forEach(l => l.classList.remove('active'));

    const targetTab = document.getElementById(`tab-${tab}`);
    if(targetTab) targetTab.classList.remove('hidden');

    // Handle active state for tabs safely
    if(event && event.target) {
        event.target.classList.add('active');
    }

    if (tab === 'terms') loadYearDropdown();
    if (tab === 'weeks') loadTermDropdown();
  };

  // ===== LOAD DATA =====
  async function loadYears() {
    const { data } = await supabase.from('academic_years').select('*').order('name', { ascending: false });
    const c = document.getElementById('years-list');
    if (!c) return;
    if (!data?.length) { c.innerHTML = '<p class="text-muted">No academic years yet.</p>'; return; }
    c.innerHTML = data.map(y => `
      <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
        <div>
          <strong>${y.name}</strong>
          <span class="badge ${y.is_active ? 'bg-success' : 'bg-secondary'}">${y.is_active ? 'OPEN' : 'CLOSED'}</span>
          <br><small class="text-muted">${y.start_date} to ${y.end_date}</small>
        </div>
        <div>
          <button class="btn btn-sm ${y.is_active ? 'btn-warning' : 'btn-success'}" onclick="toggleYear('${y.id}', ${!y.is_active})">
            ${y.is_active ? 'Close Year' : 'Open Year'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="delYear('${y.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadTerms() {
    const { data } = await supabase.from('terms').select('*').order('term_number');
    const c = document.getElementById('terms-list');
    if (!c) return;
    if (!data?.length) { c.innerHTML = '<p class="text-muted">No terms yet.</p>'; return; }
    c.innerHTML = data.map(t => `
      <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
        <div>
          <strong>${t.name}</strong> (Term ${t.term_number})
          <span class="badge ${t.status === 'OPEN' ? 'bg-success' : 'bg-secondary'} ms-2">${t.status || 'CLOSED'}</span>
          <br><small class="text-muted">${t.start_date} to ${t.end_date}</small>
        </div>
        <div>
          <button class="btn btn-sm ${t.status === 'OPEN' ? 'btn-warning' : 'btn-success'}" onclick="toggleTerm('${t.id}', '${t.status || 'CLOSED'}')">
            ${t.status === 'OPEN' ? 'Close Term' : 'Open Term'}
          </button>
          <button class="btn btn-sm btn-danger" onclick="delTerm('${t.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  async function loadWeeksForTerm() {
    const tid = document.getElementById('week-term-select').value;
    if(!tid) return;

    const { data } = await supabase.from('term_weeks').select('*').eq('term_id', tid).order('week_number');
    const c = document.getElementById('weeks-list');
    if (!c) return;

    if (!data?.length) {
      c.innerHTML = '<p class="text-muted">No weeks yet for this term.</p>';
      return;
    }

    c.innerHTML = data.map(w => `
      <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
        <div>
          <strong>${w.name}</strong> (Week ${w.week_number})
          <span class="badge ${w.status === 'OPEN' ? 'bg-success' : 'bg-secondary'} ms-2">${w.status || 'CLOSED'}</span>
        </div>
        <div>
          ${w.status === 'OPEN' ? `
            <button class="btn btn-sm btn-warning" onclick="closeWeek('${w.id}')">Close Week</button>
          ` : `
            <button class="btn btn-sm btn-secondary" disabled>Closed (Read-Only)</button>
          `}
          <button class="btn btn-sm btn-danger" onclick="delWeek('${w.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  }

  // ===== ACTIONS =====

  // Add Year
  document.getElementById('add-year-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('academic_years').insert({
      name: document.getElementById('year-name').value,
      start_date: document.getElementById('year-start').value,
      end_date: document.getElementById('year-end').value,
      is_active: true
    });
    if (error) showToast(error.message, 'error');
    else { showToast('✅ Year added!'); e.target.reset(); loadYears(); }
  });

  // Toggle Year
  window.toggleYear = async (id, makeActive) => {
    if (makeActive) await supabase.from('academic_years').update({ is_active: false }).neq('id', id);
    await supabase.from('academic_years').update({ is_active: makeActive }).eq('id', id);
    loadYears();
  };
  window.delYear = async (id) => { if(!confirm('Delete?'))return; await supabase.from('academic_years').delete().eq('id', id); loadYears(); };

  // Add Term
  function loadYearDropdown() {
    supabase.from('academic_years').select('*').order('name').then(({data}) => {
      const select = document.getElementById('term-year-select');
      if(select) select.innerHTML = data.map(y=>`<option value="${y.id}">${y.name}</option>`).join('');
    });
  }
  document.getElementById('add-term-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('terms').insert({
      academic_year_id: document.getElementById('term-year-select').value,
      name: document.getElementById('term-name').value,
      term_number: parseInt(document.getElementById('term-number').value),
      start_date: document.getElementById('term-start').value,
      end_date: document.getElementById('term-end').value,
      status: 'CLOSED'
    });
    if (error) showToast(error.message, 'error');
    else { showToast('✅ Term added!'); e.target.reset(); loadTerms(); }
  });
  window.toggleTerm = async (id, status) => {
    await supabase.from('terms').update({ status: status === 'OPEN' ? 'CLOSED' : 'OPEN' }).eq('id', id);
    loadTerms();
  };
  window.delTerm = async (id) => { if(!confirm('Delete?'))return; await supabase.from('terms').delete().eq('id', id); loadTerms(); };

  // ===== WEEK MANAGEMENT (STRICT LOGIC) =====

  function loadTermDropdown() {
    supabase.from('terms').select('*').order('term_number').then(({data}) => {
      const select = document.getElementById('week-term-select');
      if(select) {
          select.innerHTML = data.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
          loadWeeksForTerm();
      }
    });
  }

  document.getElementById('add-week-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const termId = document.getElementById('week-term-select').value;
    const newWeekNum = parseInt(document.getElementById('week-number').value);
    const weekName = document.getElementById('week-name').value;
    const startDate = document.getElementById('week-start').value;
    const endDate = document.getElementById('week-end').value;

    if(!termId || !newWeekNum || !weekName) {
        showToast("Please fill all fields", 'error');
        return;
    }

    // 1. VALIDATION: Check if previous week is still OPEN
    // We look for any week in this term with number < newWeekNum that is still OPEN
    const { data: openPrevWeeks, error: checkError } = await supabase
      .from('term_weeks')
      .select('id, week_number, name')
      .eq('term_id', termId)
      .lt('week_number', newWeekNum)
      .eq('status', 'OPEN');

    if (checkError) {
        showToast("Error checking previous weeks: " + checkError.message, 'error');
        return;
    }

    if (openPrevWeeks && openPrevWeeks.length > 0) {
      // Find the highest week number among the open ones to give specific feedback
      const latestOpen = openPrevWeeks.reduce((prev, current) => (prev.week_number > current.week_number) ? prev : current);
      showToast(`❌ Cannot create Week ${newWeekNum}. Please close "${latestOpen.name}" (Week ${latestOpen.week_number}) first.`, 'error');
      return;
    }

    try {
      // 2. CREATE THE WEEK
      const { data: newWeek, error: insertError } = await supabase.from('term_weeks').insert({
        term_id: termId,
        week_number: newWeekNum,
        name: weekName,
        start_date: startDate,
        end_date: endDate,
        status: 'OPEN' // New weeks start as OPEN so stock can be loaded
      }).select().single();

      if (insertError) throw insertError;

      // 3. CARRY FORWARD STOCK FROM PREVIOUS CLOSED WEEK
      // Find the immediate previous week (which must be CLOSED due to validation above)
      const { data: prevWeek } = await supabase
        .from('term_weeks')
        .select('week_number')
        .eq('term_id', termId)
        .lt('week_number', newWeekNum)
        .order('week_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get Academic Year Name to extract the Year Integer (e.g., "2024/2025" -> 2024)
      const { data: termData } = await supabase.from('terms').select('academic_year_id').eq('id', termId).single();
      const { data: yearData } = await supabase.from('academic_years').select('name').eq('id', termData.academic_year_id).single();

      // Fallback if year name format is unexpected
      const yearVal = yearData && yearData.name ? parseInt(yearData.name.split('/')[0]) : new Date().getFullYear();

      // Get All Active Products
      const { data: products } = await supabase.from('products').select('id').eq('is_active', true);

      if (products && products.length > 0) {
        const stockRecords = products.map(prod => {
            // Logic to determine opening stock
            // If there is a previous week, we ideally fetch its closing stock.
            // Since we are in a loop, we can't easily fetch async for each product without performance hit.
            // However, for correctness, we will set initial opening to 0 here and rely on a separate update
            // OR we assume the previous week's data is already in weekly_stock.

            // To keep this client-side script simple and robust, we will insert a placeholder
            // and then you might need a server-side function for heavy lifting,
            // BUT let's try to do it simply:

            return {
                product_id: prod.id,
                year: yearVal,
                week_number: newWeekNum,
                opening_stock: 0, // Will be updated below if prev week exists
                closing_stock: 0,
                add_stock: 0,
                quantity_sold: 0,
                total_stock: 0
            };
        });

        // Insert initial records
        const { error: bulkError } = await supabase.from('weekly_stock').upsert(stockRecords, {
            onConflict: 'product_id,year,week_number'
        });

        if(bulkError) console.error("Bulk insert error:", bulkError);

        // If there was a previous week, update the opening stocks based on that week's closing
        if (prevWeek) {
            // Fetch all closing stocks from previous week
            const { data: prevStocks } = await supabase
                .from('weekly_stock')
                .select('product_id, closing_stock')
                .eq('year', yearVal)
                .eq('week_number', prevWeek.week_number);

            if(prevStocks) {
                // Update the new week's opening stock
                for(const ps of prevStocks) {
                    await supabase.from('weekly_stock')
                        .update({
                            opening_stock: ps.closing_stock,
                            closing_stock: ps.closing_stock, // Initialize closing to match opening
                            total_stock: ps.closing_stock
                        })
                        .eq('product_id', ps.product_id)
                        .eq('year', yearVal)
                        .eq('week_number', newWeekNum);
                }
            }
        }
      }

      showToast('✅ Week created & Stock Loaded!');
      e.target.reset();
      loadWeeksForTerm();

    } catch (err) {
      showToast(err.message, 'error');
      console.error(err);
    }
  });

  // CLOSE WEEK (Locks Data)
  window.closeWeek = async (wid) => {
    if (!confirm('Close this week? This will lock all data for this week.')) return;

    // Update status to CLOSED
    const { error } = await supabase.from('term_weeks').update({
      status: 'CLOSED',
      closed_at: new Date().toISOString()
    }).eq('id', wid);

    if (error) {
      showToast(error.message, 'error');
    } else {
      showToast('✅ Week Closed! Data is now read-only.');
      loadWeeksForTerm();
    }
  };

  window.delWeek = async (id) => {
    if(!confirm('Delete?'))return;
    await supabase.from('term_weeks').delete().eq('id', id);
    loadWeeksForTerm();
  };

  // Init
  loadYears();
});