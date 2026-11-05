// Admin Dashboard - Excel-like User Management

let hot; // Handsontable instance
let usersData = [];
let recentChanges = [];
let activeView = 'users';
let activeDataset = null;
let datasetPage = 1;
let datasetTotalPages = 1;
let datasetSearchTimer;
let activeDatasetRequest;
let datasetOriginalRows = new Map();
let datasetPendingEdits = new Map();
let datasetAppliedSearch = '';
let datasetFields = [];
const API_BASE_URL = (window.PRO_FITNESS_API_BASE_URL || window.location.origin).replace(/\/+$/, "");

// Initialize the table when page loads
document.addEventListener('DOMContentLoaded', function() {
    loadRecentChanges();
    loadDatasetNavigation();
    document.getElementById('userManagementNav').addEventListener('click', showUserManagement);
    document.getElementById('datasetTableBody').addEventListener('input', handleDatasetCellEdit);
    document.getElementById('datasetTableBody').addEventListener('click', handleDatasetRowAction);
    document.getElementById('addDatasetRow').addEventListener('click', addDatasetRow);
    document.getElementById('addDatasetColumn').addEventListener('click', addDatasetColumn);
    document.getElementById('removeDatasetColumn').addEventListener('click', removeDatasetColumn);
    document.getElementById('previousDatasetPage').addEventListener('click', function() {
        if (datasetPage > 1 && confirmDiscardDatasetEdits()) loadDatasetPage(datasetPage - 1);
    });
    document.getElementById('nextDatasetPage').addEventListener('click', function() {
        if (datasetPage < datasetTotalPages && confirmDiscardDatasetEdits()) loadDatasetPage(datasetPage + 1);
    });
});

async function readDatasetApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        if (response.status === 404) {
            throw new Error('The admin data API is unavailable. Restart the running server with "npm start" to load the updated routes.');
        }
        throw new Error(`The server returned an unexpected response (HTTP ${response.status}).`);
    }
    return response.json();
}

async function loadDatasetNavigation() {
    const navigation = document.getElementById('datasetNavigation');
    try {
        const response = await window.proFitnessApiFetch(`${API_BASE_URL}/api/admin/datasets`);
        const result = await readDatasetApiResponse(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to load member collections.');
        }

        navigation.replaceChildren();
        result.collections.forEach(collection => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'admin-sidebar-item';
            button.dataset.collection = collection.name;
            button.innerHTML = `<i class="fas fa-table"></i>`;
            const label = document.createElement('span');
            label.className = 'admin-sidebar-label';
            label.textContent = collection.label;
            const count = document.createElement('span');
            count.className = 'admin-sidebar-count';
            count.textContent = collection.count.toLocaleString();
            button.append(label, count);
            button.addEventListener('click', function() {
                showDataset(collection.name, collection.label);
            });
            navigation.appendChild(button);
        });
        if (result.collections.length === 0) {
            activeDataset = null;
            document.getElementById('datasetView').hidden = true;
            document.getElementById('datasetActions').hidden = true;
            showStatus('No visible collections were found in the gym database.', 'info');
        } else if (!activeDataset || !result.collections.some(
            collection => collection.name === activeDataset.collection
        )) {
            const firstCollection = result.collections[0];
            showDataset(firstCollection.name, firstCollection.label);
        }
    } catch (error) {
        console.error('Error loading member collection navigation:', error);
        showStatus(error.message || 'Unable to load member collections.', 'error');
    }
}

