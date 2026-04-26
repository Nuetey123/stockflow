// assets/js/inventory.js

document.addEventListener('DOMContentLoaded', async () => {
  // ✅ Initialize Supabase client and Config from global scope
  const supabase = window.supabaseClient;
  const CONFIG = window.CONFIG || {};

  // ✅ Fallback config values if not set in config.js
  const APP_CONFIG = {
    currency: CONFIG.currency || 'GH¢',
    lowStockThreshold: CONFIG.lowStockThreshold || 5,
    defaultBatchType: CONFIG.defaultBatchType || 'REGULAR',
    currentYear: CONFIG.currentYear || new Date().getFullYear(),
    currentWeek: CONFIG.currentWeek || 11
  };

  // DOM Elements
  const tableBody = document.getElementById('inventory-table-body');
  const searchInput = document.getElementById('search-input');
  const categoryFilter = document.getElementById('category-filter');
  const addForm = document.getElementById('add-product-form');

  // Global state
  let inventoryData = [];
  let isLoading = false;

  // ========== HELPER FUNCTIONS (Inside DOMContentLoaded for scope access) ==========

  function showLoading(show) {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = show ? 'flex' : 'none';
  }

  function showError(message) {
    console.error('❌', message);
    alert(`❌ ${message}`);
  }

  function showSuccess(message) {
    console.log('✅', message);
    alert(`✅ ${message}`);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  async function getCurrentUserId() {
    try {
      const {  user } = await supabase.auth.getUser();
      return user?.id || null;
    } catch {
      return null;
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  function downloadCSV(data, filename) {
    if (!data?.length) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(field => {
        const val = row[field];
        return `"${String(val ?? '').replace(/"/g, '""')}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Parse stock sheet CSV (your Excel format)
  function parseStockSheetCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    const results = [];

    for (let i = 4; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('|---') || line.toUpperCase().includes('ITEMS')) continue;

      const cells = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length < 7) continue;

      const itemName = cells[0]?.trim();
      if (!itemName || itemName.toLowerCase().includes('items')) continue;

      const parseNum = (val) => {
        if (!val || val === '') return null;
        const cleaned = String(val).replace(/[^\d.-]/g, '');
        return cleaned ? (cleaned.includes('.') ? parseFloat(cleaned) : parseInt(cleaned)) : null;
      };

      results.push({
        itemName,
        openingStock: parseNum(cells[1]) ?? 0,
        addStock: parseNum(cells[2]),
        quantitySold: parseNum(cells[4]),
        unitPrice: parseNum(cells[5]),
        closingStock: parseNum(cells[6]),
        revenue: parseNum(cells[7])
      });
    }
    return results;
  }

  // Parse item name → category + size + batchType
  function parseItemName(fullName) {
    const name = (fullName || '').toUpperCase().trim();
    let category = 'UNKNOWN';
    let size = 'DEFAULT';
    let batchType = APP_CONFIG.defaultBatchType;

    if (name.includes('LOCALLY SEWN')) batchType = 'LOCALLY_SEWN';
    else if (name.includes('1ST EVER BATCH') || name.includes('[1ST EVER BATCH]')) batchType = 'FIRST_BATCH';

    if (name.includes('P.E KIT')) category = 'PE_KIT';
    else if (name.includes('LILAC') && name.includes('UNIFORM')) category = 'LILAC_UNIFORM';
    else if (name.includes('CUSTOMISED') && name.includes('UNIFORM')) category = 'CUSTOMISED_UNIFORM';
    else if (name.includes('LACOSTE')) category = 'LACOSTE_TSHIRT';
    else if (name.includes('SOCKS')) category = 'SOCKS';

    const sizePatterns = [
      /SIZE\s+([A-Z0-9\s\-\(\)\/]+?)(?:\s*\[|$|\()/,
      /SIZE\s+([A-Z0-9\s\-\(\)\/]+?)$/,
      /(\d+\s*-\s*\d+\s*yrs)/i,
      /(JHS\s+GIRL\s+\w+)/i
    ];
    for (const pattern of sizePatterns) {
      const match = name.match(pattern);
      if (match) {
        size = match[1].trim().replace(/\s+/g, ' ');
        break;
      }
    }
    return { category, size, batchType };
  }

  async function getWeekFromUser() {
    const input = prompt("Enter Year and Week (e.g., '2026 11'):", `${APP_CONFIG.currentYear} ${APP_CONFIG.currentWeek}`);
    if (!input) return null;
    const [yearStr, weekStr] = input.trim().split(/\s+/);
    const year = parseInt(yearStr);
    const weekNumber = parseInt(weekStr);
    if (isNaN(year) || isNaN(weekNumber)) return null;
    return { year, weekNumber };
  }

  async function markImportError(itemName, message) {
    try {
      await supabase
        .from('temp_import_data')
        .update({ import_status: 'ERROR', error_message: message })
        .eq('raw_item_name', itemName);
    } catch (e) {
      console.error('Failed to mark import error:', e);
    }
  }

  // ========== CORE FUNCTIONS ==========
async function fetchInventory() {
  if (isLoading) return;
  isLoading = true;

  try {
    const { data, error } = await supabase
      .from('product_current_stock')  // Uses the view we just created
      .select('*')                    // Gets all columns
      .order('category', { ascending: true });

    if (error) throw error;

    // Transform for table display
    inventoryData = (data || []).map(item => ({
      id: item.id,
      name: `${item.category.replace('_', ' ')} - ${item.size}`,
      category: item.category,
      size: item.size,
      batch_type: item.batch_type,
      stock: item.closing_stock ?? 0,  // Show closing stock
      price: parseFloat(item.unit_price) || 0,
      is_active: item.is_active
    }));

    renderTable(inventoryData);
  } catch (err) {
    console.error("Fetch error:", err);
    alert("❌ " + err.message);
  } finally {
    isLoading = false;
  }
}

  function renderTable(data) {
    tableBody.innerHTML = '';
    if (!data?.length) {
      tableBody.innerHTML = `
        <tr><td colspan="7" style="text-align:center; padding: 30px; color: #666;">
          <i class="fas fa-box-open" style="font-size: 2rem; margin-bottom: 10px; display:block;"></i>
          No items found. Use <strong>"Add Product"</strong> or <strong>"Import CSV"</strong> to start.
        </td></tr>`;
      return;
    }

    data.forEach(item => {
      const isLow = item.stock < APP_CONFIG.lowStockThreshold;
      const statusHtml = isLow
        ? `<span class="badge badge-danger"><i class="fas fa-exclamation-circle"></i> Low Stock (${item.stock})</span>`
        : `<span class="badge badge-success"><i class="fas fa-check-circle"></i> In Stock (${item.stock})</span>`;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml((item.category || '').replace('_', ' '))}</td>
        <td>${escapeHtml(item.size || '')}</td>
        <td>${item.stock}</td>
        <td>${APP_CONFIG.currency} ${item.price.toFixed(2)}</td>
        <td>${statusHtml}</td>
        <td>
          <button class="btn-icon btn-edit" data-id="${item.id}" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn-icon btn-delete" data-id="${item.id}" title="Delete"><i class="fas fa-trash"></i></button>
        </td>`;
      tableBody.appendChild(row);
    });

    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => editItem(parseInt(e.currentTarget.dataset.id)));
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => deleteItem(parseInt(e.currentTarget.dataset.id)));
    });
  }

  function filterData() {
    const term = searchInput.value.toLowerCase().trim();
    const cat = categoryFilter.value;
    const filtered = inventoryData.filter(item => {
      const matchesSearch = !term ||
        (item.name?.toLowerCase().includes(term)) ||
        (item.size?.toLowerCase().includes(term)) ||
        (item.category?.toLowerCase().includes(term));
      const matchesCat = cat === 'all' || item.category === cat;
      return matchesSearch && matchesCat;
    });
    renderTable(filtered);
  }

  searchInput.addEventListener('input', filterData);
  categoryFilter.addEventListener('change', filterData);

  // Add Product
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = addForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    try {
      const category = document.getElementById('new-item-category').value;
      const size = document.getElementById('new-item-size').value.toUpperCase().trim();
      const initialStock = parseInt(document.getElementById('new-item-stock').value) || 0;
      const unitPrice = parseFloat(document.getElementById('new-item-price').value) || 0;

      const {  product, error: productError } = await supabase
        .from('products')
        .insert({
          category,
          subcategory: null,
          size,
          batch_type: APP_CONFIG.defaultBatchType,
          unit_price: unitPrice,
          is_active: true
        })
        .select()
        .single();

      if (productError) throw productError;

      const now = new Date();
      const { error: stockError } = await supabase.from('weekly_stock').insert({
        product_id: product.id,
        year: now.getFullYear(),
        week_number: getWeekNumber(now),
        opening_stock: initialStock,
        add_stock: 0,
        total_stock: initialStock,
        quantity_sold: 0,
        closing_stock: initialStock,
        revenue: 0,
        created_by: await getCurrentUserId()
      });

      if (stockError) {
        await supabase.from('products').delete().eq('id', product.id);
        throw stockError;
      }

      await fetchInventory();
      closeAddModal();
      addForm.reset();
      showSuccess("Product added successfully!");
    } catch (error) {
      console.error("Add product error:", error);
      showError(error.message || "Failed to add product");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });

  async function editItem(productId) {
    const item = inventoryData.find(i => i.id === productId);
    if (!item) return;
    alert(`Edit functionality for "${item.name}" (ID: ${productId})\n\nImplement modal form population here.`);
  }

  async function deleteItem(productId) {
    const item = inventoryData.find(i => i.id === productId);
    if (!item) return;
    if (!confirm(`Deactivate "${item.name}"? This hides it but keeps history.`)) return;

    try {
      const { error } = await supabase.from('products').update({ is_active: false }).eq('id', productId);
      if (error) throw error;
      inventoryData = inventoryData.filter(i => i.id !== productId);
      renderTable(inventoryData);
      showSuccess("Product deactivated successfully");
    } catch (error) {
      console.error("Delete error:", error);
      showError("Failed to deactivate product");
    }
  }

  // Import CSV
  async function processImport() {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];
    if (!file) { showError("Please select a CSV file"); return; }

    const importBtn = document.querySelector('#import-modal .btn-primary');
    const originalBtnText = importBtn.innerHTML;
    importBtn.disabled = true;
    importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    try {
      const text = await readFileAsText(file);
      const rows = parseStockSheetCSV(text);
      if (!rows.length) throw new Error("No valid data rows found");

      const { year, weekNumber } = await getWeekFromUser() || { year: APP_CONFIG.currentYear, weekNumber: APP_CONFIG.currentWeek };

      const importRecords = rows.map(row => ({
        raw_item_name: row.itemName,
        opening_stock: row.openingStock,
        add_stock: row.addStock ?? 0,
        quantity_sold: row.quantitySold ?? 0,
        unit_price: row.unitPrice,
        closing_stock: row.closingStock,
        revenue: row.revenue ?? 0,
        import_status: 'PENDING'
      }));

      const { error: insertError } = await supabase.from('temp_import_data').insert(importRecords);
      if (insertError) throw insertError;

      let successCount = 0, errorCount = 0;
      for (const record of importRecords) {
        try {
          const { category, size, batchType } = parseItemName(record.raw_item_name);
          const {  existingProduct } = await supabase
            .from('products').select('id, unit_price')
            .eq('category', category).eq('size', size).eq('batch_type', batchType).maybeSingle();

          let productId;
          if (existingProduct) {
            productId = existingProduct.id;
            if (record.unit_price && record.unit_price !== existingProduct.unit_price) {
              await supabase.from('products').update({ unit_price: record.unit_price }).eq('id', productId);
            }
          } else {
            const {  newProduct, error: prodError } = await supabase.from('products').insert({
              category, subcategory: null, size, batch_type: batchType,
              unit_price: record.unit_price, is_active: true
            }).select().single();
            if (prodError) throw prodError;
            productId = newProduct.id;
          }

          const calculatedClosing = record.opening_stock + record.add_stock - record.quantity_sold;
          const { error: stockError } = await supabase.from('weekly_stock').upsert({
            product_id: productId, year, week_number: weekNumber,
            opening_stock: record.opening_stock, add_stock: record.add_stock,
            total_stock: record.opening_stock + record.add_stock,
            quantity_sold: record.quantity_sold,
            closing_stock: record.closing_stock ?? calculatedClosing,
            revenue: record.revenue ?? 0, updated_at: new Date().toISOString()
          }, { onConflict: 'product_id,year,week_number' });

          if (stockError) throw stockError;
          await supabase.from('temp_import_data').update({ import_status: 'COMPLETE' }).eq('raw_item_name', record.raw_item_name);
          successCount++;
        } catch (err) {
          console.error("Record error:", err);
          await markImportError(record.raw_item_name, err.message);
          errorCount++;
        }
      }
      closeImportModal();
      fileInput.value = '';
      await fetchInventory();
      showSuccess(`✅ Import: ${successCount} succeeded, ${errorCount} failed`);
    } catch (error) {
      console.error("Import error:", error);
      showError(error.message || "Import failed");
    } finally {
      importBtn.disabled = false;
      importBtn.innerHTML = originalBtnText;
    }
  }

  // Export CSV
  async function executeExport() {
    const type = document.getElementById('export-type').value;
    const {  data, error } = await supabase
      .from('product_current_stock')
      .select('id, category, size, batch_type, unit_price, closing_stock, revenue');

    if (error) { showError("Failed to fetch export data"); return; }

    let exportData = (data || []).map(item => ({
      "Item Name": `${(item.category||'').replace('_',' ')} - ${item.size||''}`,
      "Category": item.category, "Size/Batch": `${item.size||''} (${item.batch_type||''})`,
      "Current Stock": item.closing_stock ?? 0,
      "Unit Price (GH¢)": parseFloat(item.unit_price||0).toFixed(2),
      "Revenue (GH¢)": parseFloat(item.revenue||0).toFixed(2)
    }));

    if (type === 'low_stock') {
      exportData = exportData.filter(i => i["Current Stock"] < APP_CONFIG.lowStockThreshold);
    }
    if (!exportData.length) { alert("No data matches export criteria."); return; }

    downloadCSV(exportData, `Raha_Inventory_${type}_${new Date().toISOString().slice(0,10)}.csv`);
    closeExportModal();
    showSuccess("Report downloaded successfully");
  }

  // ========== MODAL CONTROLS ==========
  window.openAddModal = () => document.getElementById('add-modal').classList.remove('hidden');
  window.closeAddModal = () => { document.getElementById('add-modal').classList.add('hidden'); addForm.reset(); };
  window.openImportModal = () => document.getElementById('import-modal').classList.remove('hidden');
  window.closeImportModal = () => { document.getElementById('import-modal').classList.add('hidden'); document.getElementById('csv-file-input').value = ''; };
  window.openExportModal = () => document.getElementById('export-modal').classList.remove('hidden');
  window.closeExportModal = () => document.getElementById('export-modal').classList.add('hidden');

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  });

  // ========== EXPOSE FUNCTIONS FOR HTML onclick ==========
  window.processImport = processImport;
  window.executeExport = executeExport;
  window.editItem = editItem;
  window.deleteItem = deleteItem;

  // Initialize
  fetchInventory();

  // Auth state listener (safe)
  if (supabase.auth?.onAuthStateChange) {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') fetchInventory();
    });
  }
});