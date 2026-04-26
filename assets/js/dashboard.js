// assets/js/dashboard.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Set Date
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', dateOptions);

    // 2. Load Sample Data (From your Excel File)
    // In a real app, this would come from the Database API
    const inventoryData = [
        { name: "GIRLS BLUE P.E KIT", size: "SIZE 100", opening: 21, add: 0, sold: 0, price: 50 },
        { name: "GIRLS GREEN P.E KIT", size: "SIZE 100", opening: 7, add: 0, sold: 0, price: 50 },
        { name: "GIRLS YELLOW P.E KIT", size: "SIZE 140", opening: 9, add: 0, sold: 1, price: 50 },
        { name: "BOYS LILAC SHIRT UNIFORM", size: "SIZE 8-9 yrs", opening: 3, add: 0, sold: 1, price: 120 },
        { name: "BOYS CUSTOMISED SHORTS", size: "SIZE 8-9 yrs", opening: 3, add: 0, sold: 1, price: 145 },
        { name: "MAROON LACOSTE T-SHIRTS", size: "SIZE 16", opening: 21, add: 0, sold: 2, price: 60 },
        { name: "WHITE SOCKS", size: "SIZE MEDIUM", opening: 90, add: 0, sold: 1, price: 25 },
        // ... Add more items from your Excel sheet here
    ];

    // 3. Render Table
    const tableBody = document.getElementById('stock-table-body');
    let totalRevenue = 0;
    let totalSold = 0;
    let lowStockCount = 0;

    inventoryData.forEach((item, index) => {
        const total = item.opening + item.add;
        const closing = total - item.sold;
        const revenue = item.sold * item.price;

        // Update Stats
        totalRevenue += revenue;
        totalSold += item.sold;
        if (closing < 5) lowStockCount++;

        const row = `
            <tr>
                <td><strong>${item.name}</strong></td>
                <td>${item.size}</td>
                <td>${item.opening}</td>
                <td>${item.add}</td>
                <td class="col-total">${total}</td>
                <td>${item.sold}</td>
                <td>${item.price.toFixed(2)}</td>
                <td class="${closing < 5 ? 'text-danger' : ''}">${closing}</td>
                <td class="col-revenue">GH¢ ${revenue.toFixed(2)}</td>
                <td>
                    <button class="btn-primary btn-sm" onclick="openModal('${item.name}', ${item.price})">
                        <i class="fas fa-plus"></i> Action
                    </button>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });

    // 4. Update Stats Cards
    document.getElementById('total-revenue').textContent = `GH¢ ${totalRevenue.toFixed(2)}`;
    document.getElementById('items-sold').textContent = totalSold;
    document.getElementById('low-stock-count').textContent = lowStockCount;

    // 5. Modal Logic
    const modal = document.getElementById('action-modal');
    const closeBtn = document.querySelector('.close-modal');

    window.openModal = function(itemName, price) {
        document.getElementById('modal-item-name').value = itemName;
        modal.classList.remove('hidden');
    };

    closeBtn.onclick = () => modal.classList.add('hidden');
    window.onclick = (event) => {
        if (event.target == modal) modal.classList.add('hidden');
    };

    // 6. Week Close Logic (Simulation)
    document.getElementById('btn-close-week').addEventListener('click', () => {
        if(confirm("Are you sure you want to CLOSE Week 11? This will lock all sales data.")) {
            document.getElementById('week-status').textContent = "CLOSED";
            document.getElementById('week-status').style.color = "#dc3545";
            alert("Week 11 Closed Successfully! Report generated.");
        }
    });
});