function showUserManagement() {
    if (!confirmDiscardDatasetEdits()) return;
    if (activeDatasetRequest) {
        activeDatasetRequest.abort();
        activeDatasetRequest = null;
    }
    activeView = 'users';
    activeDataset = null;
    document.getElementById('userManagementNav').classList.add('active');
    document.querySelectorAll('#datasetNavigation .admin-sidebar-item').forEach(button => {
        button.classList.remove('active');
    });
    document.getElementById('excelTable').hidden = false;
    document.getElementById('datasetView').hidden = true;
    document.getElementById('datasetActions').hidden = true;
    document.getElementById('saveChangesButton').hidden = false;
    document.getElementById('saveChangesButton').innerHTML = '<i class="fas fa-save"></i> Save Changes';
    document.getElementById('saveChangesButton').disabled = false;
    document.getElementById('downloadExcelButton').hidden = false;
    document.getElementById('recentChangesButton').hidden = false;
    document.getElementById('recentChangesPanel').hidden = false;
    document.getElementById('searchInput').placeholder = 'Search users...';
    document.getElementById('searchInput').value = '';
    if (hot && hot.search) {
        hot.search.query('');
        hot.render();
    }
    document.getElementById('statusMessage').textContent = '';
    hideStatus();
}

function showDataset(collection, label) {
    if (!confirmDiscardDatasetEdits()) return;
    activeView = 'dataset';
    activeDataset = { collection, label };
    datasetPage = 1;
    document.getElementById('userManagementNav').classList.remove('active');
    document.querySelectorAll('#datasetNavigation .admin-sidebar-item').forEach(button => {
        button.classList.toggle('active', button.dataset.collection === collection);
    });
    document.getElementById('excelTable').hidden = true;
    document.getElementById('datasetView').hidden = false;
    document.getElementById('datasetActions').hidden = false;
    document.getElementById('saveChangesButton').hidden = false;
    document.getElementById('saveChangesButton').innerHTML = '<i class="fas fa-save"></i> Save Table Changes';
    document.getElementById('saveChangesButton').disabled = datasetPendingEdits.size === 0;
    document.getElementById('downloadExcelButton').hidden = false;
    document.getElementById('recentChangesButton').hidden = true;
    document.getElementById('recentChangesPanel').hidden = true;
    document.getElementById('searchInput').placeholder = `Search ${label}...`;
    document.getElementById('searchInput').value = '';
    datasetAppliedSearch = '';
    loadDatasetPage(1);
}

function confirmDiscardDatasetEdits() {
    if (datasetPendingEdits.size === 0) return true;
    if (!window.confirm('Discard unsaved table edits?')) return false;
    datasetPendingEdits.clear();
    document.getElementById('saveChangesButton').disabled = true;
    document.getElementById('saveChangesButton').title = '';
    return true;
}

function displayDatasetValue(value) {
    return value === null || value === undefined
        ? ''
        : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function updateDatasetColumnSelector(fields) {
    const selector = document.getElementById('deleteDatasetColumn');
    selector.replaceChildren();
    fields.forEach(field => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        selector.appendChild(option);
    });
    document.getElementById('removeDatasetColumn').disabled = fields.length === 0;
}

async function addDatasetRow() {
    if (!activeDataset || !confirmDiscardDatasetEdits()) return;
    if (datasetFields.length === 0) {
        showStatus('Cannot add a row because this collection has no fields.', 'error');
        return;
    }

    try {
        const response = await window.proFitnessApiFetch(
            `${API_BASE_URL}/api/admin/datasets/${encodeURIComponent(activeDataset.collection)}/records`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: Object.fromEntries(datasetFields.map(field => [field, ''])) })
            }
        );
        const result = await readDatasetApiResponse(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to add a row.');
        }

        datasetPendingEdits.clear();
        await loadDatasetNavigation();
        datasetPage = Math.max(1, Math.ceil(result.total / 50));
        await loadDatasetPage(datasetPage);
        showStatus('New row added to MongoDB.', 'success');
    } catch (error) {
        console.error('Error adding collection row:', error);
        showStatus(error.message || 'Unable to add a row.', 'error');
    }
}

