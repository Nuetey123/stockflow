// assets/js/reports.js
(function() {
    'use strict';

    // Global state (scoped to this IIFE)
    let currentTransactions = [];
    let currentReportType = 'sales';
    let categoryChartInstance = null;
    let trendChartInstance = null;
    let supabase = null;

    // Initialize on DOM load
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('Reports page initialized');
        
        // Wait for Supabase client to be available
        await waitForSupabase();
        
        if (!supabase) {
            console.error("❌ Supabase client not found after waiting!");
            return;
        }
        
        console.log("✅ Using existing Supabase client from window.APP.supabase");
        
        initializeEventListeners();
        loadAvailableWeeks();
        generateReport();
    });

    // Wait for Supabase client to be ready
    async function waitForSupabase(timeout = 5000) {
        const start = Date.now();
        return new Promise((resolve) => {
            const check = () => {
                if (window.APP && window.APP.supabase) {
                    supabase = window.APP.supabase;
                    resolve();
                } else if (Date.now() - start > timeout) {
                    console.error("⏱️ Timeout waiting for Supabase client");
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    function initializeEventListeners() {
        document.getElementById('report-type').addEventListener('change', (e) => {
            currentReportType = e.target.value;
            generateReport();
        });

        document.getElementById('report-period').addEventListener('change', () => {
            generateReport();
        });

        document.getElementById('week-selector-list').addEventListener('change', () => {
            generateReport();
        });

        document.getElementById('export-report-btn').addEventListener('click', exportToExcel);
    }

    // Load available weeks from database
    async function loadAvailableWeeks() {
        try {
            const { data, error } = await supabase
                .from('weekly_stock')
                .select('year, week_number')
                .order('year', { ascending: false })
                .order('week_number', { ascending: false });

            if (error) throw error;

            const weekSelect = document.getElementById('week-selector-list');
            const uniqueWeeks = [...new Set(data.map(d => `Week ${d.week_number} - ${d.year}`))];
            
            weekSelect.innerHTML = '<option value="">Select a week...</option>';
            uniqueWeeks.forEach(week => {
                const option = document.createElement('option');
                option.value = week;
                option.textContent = week;
                weekSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading weeks:', error);
        }
    }

    // Main report generation function
    async function generateReport() {
        const period = document.getElementById('report-period').value;
        const selectedWeek = document.getElementById('week-selector-list').value;

        try {
            let query = supabase
                .from('weekly_stock')
                .select(`
                    *,
                    products (
                        id,
                        product_name,
                        unit_price
                    )
                `);

            // Apply weekly filter if selected
            if (period === 'WEEKLY' && selectedWeek) {
                const [weekText, year] = selectedWeek.split(' - ');
                const weekNum = parseInt(weekText.replace('Week ', ''));
                query = query.eq('week_number', weekNum).eq('year', parseInt(year));
            }

            const { data, error } = await query;

            // Debugging logs
            console.log("🔍 Supabase Query Result:", data);
            console.log("❌ Supabase Query Error:", error);

            if (error) throw error;

            if (!data || data.length === 0) {
                console.warn("⚠️ Query returned 0 records. Check your filters or database.");
            }

            currentTransactions = data || [];
            
            // Update all dashboard components
            updateKPIs();
            updateTopSellers();
            updateLowStockAlerts();
            renderCategoryChart();
            renderTrendChart();
            updateQuickStats();

        } catch (error) {
            console.error('Error generating report:', error);
            showError('Failed to load report data: ' + error.message);
        }
    }

    // Update KPI Cards
    function updateKPIs() {
        const totalRevenue = currentTransactions.reduce((sum, t) => sum + (parseFloat(t.revenue) || 0), 0);
        const totalUnits = currentTransactions.reduce((sum, t) => sum + (parseInt(t.quantity_sold) || 0), 0);
        
        // Find top category - extract from product_name
        const categoryCount = {};
        currentTransactions.forEach(t => {
            const productName = t.products?.product_name || 'Unknown';
            // Extract category from product name (first word or whole name)
            const category = productName.split(' ')[0] || 'Other';
            categoryCount[category] = (categoryCount[category] || 0) + (parseFloat(t.revenue) || 0);
        });
        
        const topCategory = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

        // Animate numbers
        animateValue('report-revenue', totalRevenue, 'currency');
        animateValue('report-units', totalUnits, 'number');
        document.getElementById('report-top-cat').textContent = topCategory;
    }

    // Update Top Sellers Table
    function updateTopSellers() {
        const productStats = {};
        
        currentTransactions.forEach(t => {
            const productId = t.product_id;
            const productName = t.products?.product_name || `Product #${productId}`;
            
            if (!productStats[productId]) {
                productStats[productId] = {
                    name: productName,
                    volume: 0,
                    value: 0
                };
            }
            
            productStats[productId].volume += parseInt(t.quantity_sold) || 0;
            productStats[productId].value += parseFloat(t.revenue) || 0;
        });

        const sortedProducts = Object.values(productStats)
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        const tbody = document.getElementById('top-sellers-body');
        tbody.innerHTML = sortedProducts.map(p => `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.volume.toLocaleString()} units</td>
                <td>GH¢ ${p.value.toFixed(2)}</td>
            </tr>
        `).join('');
    }

    // Update Low Stock Alerts
    async function updateLowStockAlerts() {
        try {
            // Get the most recent week's stock data
            const { data: weeklyStock, error } = await supabase
                .from('weekly_stock')
                .select(`
                    closing_stock,
                    products (
                        product_name
                    )
                `)
                .order('year', { ascending: false })
                .order('week_number', { ascending: false })
                .limit(50); // Get recent data

            if (error) throw error;

            // Filter products with low closing stock (threshold: 5 units)
            const lowStockThreshold = window.CONFIG?.settings?.lowStockThreshold || 5;
            const lowStockProducts = (weeklyStock || [])
                .filter(p => (p.closing_stock || 0) <= lowStockThreshold)
                .slice(0, 10);

            const tbody = document.getElementById('low-stock-body');
            
            if (lowStockProducts.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #10b981;"><i class="fas fa-check-circle"></i> All stock levels healthy</td></tr>';
                return;
            }

            tbody.innerHTML = lowStockProducts.map(p => {
                const stock = p.closing_stock || 0;
                const percentage = (stock / lowStockThreshold) * 100;
                const colorClass = percentage < 25 ? 'text-critical' : percentage < 50 ? 'text-warning' : 'text-low';
                const productName = p.products?.product_name || 'Unknown Product';
                
                return `
                    <tr>
                        <td><strong>${productName}</strong></td>
                        <td class="${colorClass}">
                            <i class="fas fa-exclamation-triangle"></i> ${stock} units
                        </td>
                        <td><small>Threshold: ${lowStockThreshold}</small></td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error fetching low stock:', error);
        }
    }

    // Render Category Distribution Chart
    function renderCategoryChart() {
        const categoryData = {};
        
        currentTransactions.forEach(t => {
            // Extract category from product name (first word)
            const productName = t.products?.product_name || 'Other';
            const category = productName.split(' ')[0];
            categoryData[category] = (categoryData[category] || 0) + (parseFloat(t.revenue) || 0);
        });

        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (categoryChartInstance) {
            categoryChartInstance.destroy();
        }

        categoryChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categoryData),
                datasets: [{
                    data: Object.values(categoryData),
                    backgroundColor: [
                        '#6b21a8', '#10b981', '#3b82f6', '#f59e0b', 
                        '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { padding: 15, usePointStyle: true }
                    },
                    title: {
                        display: true,
                        text: 'Revenue by Product Category',
                        font: { size: 16, weight: 'bold' }
                    }
                }
            }
        });
    }

    // Render Sales Trend Chart
    function renderTrendChart() {
        // Group by week
        const weeklyData = {};
        
        currentTransactions.forEach(t => {
            const weekKey = `Week ${t.week_number} - ${t.year}`;
            weeklyData[weekKey] = (weeklyData[weekKey] || 0) + (parseFloat(t.revenue) || 0);
        });

        const sortedWeeks = Object.keys(weeklyData).sort((a, b) => {
            const [weekA, yearA] = a.split(' - ');
            const [weekB, yearB] = b.split(' - ');
            if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
            return parseInt(weekB.replace('Week ', '')) - parseInt(weekA.replace('Week ', ''));
        });

        const canvas = document.getElementById('trendChart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedWeeks,
                datasets: [{
                    label: 'Revenue (GH¢)',
                    data: sortedWeeks.map(w => weeklyData[w]),
                    borderColor: '#6b21a8',
                    backgroundColor: 'rgba(107, 33, 168, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#6b21a8'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Sales Trend Over Time',
                        font: { size: 16, weight: 'bold' }
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: value => 'GH¢ ' + value.toFixed(0) }
                    }
                }
            }
        });
    }

    // Update Quick Stats Panel
    function updateQuickStats() {
        const totalTransactions = currentTransactions.length;
        const avgTransactionValue = totalTransactions > 0 
            ? currentTransactions.reduce((sum, t) => sum + (parseFloat(t.revenue) || 0), 0) / totalTransactions 
            : 0;
        
        const uniqueProducts = new Set(currentTransactions.map(t => t.product_id)).size;
        const dateRange = currentTransactions.length > 0 ? 
            `Week ${currentTransactions[currentTransactions.length - 1].week_number} - ${currentTransactions[0].year}` 
            : 'N/A';

        document.getElementById('quick-stats').innerHTML = `
            <div style="display: grid; gap: 12px; font-size: 0.9rem;">
                <div><i class="fas fa-list" style="color: #6b21a8; width: 20px;"></i> 
                    <strong>${totalTransactions}</strong> stock records</div>
                <div><i class="fas fa-box" style="color: #10b981; width: 20px;"></i> 
                    <strong>${uniqueProducts}</strong> unique products</div>
                <div><i class="fas fa-receipt" style="color: #3b82f6; width: 20px;"></i> 
                    Avg: <strong>GH¢ ${avgTransactionValue.toFixed(2)}</strong></div>
                <div><i class="fas fa-calendar" style="color: #f59e0b; width: 20px;"></i> 
                    <small>${dateRange}</small></div>
            </div>
        `;
    }

    // Export to Excel/CSV
    function exportToExcel() {
        if (currentTransactions.length === 0) {
            showError('No data to export');
            return;
        }

        const period = document.getElementById('report-period').value;
        const timestamp = new Date().toISOString().split('T')[0];
        
        const exportData = currentTransactions.map(t => ({
            'Record ID': t.id,
            'Year': t.year,
            'Week': t.week_number,
            'Product Name': t.products?.product_name || 'N/A',
            'Opening Stock': t.opening_stock || 0,
            'Added Stock': t.add_stock || 0,
            'Total Stock': t.total_stock || 0,
            'Quantity Sold': t.quantity_sold || 0,
            'Closing Stock': t.closing_stock || 0,
            'Unit Price': `GH¢ ${parseFloat(t.products?.unit_price || 0).toFixed(2)}`,
            'Revenue': `GH¢ ${parseFloat(t.revenue || 0).toFixed(2)}`
        }));

        const csv = convertToCSV(exportData);
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `weekly_stock_report_${period}_${timestamp}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showSuccess('Report exported successfully!');
    }

    // Helper: Convert JSON to CSV
    function convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const rows = data.map(obj => 
            headers.map(header => {
                const val = obj[header];
                return typeof val === 'string' && (val.includes(',') || val.includes('"')) 
                    ? `"${val.replace(/"/g, '""')}"` 
                    : val;
            }).join(',')
        );
        
        return [headers.join(','), ...rows].join('\n');
    }

    // Helper: Animate number values
    function animateValue(elementId, value, type) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const duration = 1000;
        const start = 0;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = start + (value - start) * easeOutQuart;

            if (type === 'currency') {
                element.textContent = `GH¢ ${current.toFixed(2)}`;
            } else {
                element.textContent = Math.floor(current).toLocaleString();
            }

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // Helper: Show error message
    function showError(message) {
        console.error(message);
        alert(message);
    }

    // Helper: Show success message
    function showSuccess(message) {
        console.log(message);
        alert(message);
    }

})(); // End of IIFE