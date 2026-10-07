// assets/js/reports.js

document.addEventListener('DOMContentLoaded', () => {

    // 1. FETCH DATA FROM LOCAL STORAGE (Mock DB)
    const inventoryData = JSON.parse(localStorage.getItem('raha_inventory')) || [];

    // 2. HANDLE EMPTY DATA GRACEFULLY
    if (inventoryData.length === 0) {
        showEmptyState();
        return;
    }

    // 3. CALCULATE KPIS DYNAMICALLY
    let totalRevenue = 0;
    let totalUnits = 0;
    let categorySales = {};
    let lowStockItems = [];

    inventoryData.forEach(item => {
        // Calculate sold: Opening - Closing (ensure non-negative)
        const opening = item.opening !== undefined ? item.opening : item.stock;
        const sold = Math.max(0, opening - item.stock);
        const revenue = sold * item.price;

        totalRevenue += revenue;
        totalUnits += sold;

        // Aggregate by category
        if (!categorySales[item.category]) {
            categorySales[item.category] = 0;
        }
        categorySales[item.category] += revenue;

        // Track low stock (< 5)
        if (item.stock < 5) {
            lowStockItems.push(item);
        }
    });

    // Update DOM KPIs
    document.getElementById('report-revenue').textContent = `GH¢ ${totalRevenue.toFixed(2)}`;
    document.getElementById('report-units').textContent = totalUnits;

    // Find Top Category
    const categories = Object.keys(categorySales);
    if (categories.length > 0) {
        const topCat = categories.reduce((a, b) =>
            categorySales[a] > categorySales[b] ? a : b
        );
        document.getElementById('report-top-cat').textContent = topCat.replace('_', ' ');
    } else {
        document.getElementById('report-top-cat').textContent = 'No Sales';
    }

    // 4. RENDER TOP SELLERS TABLE
    const topSellers = inventoryData
        .map(item => {
            const opening = item.opening !== undefined ? item.opening : item.stock;
            const sold = Math.max(0, opening - item.stock);
            return {
                name: `${item.name} ${item.size}`,
                sold: sold,
                revenue: sold * item.price,
                category: item.category
            };
        })
        .filter(item => item.sold > 0)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    const topSellersBody = document.getElementById('top-sellers-body');
    if (topSellers.length === 0) {
        topSellersBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No sales recorded this week.</td></tr>';
    } else {
        topSellersBody.innerHTML = topSellers.map(item => `
            <tr>
                <td>${item.name}</td>
                <td>${item.sold}</td>
                <td>GH¢ ${item.revenue.toFixed(2)}</td>
            </tr>
        `).join('');
    }

    // 5. RENDER LOW STOCK TABLE
    const lowStockBody = document.getElementById('low-stock-body');
    if (lowStockItems.length === 0) {
        lowStockBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">✅ All stock levels are healthy.</td></tr>';
    } else {
        lowStockBody.innerHTML = lowStockItems.map(item => `
            <tr>
                <td>${item.name} <small>(${item.size})</small></td>
                <td style="color:#dc3545; font-weight:bold;">${item.stock}</td>
                <td><button class="btn-sm btn-primary" onclick="window.location.href='inventory.html'">Restock</button></td>
            </tr>
        `).join('');
    }

    // 6. INITIALIZE CHARTS
    initCharts(categorySales, inventoryData);
});

// Show friendly empty state
function showEmptyState() {
    // Clear KPIs
    document.getElementById('report-revenue').textContent = 'GH¢ 0.00';
    document.getElementById('report-units').textContent = '0';
    document.getElementById('report-top-cat').textContent = '-';

    // Clear tables
    document.getElementById('top-sellers-body').innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No data available.</td></tr>';
    document.getElementById('low-stock-body').innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px;">No data available.</td></tr>';

    // Show message in charts area
    const chartsSection = document.querySelector('.card:has(#categoryChart)');
    if (chartsSection) {
        chartsSection.innerHTML = `
            <div style="text-align:center; padding:40px; color:#666;">
                <i class="fas fa-database" style="font-size:3rem; color:#ccc; margin-bottom:15px;"></i>
                <h3>No Inventory Data Found</h3>
                <p style="margin:10px 0;">Please add items via <strong>Inventory</strong> or run the setup script.</p>
                <button class="btn-primary" onclick="window.location.href='inventory.html'" style="margin-top:15px;">
                    <i class="fas fa-box-open"></i> Go to Inventory
                </button>
            </div>
        `;
    }

    // Hide second chart card if empty
    const stockChartCard = document.querySelector('.card:has(#stockChart)');
    if (stockChartCard) {
        stockChartCard.style.display = 'none';
    }

    console.log('ℹ️ No inventory data in localStorage. Add items via Inventory page.');
}

// Initialize Charts (with error handling)
function initCharts(catSales, allData) {
    // Destroy existing charts to prevent overlap
    if (window.myBarChart) {
        window.myBarChart.destroy();
        window.myBarChart = null;
    }
    if (window.myPieChart) {
        window.myPieChart.destroy();
        window.myPieChart = null;
    }

    // --- BAR CHART: Revenue by Category ---
    const ctx1 = document.getElementById('categoryChart');
    if (ctx1 && Object.keys(catSales).length > 0) {
        try {
            window.myBarChart = new Chart(ctx1.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: Object.keys(catSales).map(k => k.replace('_', ' ')),
                    datasets: [{
                        label: 'Revenue (GH¢)',
                        data: Object.values(catSales),
                        backgroundColor: '#C8A2D9',
                        borderColor: '#9B7EBD',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return 'GH¢ ' + context.parsed.y.toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) { return 'GH¢' + value; }
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Bar chart error:', e);
        }
    }

    // --- DOUGHNUT CHART: Stock Distribution by Category ---
    const catCounts = {};
    allData.forEach(item => {
        if (!catCounts[item.category]) catCounts[item.category] = 0;
        catCounts[item.category] += item.stock;
    });

    const ctx2 = document.getElementById('stockChart');
    if (ctx2 && Object.keys(catCounts).length > 0) {
        try {
            window.myPieChart = new Chart(ctx2.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: Object.keys(catCounts).map(k => k.replace('_', ' ')),
                    datasets: [{
                        data: Object.values(catCounts),
                        backgroundColor: ['#F4D06F', '#C8A2D9', '#9B7EBD', '#A8D8B9', '#FF9A8B']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 12, font: { size: 10 } }
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Pie chart error:', e);
        }
    }
}

// --- EXPORT FUNCTION ---
function exportFullReport() {
    const data = JSON.parse(localStorage.getItem('raha_inventory')) || [];

    if (data.length === 0) {
        alert('No data to export. Please add items to inventory first.');
        return;
    }

    const date = new Date().toISOString().slice(0,10);
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Item Name,Category,Size,Current Stock,Unit Price (GH¢),Estimated Sold,Revenue (GH¢)\n";

    data.forEach(item => {
        const opening = item.opening !== undefined ? item.opening : item.stock;
        const sold = Math.max(0, opening - item.stock);
        const revenue = sold * item.price;
        csvContent += `"${item.name}","${item.category}","${item.size}",${item.stock},${item.price},${sold},${revenue.toFixed(2)}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Raha_Weekly_Report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Optional: Show confirmation
    console.log('✅ Report exported successfully');
}