async function handleDatasetRowAction(event) {
    const button = event.target.closest('[data-delete-record]');
    if (!button || !activeDataset) return;
    const recordId = button.dataset.deleteRecord;
    if (!confirmDiscardDatasetEdits()) return;
    if (!window.confirm('Delete this record from MongoDB? This cannot be undone.')) return;

    try {
        const response = await window.proFitnessApiFetch(
            `${API_BASE_URL}/api/admin/datasets/${encodeURIComponent(activeDataset.collection)}/records/${encodeURIComponent(recordId)}`,
            { method: 'DELETE' }
        );
        const result = await readDatasetApiResponse(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to delete this row.');
        }

        datasetPendingEdits.delete(recordId);
        datasetOriginalRows.delete(recordId);
        document.getElementById('searchInput').value = '';
        datasetAppliedSearch = '';
        await loadDatasetNavigation();
        await loadDatasetPage(Math.min(datasetPage, Math.max(1, Math.ceil(result.total / 50))));
        showStatus('Row deleted from MongoDB.', 'success');
    } catch (error) {
        console.error('Error deleting collection row:', error);
        showStatus(error.message || 'Unable to delete this row.', 'error');
    }
}

async function addDatasetColumn() {
    if (!activeDataset || !confirmDiscardDatasetEdits()) return;
    const field = window.prompt('Enter a name for the new column:');
    if (field === null) return;
    const name = field.trim();
    if (!name) {
        showStatus('Column name cannot be empty.', 'error');
        return;
    }
    if (!window.confirm(`Add "${name}" as a blank field to every record in ${activeDataset.label}?`)) return;
    await changeDatasetColumn('add', name);
}

async function removeDatasetColumn() {
    if (!activeDataset || !confirmDiscardDatasetEdits()) return;
    const field = document.getElementById('deleteDatasetColumn').value;
    if (!field) {
        showStatus('Select a column to delete.', 'error');
        return;
    }
    if (!window.confirm(`Permanently remove "${field}" from every record in ${activeDataset.label}? This cannot be undone.`)) return;
    await changeDatasetColumn('delete', field);
}

async function changeDatasetColumn(action, field) {
    try {
        const response = await window.proFitnessApiFetch(
            `${API_BASE_URL}/api/admin/datasets/${encodeURIComponent(activeDataset.collection)}/columns`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, field })
            }
        );
        const result = await readDatasetApiResponse(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to update the collection columns.');
        }

        datasetPendingEdits.clear();
        datasetOriginalRows.clear();
        document.getElementById('searchInput').value = '';
        datasetAppliedSearch = '';
        await loadDatasetNavigation();
        await loadDatasetPage(1);
        showStatus(
            action === 'add'
                ? `Added "${field}" to ${result.modified} record(s).`
                : `Removed "${field}" from ${result.modified} record(s).`,
            'success'
        );
    } catch (error) {
        console.error(`Error ${action}ing collection column:`, error);
        showStatus(error.message || 'Unable to update the collection columns.', 'error');
    }
}

function getDatasetEditCount() {
    return [...datasetPendingEdits.values()]
        .reduce((count, fields) => count + Object.keys(fields).length, 0);
}

function handleDatasetCellEdit(event) {
    const cell = event.target.closest('td[contenteditable="true"]');
    if (!cell) return;

    const { recordId, field } = cell.dataset;
    const originalRecord = datasetOriginalRows.get(recordId);
    if (!originalRecord || !Object.prototype.hasOwnProperty.call(originalRecord, field)) return;

    const value = cell.textContent;
    const originalValue = displayDatasetValue(originalRecord[field]);
    let edits = datasetPendingEdits.get(recordId);
    if (value === originalValue) {
        if (edits) {
            delete edits[field];
            if (Object.keys(edits).length === 0) datasetPendingEdits.delete(recordId);
        }
        cell.classList.remove('dataset-cell-edited');
    } else {
        if (!edits) {
            edits = {};
            datasetPendingEdits.set(recordId, edits);
        }
        edits[field] = value;
        cell.classList.add('dataset-cell-edited');
    }

    document.getElementById('saveChangesButton').disabled = datasetPendingEdits.size === 0;
    document.getElementById('saveChangesButton').title =
        `${getDatasetEditCount()} unsaved cell edit(s)`;
}

