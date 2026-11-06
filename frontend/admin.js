const DRIVE_API = "https://www.googleapis.com/drive/v3";
const SHEETS_API = "https://sheets.googleapis.com/v4";
const USER_INFO_API = "https://openidconnect.googleapis.com/v1/userinfo";
const ROWS_PER_PAGE = 50;
const COLUMNS_PER_PAGE = 16;

const state = {
  adminEmail: null,
  accessToken: null,
  spreadsheets: [],
  nextPageToken: null,
  activeSpreadsheet: null,
  activeSheet: null,
  sheets: [],
  rowCount: 0,
  columnCount: 0,
  rowPage: 0,
  columnPage: 0,
  gridValues: [],
  pendingEdits: new Map(),
  gridRequest: 0,
  spreadsheetRequest: 0,
  isSaving: false,
  statusTimer: null
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeAdminWorkspace);

async function initializeAdminWorkspace() {
  [
    "adminInfoDisplay",
    "googleAccount",
    "refreshSheetsButton",
    "createSpreadsheetButton",
    "spreadsheetSearch",
    "spreadsheetListStatus",
    "spreadsheetList",
    "loadMoreSheetsButton",
    "sheetsWelcome",
    "spreadsheetWorkspace",
    "activeSpreadsheetTitle",
    "activeSheetRange",
    "sheetTabs",
    "addSheetButton",
    "renameSheetButton",
    "deleteSheetButton",
    "rowPageStatus",
    "columnPageStatus",
    "previousRowsButton",
    "nextRowsButton",
    "previousColumnsButton",
    "nextColumnsButton",
    "addRowsButton",
    "addColumnsButton",
    "sheetGridStatus",
    "sheetGridContainer",
    "saveSheetButton",
    "reloadSheetButton",
    "adminStatus",
    "logoutButton"
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });

  elements.refreshSheetsButton.addEventListener("click", () => loadSpreadsheets(true));
  elements.createSpreadsheetButton.addEventListener("click", createSpreadsheet);
  elements.loadMoreSheetsButton.addEventListener("click", () => loadSpreadsheets(false));
  elements.spreadsheetSearch.addEventListener("input", renderSpreadsheetList);
  elements.sheetTabs.addEventListener("click", handleSheetTabClick);
  elements.addSheetButton.addEventListener("click", addSheet);
  elements.renameSheetButton.addEventListener("click", renameActiveSheet);
  elements.deleteSheetButton.addEventListener("click", deleteActiveSheet);
  elements.sheetGridContainer.addEventListener("input", handleCellEdit);
  elements.saveSheetButton.addEventListener("click", saveSheetChanges);
  elements.reloadSheetButton.addEventListener("click", reloadActiveSheet);
  elements.previousRowsButton.addEventListener("click", () => changePage("row", -1));
  elements.nextRowsButton.addEventListener("click", () => changePage("row", 1));
  elements.previousColumnsButton.addEventListener("click", () => changePage("column", -1));
  elements.nextColumnsButton.addEventListener("click", () => changePage("column", 1));
  elements.addRowsButton.addEventListener("click", () => appendGrid("ROWS", 50));
  elements.addColumnsButton.addEventListener("click", () => appendGrid("COLUMNS", 10));
  elements.logoutButton.addEventListener("click", logout);

  try {
    const response = await window.proFitnessApiFetch("/api/admin/session");
    const result = await readJsonResponse(response);
    if (!response.ok || !result.success) {
      window.location.replace("/signin-admin.html");
      return;
    }

    state.adminEmail = typeof result.email === "string" ? result.email.toLowerCase() : null;
    elements.adminInfoDisplay.textContent = state.adminEmail || "Phone-based admin";
    if (!state.adminEmail || !result.canAccessGoogleSheets) {
      elements.googleAccount.textContent = "Sign in with Google to load spreadsheets automatically.";
      elements.spreadsheetListStatus.textContent = "Email OTP and phone sign-ins do not provide Google Sheets access.";
      return;
    }

    await loadSignedInGoogleAccount();
  } catch (error) {
    console.error("Unable to verify the admin session:", error);
    showStatus(error.message || "Unable to verify the admin session.", "error");
  }
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}).`);
  }
  return response.json();
}

async function handleGoogleAuthorization(response) {
  if (response.error || !response.access_token) {
    showStatus(response.error_description || response.error || "Google authorization failed.", "error");
    return;
  }

  try {
    const userResponse = await fetch(USER_INFO_API, {
      headers: { Authorization: `Bearer ${response.access_token}` }
    });
    const user = await readGoogleJsonResponse(userResponse);
    const googleEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

    if (!userResponse.ok || user.email_verified !== true || googleEmail !== state.adminEmail) {
      state.accessToken = null;
      setSpreadsheetListStatus("");
      throw new Error(
        `Connect the Google account that matches your admin sign-in (${state.adminEmail}).`
      );
    }

    state.accessToken = response.access_token;
    elements.googleAccount.textContent = `Connected as ${googleEmail}`;
    elements.refreshSheetsButton.hidden = false;
    elements.createSpreadsheetButton.hidden = false;
    elements.spreadsheetSearch.hidden = false;
    elements.sheetsWelcome.hidden = false;
    await loadSpreadsheets(true);
  } catch (error) {
    console.error("Google Sheets account verification failed:", error);
    showStatus(error.message || "Unable to verify the Google account.", "error");
  }
}

async function loadSignedInGoogleAccount() {
  const accessToken = sessionStorage.getItem("adminGoogleAccessToken");
  if (!accessToken) {
    elements.googleAccount.textContent = "Sign in with Google to load spreadsheets automatically.";
    elements.spreadsheetListStatus.textContent = "This admin session did not grant Google Sheets access.";
    return;
  }

  try {
    const userResponse = await fetch(USER_INFO_API, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const user = await readGoogleJsonResponse(userResponse);
    const googleEmail = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";

    if (!userResponse.ok || user.email_verified !== true || googleEmail !== state.adminEmail) {
      sessionStorage.removeItem("adminGoogleAccessToken");
      elements.googleAccount.textContent = "Sign in with Google to load spreadsheets automatically.";
      elements.spreadsheetListStatus.textContent = "Google Sheets access has expired. Sign in with Google again.";
      return;
    }

    state.accessToken = accessToken;
    elements.googleAccount.textContent = `Google account: ${googleEmail}`;
    elements.refreshSheetsButton.hidden = false;
    elements.createSpreadsheetButton.hidden = false;
    elements.spreadsheetSearch.hidden = false;
    await loadSpreadsheets(true);
  } catch (error) {
    console.error("Unable to restore Google Sheets access:", error);
    sessionStorage.removeItem("adminGoogleAccessToken");
    elements.googleAccount.textContent = "Sign in with Google to load spreadsheets automatically.";
    elements.spreadsheetListStatus.textContent = error.message || "Unable to restore Google Sheets access.";
  }
}

async function readGoogleJsonResponse(response) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Google returned an unexpected response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message = result.error?.message || result.error_description || `Google request failed (HTTP ${response.status}).`;
    if (response.status === 401) {
      clearGoogleSession();
    }
    throw new Error(message);
  }
  return result;
}

async function googleApiFetch(url, options = {}) {
  if (!state.accessToken) {
    throw new Error("Sign in with Google again to continue.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers
    }
  });
  return readGoogleJsonResponse(response);
}

async function loadSpreadsheets(reset) {
  if (!state.accessToken) return;
  if (reset) {
    state.spreadsheets = [];
    state.nextPageToken = null;
    elements.spreadsheetList.replaceChildren();
    setSpreadsheetListStatus("Loading spreadsheets...");
  }
  elements.refreshSheetsButton.disabled = true;
  elements.loadMoreSheetsButton.disabled = true;

  try {
    const params = new URLSearchParams({
      q: "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });
    if (state.nextPageToken) params.set("pageToken", state.nextPageToken);

    const result = await googleApiFetch(`${DRIVE_API}/files?${params.toString()}`);
    const newFiles = Array.isArray(result.files) ? result.files : [];
    state.spreadsheets.push(...newFiles);
    state.nextPageToken = result.nextPageToken || null;
    renderSpreadsheetList();
    elements.refreshSheetsButton.hidden = false;
    elements.spreadsheetSearch.hidden = false;

    if (state.spreadsheets.length === 0) {
      setSpreadsheetListStatus("No Google spreadsheets were found for this account.");
    } else {
      setSpreadsheetListStatus(
        state.nextPageToken
          ? `${state.spreadsheets.length} spreadsheets loaded.`
          : `${state.spreadsheets.length} spreadsheets available.`
      );
    }

    if (state.activeSpreadsheet && reset) {
      const currentFile = state.spreadsheets.find((file) => file.id === state.activeSpreadsheet.id);
      if (currentFile) {
        state.activeSpreadsheet = currentFile;
        renderSpreadsheetList();
      }
    } else if (reset && state.spreadsheets.length > 0) {
      await openSpreadsheet(state.spreadsheets[0]);
    }
  } catch (error) {
    console.error("Unable to load Google spreadsheets:", error);
    setSpreadsheetListStatus(error.message || "Unable to load spreadsheets.");
    showStatus(error.message || "Unable to load spreadsheets.", "error");
  } finally {
    elements.refreshSheetsButton.disabled = false;
    elements.loadMoreSheetsButton.disabled = false;
  }
}

async function createSpreadsheet() {
  if (!confirmDiscardChanges()) return;
  const defaultTitle = `Untitled spreadsheet ${new Date().toLocaleDateString()}`;
  const title = window.prompt("Name the new spreadsheet:", defaultTitle);
  if (title === null) return;
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle.length > 100) {
    showStatus("Spreadsheet names must contain between 1 and 100 characters.", "error");
    return;
  }

  elements.createSpreadsheetButton.disabled = true;
  try {
    const result = await googleApiFetch(`${SHEETS_API}/spreadsheets`, {
      method: "POST",
      body: JSON.stringify({
        properties: { title: trimmedTitle },
        sheets: [{
          properties: {
            title: "Sheet1",
            gridProperties: { rowCount: 1000, columnCount: 26 }
          }
        }]
      })
    });
    const file = {
      id: result.spreadsheetId,
      name: result.properties?.title || trimmedTitle,
      mimeType: "application/vnd.google-apps.spreadsheet"
    };
    state.spreadsheets = [file, ...state.spreadsheets.filter((item) => item.id !== file.id)];
    renderSpreadsheetList();
    await openSpreadsheet(file);
    showStatus("Spreadsheet created.", "success");
  } catch (error) {
    console.error("Unable to create Google spreadsheet:", error);
    showStatus(error.message || "Unable to create spreadsheet.", "error");
  } finally {
    elements.createSpreadsheetButton.disabled = false;
  }
}

function renderSpreadsheetList() {
  const filter = elements.spreadsheetSearch.value.trim().toLowerCase();
  const files = state.spreadsheets.filter((file) => file.name.toLowerCase().includes(filter));
  elements.spreadsheetList.replaceChildren();

  files.forEach((file) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "spreadsheet-list-item";
    button.classList.toggle("active", state.activeSpreadsheet?.id === file.id);
    button.setAttribute("role", "listitem");
    button.title = file.name;
    button.addEventListener("click", () => openSpreadsheet(file));

    const icon = document.createElement("i");
    icon.className = "fas fa-table";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = file.name;
    button.append(icon, label);
    elements.spreadsheetList.appendChild(button);
  });

  elements.loadMoreSheetsButton.hidden = !state.nextPageToken || Boolean(filter);
  if (filter && files.length === 0 && state.spreadsheets.length > 0) {
    setSpreadsheetListStatus("No loaded spreadsheet names match that filter.");
  }
}

function setSpreadsheetListStatus(message) {
  elements.spreadsheetListStatus.textContent = message;
}

async function openSpreadsheet(file) {
  if (!confirmDiscardChanges()) return;
  const requestId = ++state.spreadsheetRequest;
  state.activeSpreadsheet = file;
  state.activeSheet = null;
  state.pendingEdits.clear();
  state.sheets = [];
  state.rowPage = 0;
  state.columnPage = 0;
  elements.sheetsWelcome.hidden = true;
  elements.spreadsheetWorkspace.hidden = false;
  elements.activeSpreadsheetTitle.textContent = file.name;
  elements.sheetTabs.replaceChildren();
  elements.sheetGridContainer.replaceChildren();
  elements.sheetGridStatus.textContent = "Loading spreadsheet...";
  updateSaveButton();
  renderSpreadsheetList();

  try {
    const fields = "spreadsheetId,properties(title),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))";
    const params = new URLSearchParams({ fields });
    const result = await googleApiFetch(
      `${SHEETS_API}/spreadsheets/${encodeURIComponent(file.id)}?${params.toString()}`
    );
    if (requestId !== state.spreadsheetRequest) return;
    state.activeSpreadsheet.name = result.properties?.title || file.name;
    elements.activeSpreadsheetTitle.textContent = state.activeSpreadsheet.name;
    state.sheets = (result.sheets || [])
      .map((sheet) => sheet.properties)
      .filter((sheet) => sheet && typeof sheet.title === "string")
      .sort((left, right) => (left.index || 0) - (right.index || 0));

    if (state.sheets.length === 0) {
      elements.sheetGridStatus.textContent = "This spreadsheet does not contain any visible sheets.";
      return;
    }

    renderSheetTabs();
    await selectSheet(state.sheets[0].sheetId);
  } catch (error) {
    if (requestId !== state.spreadsheetRequest) return;
    console.error("Unable to open Google spreadsheet:", error);
    elements.sheetGridStatus.textContent = error.message || "Unable to open spreadsheet.";
    showStatus(error.message || "Unable to open spreadsheet.", "error");
  }
}

function renderSheetTabs() {
  elements.sheetTabs.replaceChildren();
  elements.renameSheetButton.disabled = !state.activeSheet;
  elements.deleteSheetButton.disabled = !state.activeSheet || state.sheets.length <= 1;
  elements.addSheetButton.disabled = !state.activeSpreadsheet;
  state.sheets.forEach((sheet) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-tab";
    button.dataset.sheetId = String(sheet.sheetId);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(state.activeSheet?.sheetId === sheet.sheetId));
    button.classList.toggle("active", state.activeSheet?.sheetId === sheet.sheetId);
    button.textContent = sheet.title;
    elements.sheetTabs.appendChild(button);
  });
}

async function handleSheetTabClick(event) {
  const button = event.target.closest("[data-sheet-id]");
  if (!button || !confirmDiscardChanges()) return;
  await selectSheet(Number(button.dataset.sheetId));
}

async function addSheet() {
  if (!state.activeSpreadsheet || !confirmDiscardChanges()) return;
  const defaultTitle = `Sheet${state.sheets.length + 1}`;
  const title = window.prompt("Name the new sheet:", defaultTitle);
  if (title === null) return;
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle.length > 100) {
    showStatus("Sheet names must contain between 1 and 100 characters.", "error");
    return;
  }
  if (state.sheets.some((sheet) => sheet.title.toLowerCase() === trimmedTitle.toLowerCase())) {
    showStatus("A sheet with that name already exists.", "error");
    return;
  }

  try {
    const result = await updateSpreadsheet([{ addSheet: { properties: {
      title: trimmedTitle,
      gridProperties: { rowCount: 1000, columnCount: 26 }
    } } }]);
    const added = result.replies?.[0]?.addSheet?.properties;
    if (!added || !Number.isInteger(added.sheetId)) {
      throw new Error("Google did not return the new sheet details.");
    }
    state.sheets.push(added);
    renderSheetTabs();
    await selectSheet(added.sheetId);
    showStatus(`Sheet "${trimmedTitle}" created.`, "success");
  } catch (error) {
    console.error("Unable to create sheet:", error);
    showStatus(error.message || "Unable to create sheet.", "error");
  }
}

async function renameActiveSheet() {
  if (!state.activeSheet || !confirmDiscardChanges()) return;
  const title = window.prompt("Rename sheet:", state.activeSheet.title);
  if (title === null) return;
  const trimmedTitle = title.trim();
  if (!trimmedTitle || trimmedTitle.length > 100) {
    showStatus("Sheet names must contain between 1 and 100 characters.", "error");
    return;
  }
  if (state.sheets.some((sheet) =>
    sheet.sheetId !== state.activeSheet.sheetId &&
    sheet.title.toLowerCase() === trimmedTitle.toLowerCase()
  )) {
    showStatus("A sheet with that name already exists.", "error");
    return;
  }
  if (trimmedTitle === state.activeSheet.title) return;

  try {
    await updateSpreadsheet([{
      updateSheetProperties: {
        properties: { sheetId: state.activeSheet.sheetId, title: trimmedTitle },
        fields: "title"
      }
    }]);
    state.activeSheet.title = trimmedTitle;
    renderSheetTabs();
    await loadGrid();
    showStatus(`Sheet renamed to "${trimmedTitle}".`, "success");
  } catch (error) {
    console.error("Unable to rename sheet:", error);
    showStatus(error.message || "Unable to rename sheet.", "error");
  }
}

async function deleteActiveSheet() {
  if (!state.activeSpreadsheet || !state.activeSheet || !confirmDiscardChanges()) return;
  if (state.sheets.length <= 1) {
    showStatus("A spreadsheet must contain at least one sheet.", "error");
    return;
  }
  const sheetToDelete = state.activeSheet;
  if (!window.confirm(`Permanently delete the sheet "${sheetToDelete.title}"?`)) return;
  const sheetIndex = state.sheets.findIndex((sheet) => sheet.sheetId === sheetToDelete.sheetId);

  try {
    await updateSpreadsheet([{ deleteSheet: { sheetId: sheetToDelete.sheetId } }]);
    state.sheets = state.sheets.filter((sheet) => sheet.sheetId !== sheetToDelete.sheetId);
    renderSheetTabs();
    const nextSheet = state.sheets[Math.max(0, sheetIndex - 1)];
    await selectSheet(nextSheet.sheetId);
    showStatus(`Sheet "${sheetToDelete.title}" deleted.`, "success");
  } catch (error) {
    console.error("Unable to delete sheet:", error);
    showStatus(error.message || "Unable to delete sheet.", "error");
  }
}

async function appendGrid(dimension, length) {
  if (!state.activeSheet || !confirmDiscardChanges()) return;
  try {
    await updateSpreadsheet([{
      appendDimension: {
        sheetId: state.activeSheet.sheetId,
        dimension,
        length
      }
    }]);
    if (dimension === "ROWS") {
      state.rowCount += length;
      state.activeSheet.gridProperties.rowCount = state.rowCount;
    } else {
      state.columnCount += length;
      state.activeSheet.gridProperties.columnCount = state.columnCount;
    }
    await loadGrid();
    showStatus(`${length} ${dimension.toLowerCase()} added.`, "success");
  } catch (error) {
    console.error(`Unable to add ${dimension.toLowerCase()}:`, error);
    showStatus(error.message || `Unable to add ${dimension.toLowerCase()}.`, "error");
  }
}

async function updateSpreadsheet(requests) {
  if (!state.activeSpreadsheet) {
    throw new Error("Open a spreadsheet first.");
  }
  return googleApiFetch(
    `${SHEETS_API}/spreadsheets/${encodeURIComponent(state.activeSpreadsheet.id)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests })
    }
  );
}

