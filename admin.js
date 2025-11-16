// Admin Dashboard - Excel-like User Management

let hot; // Handsontable instance
let usersData = [];
let recentChanges = [];
const API_BASE_URL = window.location.origin;

// Initialize the table when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadUsersData();
    loadRecentChanges();
});

// Load users from database
async function loadUsersData() {
    try {
        showStatus('Loading users data...', 'info');
        const response = await fetch(`${API_BASE_URL}/api/users`);
        const data = await response.json();
        
        if (data.success) {
            usersData = data.users;
            initializeTable();
            showStatus('Users loaded successfully!', 'success');
            setTimeout(() => hideStatus(), 3000);
        } else {
            showStatus('Error loading users: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showStatus('Error loading users. Please check your connection.', 'error');
        // Initialize empty table if API fails
        initializeTable();
    }
}

// Initialize Handsontable
function initializeTable() {
    const container = document.getElementById('excelTable');
    
    // Prepare data for Handsontable
    const tableData = usersData.length > 0 
        ? usersData.map(user => [
            user._id || '',
            user.name || '',
            user.email || '',
            user.phone || '',
            user.gender || '',
            user.age || '',
            user.fitnessGoal || '',
            user.membershipType || '',
            user.membershipStatus || 'Active',
            user.joinDate ? new Date(user.joinDate).toLocaleDateString() : new Date().toLocaleDateString(),
            user.address || '',
            user.notes || ''
        ])
        : [];

    // Column headers
    const columns = [
        { data: 0, title: 'ID', readOnly: true, width: 100 },
        { data: 1, title: 'Name', width: 150 },
        { data: 2, title: 'Email', width: 200 },
        { data: 3, title: 'Phone', width: 120 },
        { data: 4, title: 'Gender', width: 100 },
        { data: 5, title: 'Age', type: 'numeric', width: 80 },
        { data: 6, title: 'Fitness Goal', width: 150 },
        { data: 7, title: 'Membership Type', width: 150 },
        { data: 8, title: 'Status', width: 120 },
        { data: 9, title: 'Join Date', width: 120 },
        { data: 10, title: 'Address', width: 200 },
        { data: 11, title: 'Notes', width: 200 }
    ];

    // Destroy existing instance if any
    if (hot) {
        hot.destroy();
    }

    // Create new Handsontable instance
    hot = new Handsontable(container, {
        data: tableData,
        columns: columns,
        rowHeaders: true,
        colHeaders: true,
        width: '100%',
        height: 600,
        licenseKey: 'non-commercial-and-evaluation',
        contextMenu: ['row_above', 'row_below', 'remove_row', 'copy', 'cut'],
        manualColumnResize: true,
        manualRowResize: true,
        filters: true,
        dropdownMenu: true,
        copyPaste: {
            pasteMode: 'shift_down',
            rowsLimit: 1000,
            columnsLimit: 1000
        },
        search: true,
        afterChange: function(changes, source) {
            if (source !== 'loadData' && source !== 'CopyPaste.paste') {
                trackChange(changes);
            } else if (source === 'CopyPaste.paste') {
                // Track all paste changes
                if (changes) {
                    trackChange(changes);
                }
            }
        },
        afterCreateRow: function(index, amount) {
            // Track new row creation
            const change = {
                type: 'create_row',
                row: index,
                timestamp: new Date().toLocaleString()
            };
            recentChanges.unshift(change);
            if (recentChanges.length > 50) {
                recentChanges.pop();
            }
            saveRecentChanges();
            updateRecentChangesDisplay();
        },
        afterRemoveRow: function(index, amount) {
            // Track row deletion
            const deletedRows = [];
            for (let i = index; i < index + amount; i++) {
                if (usersData[i] && usersData[i]._id) {
                    deletedRows.push(usersData[i]._id);
                    // Also delete from database
                    deleteUserFromDB(usersData[i]._id);
                }
            }
            if (deletedRows.length > 0) {
                trackRowDeletion(deletedRows);
            }
            // Update usersData array
            usersData.splice(index, amount);
        }
    });
}

// Track changes made to the table
function trackChange(changes) {
    if (!changes) return;
    
    changes.forEach(([row, col, oldValue, newValue]) => {
        if (oldValue !== newValue) {
            const columnNames = ['ID', 'Name', 'Email', 'Phone', 'Gender', 'Age', 'Fitness Goal', 
                                'Membership Type', 'Status', 'Join Date', 'Address', 'Notes'];
            const change = {
                type: 'edit',
                row: row,
                column: columnNames[col],
                oldValue: oldValue,
                newValue: newValue,
                timestamp: new Date().toLocaleString(),
                userId: usersData[row] ? usersData[row]._id : 'new'
            };
            recentChanges.unshift(change);
            if (recentChanges.length > 50) {
                recentChanges.pop();
            }
            saveRecentChanges();
            updateRecentChangesDisplay();
        }
    });
}

// Track row deletion
function trackRowDeletion(userIds) {
    userIds.forEach(userId => {
        const change = {
            type: 'delete',
            userId: userId,
            timestamp: new Date().toLocaleString()
        };
        recentChanges.unshift(change);
    });
    saveRecentChanges();
    updateRecentChangesDisplay();
}

// Save changes to MongoDB
async function saveChanges() {
    try {
        showStatus('Saving changes...', 'info');
        const tableData = hot.getData();
        const updatedUsers = [];
        const newUsers = [];

        tableData.forEach((row, index) => {
            // Skip completely empty rows
            if (!row[1] && !row[2] && !row[3] && !row[0]) {
                return;
            }

            const userData = {
                name: row[1] || '',
                email: row[2] || '',
                phone: row[3] || '',
                gender: row[4] || '',
                age: row[5] ? parseInt(row[5]) : null,
                fitnessGoal: row[6] || '',
                membershipType: row[7] || '',
                membershipStatus: row[8] || 'Active',
                joinDate: row[9] || new Date(),
                address: row[10] || '',
                notes: row[11] || ''
            };

            if (row[0]) {
                // Existing user - update
                userData._id = row[0];
                updatedUsers.push(userData);
            } else if (row[1] || row[2] || row[3]) {
                // New user - create
                newUsers.push(userData);
            }
        });

        // Send updates to backend
        const response = await fetch(`${API_BASE_URL}/api/users/bulk-update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                updates: updatedUsers,
                creates: newUsers
            })
        });

        const result = await response.json();
        
        if (result.success) {
            showStatus(`Successfully saved! Updated: ${result.updated}, Created: ${result.created}`, 'success');
            // Reload data to get IDs for new users
            setTimeout(() => {
                loadUsersData();
            }, 1000);
        } else {
            showStatus('Error saving: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Error saving changes:', error);
        showStatus('Error saving changes. Please try again.', 'error');
    }
}

// Download as Excel
function downloadExcel() {
    const data = hot.getData();
    const headers = ['ID', 'Name', 'Email', 'Phone', 'Gender', 'Age', 'Fitness Goal', 
                     'Membership Type', 'Status', 'Join Date', 'Address', 'Notes'];
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    
    // Download
    const fileName = `users_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    showStatus('Excel file downloaded successfully!', 'success');
    setTimeout(() => hideStatus(), 3000);
}

// Refresh data from database
function refreshData() {
    loadUsersData();
}

// Search functionality
function handleSearch() {
    const searchTerm = document.getElementById('searchInput').value;
    if (!hot) return;

    if (searchTerm) {
        hot.search.query(searchTerm);
    } else {
        hot.search.query('');
    }
    hot.render();
}

// Delete user from database
async function deleteUserFromDB(userId) {
    try {
        await fetch(`${API_BASE_URL}/api/users/${userId}`, {
            method: 'DELETE'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
    }
}

// Toggle recent changes panel
function toggleRecentChanges() {
    const panel = document.getElementById('recentChangesPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') {
        updateRecentChangesDisplay();
    }
}

// Update recent changes display
function updateRecentChangesDisplay() {
    const list = document.getElementById('recentChangesList');
    if (recentChanges.length === 0) {
        list.innerHTML = '<p style="color: #666; text-align: center;">No recent changes</p>';
        return;
    }

    list.innerHTML = recentChanges.slice(0, 20).map(change => {
        if (change.type === 'delete') {
            return `
                <div class="change-item">
                    <strong>Deleted User:</strong> ${change.userId}
                    <div class="change-time">${change.timestamp}</div>
                </div>
            `;
        } else if (change.type === 'create_row') {
            return `
                <div class="change-item">
                    <strong>Created New Row:</strong> Row ${change.row + 1}
                    <div class="change-time">${change.timestamp}</div>
                </div>
            `;
        } else {
            return `
                <div class="change-item">
                    <strong>Row ${change.row + 1}, ${change.column}:</strong> 
                    "${change.oldValue || '(empty)'}" → "${change.newValue || '(empty)'}"
                    <div class="change-time">${change.timestamp}</div>
                </div>
            `;
        }
    }).join('');
}

// Save recent changes to localStorage
function saveRecentChanges() {
    localStorage.setItem('adminRecentChanges', JSON.stringify(recentChanges));
}

// Load recent changes from localStorage
function loadRecentChanges() {
    const saved = localStorage.getItem('adminRecentChanges');
    if (saved) {
        recentChanges = JSON.parse(saved);
    }
}

// Clear recent changes
function clearRecentChanges() {
    recentChanges = [];
    saveRecentChanges();
    updateRecentChangesDisplay();
    showStatus('Recent changes cleared', 'info');
    setTimeout(() => hideStatus(), 2000);
}

// Show status message
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
}

// Hide status message
function hideStatus() {
    const statusEl = document.getElementById('statusMessage');
    statusEl.className = 'status-message';
}