async function loadDatasetPage(page) {
    if (!activeDataset) return;

    if (activeDatasetRequest) {
        activeDatasetRequest.abort();
    }
    activeDatasetRequest = new AbortController();
    const request = activeDatasetRequest;
    const tableBody = document.getElementById('datasetTableBody');
    const search = document.getElementById('searchInput').value.trim();
    document.getElementById('datasetTitle').textContent = activeDataset.label;
    document.getElementById('datasetSummary').textContent = 'Loading records...';
    tableBody.replaceChildren();

    try {
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        const response = await window.proFitnessApiFetch(
            `${API_BASE_URL}/api/admin/datasets/${encodeURIComponent(activeDataset.collection)}?${params}`,
            { signal: request.signal }
        );
        const result = await readDatasetApiResponse(response);
        if (request !== activeDatasetRequest) return;
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to load this collection.');
        }

        datasetPage = result.page;
        datasetTotalPages = Math.max(result.totalPages, 1);
        datasetAppliedSearch = search;
        datasetFields = result.fields;
        updateDatasetColumnSelector(datasetFields);
        document.getElementById('datasetTitle').textContent = result.label;
        document.getElementById('datasetSummary').textContent =
            `${result.total.toLocaleString()} records · ${result.fields.length} columns · ${result.pageSize} per page`;
        document.getElementById('datasetPageStatus').textContent =
            `Page ${datasetPage} of ${datasetTotalPages}`;
        document.getElementById('previousDatasetPage').disabled = datasetPage <= 1;
        document.getElementById('nextDatasetPage').disabled = datasetPage >= datasetTotalPages;

        const tableHead = document.getElementById('datasetTableHead');
        tableHead.replaceChildren();
        datasetOriginalRows.clear();
        const headerRow = document.createElement('tr');
        const idHeader = document.createElement('th');
        idHeader.scope = 'col';
        idHeader.textContent = 'Record ID (read-only)';
        headerRow.appendChild(idHeader);
        result.fields.forEach(field => {
            const header = document.createElement('th');
            header.scope = 'col';
            header.textContent = field;
            headerRow.appendChild(header);
        });
        const actionHeader = document.createElement('th');
        actionHeader.scope = 'col';
        actionHeader.textContent = 'Actions';
        headerRow.appendChild(actionHeader);
        tableHead.appendChild(headerRow);

        if (result.rows.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = Math.max(result.fields.length + 2, 1);
            emptyCell.textContent = 'No records found.';
            emptyRow.appendChild(emptyCell);
            tableBody.appendChild(emptyRow);
            return;
        }

        result.rows.forEach(record => {
            datasetOriginalRows.set(record.id, record.values);
            const row = document.createElement('tr');
            const idCell = document.createElement('td');
            idCell.textContent = record.id;
            idCell.className = 'dataset-record-id';
            row.appendChild(idCell);
            result.fields.forEach(field => {
                const cell = document.createElement('td');
                cell.contentEditable = 'true';
                cell.spellcheck = false;
                cell.dataset.recordId = record.id;
                cell.dataset.field = field;
                const hasField = Object.prototype.hasOwnProperty.call(record.values, field);
                cell.contentEditable = String(hasField);
                if (!hasField) {
                    cell.classList.add('dataset-cell-readonly');
                }
                const pending = datasetPendingEdits.get(record.id);
                const value = pending && Object.prototype.hasOwnProperty.call(pending, field)
                    ? pending[field]
                    : displayDatasetValue(record.values[field]);
                cell.textContent = value;
                if (pending && Object.prototype.hasOwnProperty.call(pending, field)) {
                    cell.classList.add('dataset-cell-edited');
                }
                row.appendChild(cell);
            });
            const actionCell = document.createElement('td');
            actionCell.className = 'dataset-row-actions';
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'dataset-row-delete';
            deleteButton.dataset.deleteRecord = record.id;
            deleteButton.innerHTML = '<i class="fas fa-trash"></i> Delete';
            deleteButton.setAttribute('aria-label', 'Delete this row');
            actionCell.appendChild(deleteButton);
            row.appendChild(actionCell);
            tableBody.appendChild(row);
        });
        document.getElementById('saveChangesButton').disabled = datasetPendingEdits.size === 0;
        document.getElementById('saveChangesButton').title =
            `${getDatasetEditCount()} unsaved cell edit(s)`;
    } catch (error) {
        if (error.name === 'AbortError' || request !== activeDatasetRequest) return;
        console.error(`Error loading ${activeDataset.collection}:`, error);
        document.getElementById('datasetSummary').textContent =
            error.message || 'Unable to load this collection.';
        document.getElementById('datasetPageStatus').textContent = '';
        document.getElementById('previousDatasetPage').disabled = true;
        document.getElementById('nextDatasetPage').disabled = true;
    }
}