async function selectSheet(sheetId) {
  const sheet = state.sheets.find((item) => item.sheetId === sheetId);
  if (!sheet) return;

  state.activeSheet = sheet;
  state.pendingEdits.clear();
  state.rowPage = 0;
  state.columnPage = 0;
  state.rowCount = Math.max(1, Number(sheet.gridProperties?.rowCount) || ROWS_PER_PAGE);
  state.columnCount = Math.max(1, Number(sheet.gridProperties?.columnCount) || COLUMNS_PER_PAGE);
  renderSheetTabs();
  updateSaveButton();
  await loadGrid();
}

async function loadGrid() {
  if (!state.activeSpreadsheet || !state.activeSheet) return;
  const requestId = ++state.gridRequest;
  const rowStart = state.rowPage * ROWS_PER_PAGE + 1;
  const rowEnd = Math.min(rowStart + ROWS_PER_PAGE - 1, state.rowCount);
  const columnStart = state.columnPage * COLUMNS_PER_PAGE;
  const columnEnd = Math.min(columnStart + COLUMNS_PER_PAGE - 1, state.columnCount - 1);
  const range = `${quoteSheetTitle(state.activeSheet.title)}!${columnToA1(columnStart)}${rowStart}:${columnToA1(columnEnd)}${rowEnd}`;
  elements.sheetGridStatus.textContent = "Loading cells...";
  elements.sheetGridContainer.replaceChildren();

  try {
    const params = new URLSearchParams({ range, valueRenderOption: "FORMATTED_VALUE" });
    const result = await googleApiFetch(
      `${SHEETS_API}/spreadsheets/${encodeURIComponent(state.activeSpreadsheet.id)}/values/${encodeURIComponent(range)}?${params.toString()}`
    );
    if (requestId !== state.gridRequest) return;

    const values = Array.isArray(result.values) ? result.values : [];
    const visibleRowCount = rowEnd - rowStart + 1;
    const visibleColumnCount = columnEnd - columnStart + 1;
    state.gridValues = Array.from({ length: visibleRowCount }, (_, row) =>
      Array.from({ length: visibleColumnCount }, (_, column) => {
        const value = values[row]?.[column];
        return value === undefined || value === null ? "" : String(value);
      })
    );

    renderGrid(rowStart, columnStart, visibleRowCount, visibleColumnCount);
    elements.activeSheetRange.textContent =
      `Rows ${rowStart}–${rowEnd} · Columns ${columnToA1(columnStart)}–${columnToA1(columnEnd)}`;
    elements.rowPageStatus.textContent = `${rowStart}–${rowEnd} of ${state.rowCount}`;
    elements.columnPageStatus.textContent =
      `${columnToA1(columnStart)}–${columnToA1(columnEnd)} of ${columnToA1(state.columnCount - 1)}`;
    elements.previousRowsButton.disabled = state.rowPage === 0;
    elements.nextRowsButton.disabled = rowEnd >= state.rowCount;
    elements.previousColumnsButton.disabled = state.columnPage === 0;
    elements.nextColumnsButton.disabled = columnEnd >= state.columnCount - 1;
    elements.sheetGridStatus.textContent = "Edit cells, then choose Save changes. Unsaved cells are highlighted.";
  } catch (error) {
    if (requestId !== state.gridRequest) return;
    console.error("Unable to load spreadsheet cells:", error);
    elements.sheetGridStatus.textContent = error.message || "Unable to load spreadsheet cells.";
    showStatus(error.message || "Unable to load spreadsheet cells.", "error");
  }
}

