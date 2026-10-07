/**
 * 📦 StockFlow RAHA - External Import Module
 * File: assets/js/import-inventory.js
 * 
 * ✅ Zero changes to your main HTML/JS required
 * ✅ Exposes window.openImportModal() and window.processImport()
 * ✅ Uses your existing APP_STATE, showToast(), Supabase client
 */

(function() {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    // CONFIG
    // ─────────────────────────────────────────────────────────────
    const VALID_CATEGORIES = ['PE_KIT', 'LILAC_UNIFORM', 'CUSTOMISED_UNIFORM', 'LACOSTE_TSHIRT', 'SOCKS'];

    // ─────────────────────────────────────────────────────────────
    // PUBLIC: Attach to window so HTML onclick="" works
    // ─────────────────────────────────────────────────────────────
    
 
    window.openImportModal = function() {
        const modal = document.getElementById('import-modal');
        if (!modal) return;
        
        modal.classList.remove('hidden');
        _updateWeekLabel();
    };

    /**
     * Process CSV import
     * Called by: onclick="processImport()" in your HTML
     */
    window.processImport = async function() {
        const fileInput = document.getElementById('csv-file-input');
        const file = fileInput?.files?.[0];
        
        if (!file) {
            _showToast('⚠️ Please select a CSV file first', 'error');
            return;
        }

        const btn = document.querySelector('#import-modal .btn-primary');
        const originalBtnText = btn?.innerHTML || 'Upload & Update';
        
        try {
            // UI: Loading state
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }
            
            // Step 1: Read & Parse CSV
            const text = await file.text();
            const parsed = _parseCSV(text);
            
            if (parsed.errors.length > 0) {
                _showValidationErrors(parsed.errors);
                return;
            }
            
            // Step 2: Get Academic Context
            const academic = _getAcademicContext();
            if (!academic) {
                _showToast('⚠️ No active academic week. Open a week in Calendar first.', 'error');
                return;
            }
            
            // Update label for confirmation
            _updateWeekLabel(academic);
            
            // Step 3: Import Rows
            const result = await _executeImport(parsed.rows, academic);
            
            // Step 4: Show Results & Refresh
            _showToast(`✅ Imported ${result.success} product${result.success !== 1 ? 's' : ''}`, 'success');
            
            // Refresh inventory if your function exists
            if (typeof window.refreshInventoryTable === 'function') {
                await window.refreshInventoryTable();
            }
            
            // Cleanup
            closeImportModal();
            if (fileInput) fileInput.value = '';
            
        } catch (err) {
            console.error('Import error:', err);
            _showToast(`❌ ${err.message || 'Import failed'}`, 'error');
        } finally {
            // Restore button
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalBtnText;
            }
        }
    };

    // ─────────────────────────────────────────────────────────────
    // PRIVATE: Helpers (won't conflict with your code)
    // ─────────────────────────────────────────────────────────────

    function _parseCSV(text) {
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error('CSV must have header + at least 1 data row');
        
        const headers = _parseLine(lines[0]).map(h => h.trim());
        const required = ['Name', 'Category', 'Size', 'Stock', 'Price'];
        const missing = required.filter(r => !headers.includes(r));
        if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}`);
        
        const rows = [];
        const errors = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = _parseLine(lines[i]);
            const row = {};
            headers.forEach((h, idx) => { row[h] = values[idx]?.trim() || ''; });
            
            const validation = _validateRow(row, i + 1);
            if (validation.valid) {
                rows.push(validation.data);
            } else {
                errors.push(...validation.errors);
            }
        }
        
        return { rows, errors };
    }

    function _parseLine(line) {
        const values = [];
        let current = '', inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i], next = line[i + 1];
            if (char === '"') {
                if (next === '"') { current += '"'; i++; }
                else { inQuotes = !inQuotes; }
            } else if (char === ',' && !inQuotes) {
                values.push(current); current = '';
            } else { current += char; }
        }
        values.push(current);
        return values.map(v => v.replace(/^"|"$/g, ''));
    }

    function _validateRow(row, rowNum) {
        const errors = [];
        const data = {};
        
        const name = (row.Name || '').trim().toUpperCase();
        if (!name) errors.push(`Row ${rowNum}: Name required`);
        data.name = name.slice(0, 100);
        
        const category = (row.Category || '').trim().toUpperCase();
        if (!VALID_CATEGORIES.includes(category)) {
            errors.push(`Row ${rowNum}: Invalid category "${row.Category}"`);
        }
        data.category = category;
        
        const size = (row.Size || '').trim();
        if (!size) errors.push(`Row ${rowNum}: Size required`);
        data.size = size.slice(0, 50);
        
        const stock = parseInt(row.Stock, 10);
        if (isNaN(stock) || stock < 0) errors.push(`Row ${rowNum}: Stock must be ≥0`);
        data.stock = stock;
        
        const price = parseFloat(row.Price);
        if (isNaN(price) || price < 0) errors.push(`Row ${rowNum}: Price must be ≥0`);
        data.price = Math.round(price * 100) / 100;
        
        return { valid: errors.length === 0, errors, data };
    }

    function _getAcademicContext() {
        // Priority 1: Use selected academic from your APP_STATE
        const selected = window.APP_STATE?.selectedAcademic;
        if (selected?.year && selected?.term && selected?.week) {
            return selected;
        }
        // Priority 2: Return null (your UI will show error)
        return null;
    }

    function _updateWeekLabel(academic = null) {
        const label = document.getElementById('import-week-label');
        if (!label) return;
        
        const ctx = academic || _getAcademicContext();
        if (ctx?.year && ctx?.week) {
            label.textContent = `${ctx.year.name} • ${ctx.week.name}`;
            label.classList.remove('text-danger');
        } else {
            label.textContent = 'No active week';
            label.classList.add('text-danger');
        }
    }

    async function _executeImport(rows, academic) {
        const supabase = window.APP_STATE?.supabase;
        if (!supabase) throw new Error('Supabase not initialized');
        
        const createdBy = window.APP_STATE?.userName || 'Admin';
        const yearVal = parseInt(academic.year.name.split('/')[0], 10);
        const weekNum = academic.week.week_number;
        
        let success = 0;
        
        for (const item of rows) {
            try {
                // 1. Insert product
                const { data: prod, error: prodErr } = await supabase
                    .from('products')
                    .insert({
                        product_name: item.name,
                        category: item.category,
                        size: item.size,
                        batch_type: 'REGULAR',
                        unit_price: item.price,
                        is_active: true
                    })
                    .select('id')
                    .maybeSingle();
                
                if (prodErr || !prod?.id) continue;
                const productId = prod.id;
                
                // 2. Insert weekly_stock
                await supabase.from('weekly_stock').insert({
                    product_id: productId,
                    year: yearVal,
                    week_number: weekNum,
                    opening_stock: item.stock,
                    add_stock: item.stock,
                    quantity_sold: 0,
                    revenue: 0,
                    CreatedBy: createdBy
                });
                
                // 3. Insert transaction (non-blocking)
                await supabase.from('transactions').insert({
                    product_id: productId,
                    week_number: weekNum,
                    transaction_type: 'RESTOCK',
                    quantity: item.stock,
                    unit_price_at_time: item.price,
                    year: yearVal,
                    createdBy: createdBy
                }).catch(() => {});
                
                success++;
            } catch (err) {
                console.warn(`Failed to import "${item.name}":`, err.message);
            }
        }
        
        return { success };
    }

    function _showValidationErrors(errors) {
        const msg = errors.slice(0, 3).join('\n');
        const more = errors.length > 3 ? `\n...and ${errors.length - 3} more` : '';
        _showToast(`⚠️ CSV errors:\n${msg}${more}`, 'error');
    }

    // Use your existing showToast if available, else fallback
    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else {
            // Minimal fallback
            alert(`${type === 'error' ? '❌' : '✅'} ${msg}`);
        }
    }

    // Use your existing closeImportModal if available
    function closeImportModal() {
        if (typeof window.closeImportModal === 'function') {
            window.closeImportModal();
        } else {
            const modal = document.getElementById('import-modal');
            if (modal) modal.classList.add('hidden');
        }
    }

    // Auto-update week label when modal opens (if your code calls window.openImportModal)
    document.addEventListener('DOMContentLoaded', () => {
        // Ensure functions are on window (redundant but safe)
        if (typeof window.openImportModal !== 'function') {
            window.openImportModal = window.openImportModal;
        }
        if (typeof window.processImport !== 'function') {
            window.processImport = window.processImport;
        }
    });

})();