// Load users from database
async function loadUsersData() {
    try {
        showStatus('Loading users data...', 'info');
        const response = await window.proFitnessApiFetch(`${API_BASE_URL}/api/users`);
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
    if (activeView === 'dataset') {
        await saveDatasetChanges();
        return;
    }

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
        const response = await window.proFitnessApiFetch(`${API_BASE_URL}/api/users/bulk-update`, {
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

async function saveDatasetChanges() {
    if (!activeDataset || datasetPendingEdits.size === 0) {
        showStatus('There are no table changes to save.', 'info');
        return;
    }

    const button = document.getElementById('saveChangesButton');
    button.disabled = true;
    try {
        const updates = [...datasetPendingEdits.entries()].map(([id, fields]) => ({ id, fields }));
        const response = await window.proFitnessApiFetch(
            `${API_BASE_URL}/api/admin/datasets/${encodeURIComponent(activeDataset.collection)}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ updates })
            }
        );
        const result = await readDatasetApiResponse(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Unable to save table changes.');
        }

        datasetPendingEdits.clear();
        datasetOriginalRows.clear();
        showStatus(`Saved ${result.modified} edited record(s) to MongoDB.`, 'success');
        await loadDatasetPage(datasetPage);
    } catch (error) {
        console.error('Error saving member collection edits:', error);
        showStatus(error.message || 'Unable to save table changes.', 'error');
    } finally {
        button.disabled = datasetPendingEdits.size === 0;
        button.title = `${getDatasetEditCount()} unsaved cell edit(s)`;
    }
}

// Download as Excel
function downloadExcel() {
    if (activeView === 'dataset') {
        const table = document.getElementById('datasetTable');
        const workbook = XLSX.utils.table_to_book(table, { sheet: activeDataset.label.slice(0, 31) });
        XLSX.writeFile(workbook, `${activeDataset.collection.replace(/\s+/g, '_')}_page_${datasetPage}.xlsx`);
        return;
    }

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
async function refreshData() {
    if (activeView === 'dataset') {
        if (!confirmDiscardDatasetEdits()) return;
        await loadDatasetNavigation();
        if (activeDataset) await loadDatasetPage(datasetPage);
    } else {
        await loadDatasetNavigation();
        loadUsersData();
    }
}

// Search functionality
function handleSearch() {
    const searchTerm = document.getElementById('searchInput').value;
    if (activeView === 'dataset') {
        if (datasetPendingEdits.size > 0) {
            document.getElementById('searchInput').value = datasetAppliedSearch;
            showStatus('Save or discard your table edits before searching.', 'error');
            return;
        }
        clearTimeout(datasetSearchTimer);
        datasetSearchTimer = setTimeout(() => loadDatasetPage(1), 300);
        return;
    }
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
        await window.proFitnessApiFetch(`${API_BASE_URL}/api/users/${userId}`, {
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