function renderGrid(rowStart, columnStart, rowCount, columnCount) {
  const table = document.createElement("table");
  table.className = "sheet-grid";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "row-heading";
  corner.textContent = "";
  headerRow.appendChild(corner);

  for (let column = 0; column < columnCount; column += 1) {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = columnToA1(columnStart + column);
    headerRow.appendChild(heading);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (let row = 0; row < rowCount; row += 1) {
    const tableRow = document.createElement("tr");
    const rowHeading = document.createElement("th");
    rowHeading.className = "row-heading";
    rowHeading.scope = "row";
    rowHeading.textContent = String(rowStart + row);
    tableRow.appendChild(rowHeading);

    for (let column = 0; column < columnCount; column += 1) {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      const absoluteRow = rowStart + row;
      const absoluteColumn = columnStart + column;
      input.type = "text";
      input.value = state.gridValues[row][column];
      input.dataset.row = String(absoluteRow);
      input.dataset.column = String(absoluteColumn);
      input.setAttribute("aria-label", `${columnToA1(absoluteColumn)}${absoluteRow}`);
      cell.appendChild(input);
      tableRow.appendChild(cell);
    }
    tbody.appendChild(tableRow);
  }
  table.appendChild(tbody);
  elements.sheetGridContainer.replaceChildren(table);
}

function handleCellEdit(event) {
  const input = event.target.closest("input[data-row][data-column]");
  if (!input) return;

  const row = Number(input.dataset.row);
  const column = Number(input.dataset.column);
  const visibleRow = row - (state.rowPage * ROWS_PER_PAGE + 1);
  const visibleColumn = column - (state.columnPage * COLUMNS_PER_PAGE);
  const originalValue = state.gridValues[visibleRow]?.[visibleColumn] ?? "";
  const key = `${row}:${column}`;

  if (input.value === originalValue) {
    state.pendingEdits.delete(key);
    input.classList.remove("dirty");
  } else {
    state.pendingEdits.set(key, { row, column, value: input.value });
    input.classList.add("dirty");
  }
  updateSaveButton();
}

function confirmDiscardChanges() {
  if (state.isSaving) {
    showStatus("Wait for the current spreadsheet save to finish before changing sheets.", "info");
    return false;
  }
  if (state.pendingEdits.size === 0) return true;
  if (!window.confirm("Discard unsaved spreadsheet changes?")) return false;
  state.pendingEdits.clear();
  updateSaveButton();
  return true;
}

function updateSaveButton() {
  elements.saveSheetButton.disabled = state.isSaving || state.pendingEdits.size === 0;
  elements.saveSheetButton.innerHTML = state.pendingEdits.size > 0
    ? `<i class="fas fa-save" aria-hidden="true"></i> Save ${state.pendingEdits.size} change${state.pendingEdits.size === 1 ? "" : "s"}`
    : '<i class="fas fa-save" aria-hidden="true"></i> Save changes';
}

async function saveSheetChanges() {
  if (!state.pendingEdits.size || !state.activeSpreadsheet || !state.activeSheet) return;
  state.isSaving = true;
  updateSaveButton();
  elements.sheetGridStatus.textContent = "Saving changes to Google Sheets...";

  try {
    const data = createUpdateRanges();
    const result = await googleApiFetch(
      `${SHEETS_API}/spreadsheets/${encodeURIComponent(state.activeSpreadsheet.id)}/values:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data })
      }
    );
    const updatedCells = result.totalUpdatedCells || 0;
    state.pendingEdits.clear();
    updateSaveButton();
    await loadGrid();
    showStatus(`${updatedCells} cell${updatedCells === 1 ? "" : "s"} saved.`, "success");
  } catch (error) {
    console.error("Unable to save Google Sheets changes:", error);
    elements.sheetGridStatus.textContent = error.message || "Unable to save spreadsheet changes.";
    showStatus(error.message || "Unable to save spreadsheet changes.", "error");
  } finally {
    state.isSaving = false;
    updateSaveButton();
  }
}

function createUpdateRanges() {
  const cells = Array.from(state.pendingEdits.values())
    .sort((left, right) => left.row - right.row || left.column - right.column);
  const updates = [];
  let run = [];

  const flushRun = () => {
    if (run.length === 0) return;
    const row = run[0].row;
    const firstColumn = run[0].column;
    const lastColumn = run[run.length - 1].column;
    const range = `${quoteSheetTitle(state.activeSheet.title)}!${columnToA1(firstColumn)}${row}:${columnToA1(lastColumn)}${row}`;
    updates.push({ range, values: [run.map((cell) => cell.value)] });
    run = [];
  };

  cells.forEach((cell) => {
    const previous = run[run.length - 1];
    if (previous && (cell.row !== previous.row || cell.column !== previous.column + 1)) {
      flushRun();
    }
    run.push(cell);
  });
  flushRun();
  return updates;
}

async function reloadActiveSheet() {
  if (!state.activeSheet || !confirmDiscardChanges()) return;
  await loadGrid();
}

async function changePage(axis, increment) {
  if (!confirmDiscardChanges()) return;
  if (axis === "row") {
    const nextPage = state.rowPage + increment;
    const maxPage = Math.max(0, Math.ceil(state.rowCount / ROWS_PER_PAGE) - 1);
    state.rowPage = Math.min(maxPage, Math.max(0, nextPage));
  } else {
    const maxPage = Math.max(0, Math.ceil(state.columnCount / COLUMNS_PER_PAGE) - 1);
    state.columnPage = Math.min(maxPage, Math.max(0, state.columnPage + increment));
  }
  await loadGrid();
}

function columnToA1(columnIndex) {
  let value = columnIndex + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function quoteSheetTitle(title) {
  return `'${title.replace(/'/g, "''")}'`;
}

function clearGoogleSession() {
  state.spreadsheetRequest += 1;
  state.gridRequest += 1;
  state.accessToken = null;
  state.spreadsheets = [];
  state.nextPageToken = null;
  state.activeSpreadsheet = null;
  state.activeSheet = null;
  state.sheets = [];
  state.pendingEdits.clear();
  elements.googleAccount.textContent = "";
  sessionStorage.removeItem("adminGoogleAccessToken");
  elements.createSpreadsheetButton.hidden = true;
  elements.refreshSheetsButton.hidden = true;
  elements.spreadsheetSearch.hidden = true;
  elements.spreadsheetSearch.value = "";
  elements.spreadsheetList.replaceChildren();
  elements.spreadsheetWorkspace.hidden = true;
  elements.sheetsWelcome.hidden = false;
  elements.sheetGridContainer.replaceChildren();
  setSpreadsheetListStatus("Sign in with Google to view spreadsheets.");
  updateSaveButton();
}

async function logout() {
  if (!confirmDiscardChanges()) return;
  sessionStorage.removeItem("adminGoogleAccessToken");
  try {
    await window.proFitnessApiFetch("/api/auth/logout", { method: "POST" });
  } catch (error) {
    console.error("Unable to end admin session:", error);
    showStatus("Could not confirm sign-out with the server. You will be redirected.", "error");
  }
  ["adminLoggedIn", "adminEmail", "adminPhone"].forEach((key) => localStorage.removeItem(key));
  window.location.replace("/gym.html");
}

function showStatus(message, type) {
  window.clearTimeout(state.statusTimer);
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `admin-status ${type || ""}`;
  elements.adminStatus.hidden = false;
  state.statusTimer = window.setTimeout(() => {
    elements.adminStatus.hidden = true;
  }, 7000);
}
