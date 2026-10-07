/* ==========================================================================
   SALES POINT OF SALE (POS) LAYER FOR STOCKFLOW RAHA
   ========================================================================== */

// Local state for the shopping cart items on this page
let CART = [];

document.addEventListener('DOMContentLoaded', async () => {
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

    // 4. Initialize layout UI elements and data pipelines
    await initSalesPage();
});

/* ==========================================
   1. INITIALIZATION & DATA CORE FETCHING
   ========================================== */
async function initSalesPage() {
    // Hydrate User Profile Information directly from the clean state engine
    hydrateSidebarProfile();

    // Handle initial academic tracking calendar views
    updateHeaderWeekIndicator();

    // Fetch live inventory items with stock levels from view/table layer
    await fetchLivePOSProducts();

    // Setup input search filtering event listener
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.addEventListener('input', filterPOSProducts);
    }
    
    // Setup manual logout link binding via standard state API
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await window.APP.signOut();
        });
    }
}

function hydrateSidebarProfile() {
    if (!window.APP.user) return;

    const cashierName = window.APP.user.full_name || "Admin User";
    const nameElement = document.querySelector('.user-profile .info h4');
    const imgElement = document.querySelector('.user-profile img');
    
    if (nameElement) nameElement.textContent = cashierName.toUpperCase();
    if (imgElement) {
        imgElement.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(cashierName)}&background=C8A2D9&color=fff`;
    }
}

function updateHeaderWeekIndicator() {
    const badge = document.getElementById('current-week-badge');
    if (!badge) return;

    // Scan for any explicitly open week from the automated global state array
    const openWeek = window.APP.academic?.weeks?.find(w => w.is_open === true);

    if (openWeek) {
        const term = window.APP.academic.terms?.find(t => t.id === openWeek.term_id);
        const academicYearObj = window.APP.academic.years?.find(y => y.id === term?.academic_year_id);
        const structuralYear = academicYearObj ? academicYearObj.name : "2026";

        // Assign to memory cache reference cleanly
        window.APP.academic.currentWeek = openWeek;

        badge.textContent = `Week ${openWeek.week_number} (${structuralYear})`;
        badge.style.background = "";
        badge.style.color = "";
        
        // Ensure checkout button is active if a valid window is found
        togglePOSFormState(true);
    } else {
        window.APP.academic.currentWeek = null;
        badge.textContent = "No Open Week";
        badge.style.background = "#fee2e2";
        badge.style.color = "#ef4444";
        
        // Disable operations safely if no tracking timeline is active
        togglePOSFormState(false);
    }
}

function togglePOSFormState(isEnabled) {
    const checkoutBtn = document.querySelector('.checkout-btn');
    if (checkoutBtn) {
        checkoutBtn.disabled = !isEnabled;
    }
}

async function fetchLivePOSProducts() {
    const gridContainer = document.getElementById('product-grid');
    if (!gridContainer) return;

    gridContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Loading items from state...</p></div>';

    const supabase = window.APP.supabase;
    
    // 1. Get the current open week ID to filter stock correctly
    const openWeek = window.APP.academic?.weeks?.find(w => w.is_open === true);
    const weekId = openWeek ? openWeek.id : null;

    try {
        // 2. Query weekly_stock directly and join with products (bypassing the broken view)
        const { data, error } = await supabase
            .from('weekly_stock')
            .select(`
                product_id,
                total_stock,
                quantity_sold,
                products (
                    product_name,
                    category,
                    size,
                    unit_price
                )
            `)
            .eq('week_id', weekId); // Filter by the active week
            
        if (error) throw error;

        // 3. ✅ LOCAL CALCULATION LOGIC: Calculate current stock in JavaScript
        const processedItems = (data || []).map(row => {
            const product = row.products || {};
            const totalStock = row.total_stock || 0;
            const quantitySold = row.quantity_sold || 0;
            
            // THIS IS THE MISSING LOGIC:
            const currentStock = totalStock - quantitySold; 

            return {
                product_id: row.product_id,
                product_name: product.product_name || 'Unknown Product',
                category: product.category || 'Unknown',
                size: product.size || 'N/A',
                unit_price: product.unit_price || 0,
                closing_stock: currentStock // ✅ Map calculated stock to the variable your POS code already expects!
            };
        });

        // Populate active runtime collection variables cache
        window.APP.inventory.items = processedItems;
        renderProductGrid(processedItems);

    } catch (err) {
        console.error("Error building POS product catalog matrix:", err.message);
        gridContainer.innerHTML = '<p style="grid-column:1/-1; color:red; text-align:center;">Failed to load items. Check console logs.</p>';
    }
}

/* ==========================================
   2. RENDERING ENGINE (PRODUCTS GRID)
   ========================================== */
function renderProductGrid(products) {
    const gridContainer = document.getElementById('product-grid');
    if (!gridContainer) return;

    if (products.length === 0) {
        gridContainer.innerHTML = '<p style="grid-column:1/-1; color:#999; text-align:center; padding:20px;">No items match criteria.</p>';
        return;
    }

    gridContainer.innerHTML = ''; 

    products.forEach(item => {
        const displayName = item.product_name || item.category.replace(/_/g, ' ');
        const stockAmt = Math.max(0, item.closing_stock || 0);
        const isOutOfStock = stockAmt <= 0;

        const card = document.createElement('div');
        card.className = 'product-card';
        if (isOutOfStock) card.style.cssText = 'opacity: 0.6; cursor: not-allowed; position: relative;';

        card.innerHTML = `
            <h4>${displayName} <span style="font-size:0.75rem; color:#888;">(${item.size || 'N/A'})</span></h4>
            <div class="price">GH¢ ${parseFloat(item.unit_price || 0).toFixed(2)}</div>
            <span class="stock-badge" style="background: ${stockAmt <= 5 ? '#fef3c7; color:#d97706;' : '#d1fae5; color:#059669;'}">
                ${stockAmt} Left
            </span>
        `;

        if (!isOutOfStock) {
            card.onclick = () => addToCart(item);
        } else {
            card.innerHTML += `<div style="position:absolute; bottom:5px; right:5px; color:#ef4444; font-size:0.7rem; font-weight:bold;">OUT OF STOCK</div>`;
        }

        gridContainer.appendChild(card);
    });
}

function filterPOSProducts(e) {
    const query = e.target.value.toLowerCase().trim();
    const matches = window.APP.inventory.items.filter(item => {
        const nameMatch = (item.product_name || '').toLowerCase().includes(query);
        const catMatch = (item.category || '').toLowerCase().includes(query);
        const sizeMatch = (item.size || '').toLowerCase().includes(query);
        return nameMatch || catMatch || sizeMatch;
    });
    renderProductGrid(matches);
}

/* ==========================================
   3. POS BASKET & CART BUSINESS LOGIC
   ========================================== */
function addToCart(product) {
    // Prevent entries additions if timeline lock is missing
    if (!window.APP.academic.currentWeek) {
        window.APP.showToast("Cannot build sale cart without an active OPEN term week.", "error");
        return;
    }

    const existingItem = CART.find(item => item.product_id === product.product_id);

    if (existingItem) {
        if (existingItem.qty >= product.closing_stock) {
            alert(`Cannot sell more than available physical inventory! (${product.closing_stock} available)`);
            return;
        }
        existingItem.qty++;
    } else {
        CART.push({
            product_id: product.product_id,
            name: product.product_name || product.category.replace(/_/g, ' '),
            size: product.size || 'N/A',
            price: parseFloat(product.unit_price),
            maxStock: product.closing_stock,
            qty: 1
        });
    }
    updateCartUI();
}

function updateCartQty(productId, delta) {
    const item = CART.find(i => i.product_id === productId);
    if (!item) return;

    item.qty += delta;

    if (item.qty > item.maxStock) {
        alert(`Insufficient stock level. Cap set to: ${item.maxStock}`);
        item.qty = item.maxStock;
    }

    if (item.qty <= 0) {
        CART = CART.filter(i => i.product_id !== productId);
    }
    updateCartUI();
}

// Global scope window access attachment required for inline onclick button maps
window.updateCartQty = updateCartQty;

function updateCartUI() {
    const cartContainer = document.getElementById('cart-items');
    const totalDisplay = document.getElementById('cart-total-display');
    
    if (!cartContainer || !totalDisplay) return;

    if (CART.length === 0) {
        cartContainer.innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">Cart is empty</p>';
        totalDisplay.textContent = 'GH¢ 0.00';
        return;
    }

    cartContainer.innerHTML = '';
    let runningTotal = 0;

    CART.forEach(item => {
        const itemSubtotal = item.price * item.qty;
        runningTotal += itemSubtotal;

        const row = document.createElement('div');
        row.className = 'cart-item';
        row.innerHTML = `
            <div class="cart-item-info">
                <h5>${item.name} (${item.size})</h5>
                <span>${item.qty} × GH¢ ${item.price.toFixed(2)}</span>
            </div>
            <div class="cart-item-actions">
                <button class="qty-btn" onclick="window.updateCartQty(${item.product_id}, -1)">-</button>
                <strong>${item.qty}</strong>
                <button class="qty-btn" onclick="window.updateCartQty(${item.product_id}, 1)">+</button>
                <span style="font-weight:600; min-width:65px; text-align:right;">GH¢ ${itemSubtotal.toFixed(2)}</span>
            </div>
        `;
        cartContainer.appendChild(row);
    });

    totalDisplay.textContent = `GH¢ ${runningTotal.toFixed(2)}`;
}

/* ==========================================
   4. TRANSACTIONS CHECKOUT COMPLETION ENGINE
   ========================================== */
async function processCheckout() {
    if (CART.length === 0) {
        window.APP.showToast("Your shopping cart is empty!", "error");
        return;
    }

    const studentNameInput = document.getElementById('customer-student-name');
    const studentClassInput = document.getElementById('customer-student-class');
    
    const studentName = studentNameInput?.value.trim();
    const studentClass = studentClassInput?.value.trim();

    if (!studentName) {
        alert("Please enter the student's name before checking out.");
        studentNameInput?.focus();
        return;
    }
    if (!studentClass) {
        alert("Please assign a class/grade to this transaction.");
        studentClassInput?.focus();
        return;
    }

    const activeWeek = window.APP.academic.currentWeek;
    if (!activeWeek) {
        window.APP.showToast("Checkout aborted: There is currently no active open operational week.", "error");
        return;
    }

    const checkoutBtn = document.querySelector('.checkout-btn');
    const originalBtnText = checkoutBtn ? checkoutBtn.innerHTML : "Checkout";
    
    if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Order...';
    }

    try {
        const supabase = window.APP.supabase;
        const term = window.APP.academic.terms?.find(t => t.id === activeWeek.term_id);
        const academicYearObj = window.APP.academic.years?.find(y => y.id === term?.academic_year_id);
        const activeYearNum = academicYearObj ? parseInt(academicYearObj.name, 10) : 2026;

        const cashierName = window.APP.user.full_name || "POS Terminal Cashier";

        // Map internal cart layout structures directly to backend database column rows
        const transactionRecords = CART.map(item => ({
            product_id: parseInt(item.product_id, 10),
            week_number: parseInt(activeWeek.week_number, 10),
            transaction_type: 'SALE', 
            quantity: parseInt(item.qty, 10),
            unit_price_at_time: parseFloat(item.price),
            year: parseInt(activeYearNum, 10),
            performed_by: window.APP.user.id,
            createdBy: cashierName,
            student_name: studentName,   
            student_class: studentClass  
        }));

        // Post transaction block directly into database
        const { error: insertError } = await supabase
            .from('transactions')
            .insert(transactionRecords);

        if (insertError) throw insertError;

        window.APP.showToast(`Sale recorded successfully for ${studentName}!`, "success");
        
        // Reset basket layouts fields
        CART = [];
        if (studentNameInput) studentNameInput.value = '';
        if (studentClassInput) studentClassInput.value = '';
        
        updateCartUI();
        await fetchLivePOSProducts();

    } catch (err) {
        console.error("Sale Processing Failure Exception Error:", err);
        alert(`Checkout processing aborted:\n${err.message || "Unknown Error"}`);
    } finally {
        if (checkoutBtn) {
            checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = originalBtnText;
        }
    }
}

// Attach checkout engine directly to global context window for layout access
window.processCheckout = processCheckout;