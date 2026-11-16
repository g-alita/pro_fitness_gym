const STORAGE_KEY_PREFIX = "proFitnessStaffPrototype";
const staffForm = document.getElementById("profile-form");
const customerForm = document.getElementById("customer-form");
const leaveForm = document.getElementById("leave-form");
const attendanceForm = document.getElementById("attendance-form");
const profileStatus = document.getElementById("profile-status");
const customerStatus = document.getElementById("customer-status");
const leaveStatus = document.getElementById("leave-status");
const attendanceStatus = document.getElementById("attendance-status");
const customerRows = document.getElementById("customer-rows");
const leaveRows = document.getElementById("leave-rows");
const attendanceRows = document.getElementById("attendance-rows");
const profileFields = {
  name: document.getElementById("staff-name"),
  position: document.getElementById("staff-position"),
  contact: document.getElementById("staff-contact"),
  email: document.getElementById("staff-email"),
  branch: document.getElementById("staff-branch")
};

function readData() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return { profile: {}, customers: [], leaves: [], attendance: [] };

  let data;
  try {
    data = JSON.parse(saved);
  } catch (error) {
    console.error("Could not read the saved staff prototype data:", error);
    showStorageError("Saved records could not be read. Clear this page's prototype data in browser storage to continue.");
    return { profile: {}, customers: [], leaves: [], attendance: [] };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    showStorageError("Saved records are in an invalid format. Clear this page's prototype data in browser storage to continue.");
    return { profile: {}, customers: [], leaves: [], attendance: [] };
  }
  return {
    profile: data.profile && typeof data.profile === "object" ? data.profile : {},
    customers: Array.isArray(data.customers) ? data.customers : [],
    leaves: Array.isArray(data.leaves) ? data.leaves : [],
    attendance: Array.isArray(data.attendance) ? data.attendance : []
  };
}

let data;
let storageKey;

function showStorageError(message) {
  [profileStatus, customerStatus, leaveStatus, attendanceStatus].forEach((status) => {
    status.textContent = message;
  });
}

function saveData() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Could not save staff prototype data:", error);
    showStorageError("Could not save records in this browser. Check browser storage availability and try again.");
    return false;
  }
}

function makeCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value || "—";
  return cell;
}

function renderProfile() {
  Object.entries(profileFields).forEach(([key, field]) => {
    field.value = data.profile[key] || "";
  });
  document.getElementById("leave-name").value = data.profile.name || "";
  document.getElementById("leave-contact").value = data.profile.contact || "";
  const avatar = document.getElementById("profile-avatar");
  avatar.replaceChildren();
  if (data.profile.photoDataUrl) {
    const image = document.createElement("img");
    image.src = data.profile.photoDataUrl;
    image.alt = "Staff profile";
    avatar.appendChild(image);
    return;
  }
  const initials = (data.profile.name || "").trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map((part) => part[0].toUpperCase()).join("");
  if (initials) {
    avatar.textContent = initials;
  } else {
    const icon = document.createElement("i");
    icon.className = "fas fa-user";
    avatar.appendChild(icon);
  }
}

function renderCustomers() {
  customerRows.replaceChildren();
  document.getElementById("customer-count").textContent = String(data.customers.length);
  document.getElementById("customers-empty").hidden = data.customers.length > 0;

  data.customers.forEach((customer) => {
    const row = document.createElement("tr");
    row.append(
      makeCell(customer.name),
      makeCell(customer.contact),
      makeCell(customer.email),
      makeCell(customer.startDate),
      makeCell(customer.endDate)
    );
    const feeCell = document.createElement("td");
    const feeStatus = document.createElement("span");
    feeStatus.className = `fee-status${customer.feeStatus === "Paid" ? " is-paid" : ""}`;
    feeStatus.textContent = customer.feeStatus;
    feeCell.appendChild(feeStatus);
    row.appendChild(feeCell);
    const actionCell = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "table-action";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove customer ${customer.name}`);
    removeButton.addEventListener("click", () => {
      data.customers = data.customers.filter((item) => item.id !== customer.id);
      if (saveData()) renderCustomers();
    });
    actionCell.appendChild(removeButton);
    row.appendChild(actionCell);
    customerRows.appendChild(row);
  });
}

function renderLeaves() {
  leaveRows.replaceChildren();
  document.getElementById("leave-empty").hidden = data.leaves.length > 0;
  [...data.leaves].reverse().forEach((leave) => {
    const row = document.createElement("tr");
    row.append(
      makeCell(leave.startDate),
      makeCell(leave.endDate),
      makeCell(String(leave.days)),
      makeCell(leave.reason),
      makeCell(leave.status)
    );
    leaveRows.appendChild(row);
  });
}

function renderAttendance() {
  attendanceRows.replaceChildren();
  document.getElementById("attendance-empty").hidden = data.attendance.length > 0;
  [...data.attendance].sort((first, second) => second.date.localeCompare(first.date)).forEach((record) => {
    const row = document.createElement("tr");
    row.append(makeCell(record.date), makeCell(record.status));
    attendanceRows.appendChild(row);
  });
}

function updateLeaveDays() {
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const daysOutput = document.getElementById("leave-days");
  if (!start || !end) {
    daysOutput.value = "0";
    return;
  }
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const inclusiveDays = Math.floor((endDate - startDate) / 86400000) + 1;
  daysOutput.value = String(inclusiveDays > 0 ? inclusiveDays : 0);
}

function getFormValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function isValidDateRange(startDate, endDate) {
  return Boolean(startDate && endDate && startDate <= endDate);
}

staffForm.addEventListener("submit", (event) => {
  event.preventDefault();
  data.profile = { ...data.profile, ...getFormValues(staffForm) };
  if (saveData()) {
    renderProfile();
    profileStatus.textContent = "Profile saved in this browser.";
  }
});

document.getElementById("staff-photo").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    profileStatus.textContent = "Choose an image file for the profile photo.";
    event.target.value = "";
    return;
  }
  if (file.size > 1024 * 1024) {
    profileStatus.textContent = "Profile photos must be 1 MB or smaller.";
    event.target.value = "";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result !== "string") {
      profileStatus.textContent = "Could not load the selected profile photo.";
      return;
    }
    data.profile.photoDataUrl = reader.result;
    if (saveData()) {
      renderProfile();
      profileStatus.textContent = "Profile photo saved in this browser.";
    }
  });
  reader.addEventListener("error", () => {
    profileStatus.textContent = "Could not read the selected profile photo.";
  });
  reader.readAsDataURL(file);
});

customerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const customer = getFormValues(customerForm);
  if (!isValidDateRange(customer.startDate, customer.endDate)) {
    customerStatus.textContent = "End date must be on or after the start date.";
    return;
  }
  data.customers.push({ ...customer, id: `${Date.now()}-${Math.random()}` });
  if (saveData()) {
    renderCustomers();
    customerForm.reset();
    customerStatus.textContent = "Customer added.";
  }
});

[document.getElementById("leave-start"), document.getElementById("leave-end")].forEach((field) => {
  field.addEventListener("change", updateLeaveDays);
});

leaveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const leave = getFormValues(leaveForm);
  if (!data.profile.name || !data.profile.contact) {
    leaveStatus.textContent = "Save your name and contact in Personal information before applying for leave.";
    return;
  }
  if (!isValidDateRange(leave.startDate, leave.endDate)) {
    leaveStatus.textContent = "End date must be on or after the start date.";
    return;
  }
  data.leaves.push({
    startDate: leave.startDate,
    endDate: leave.endDate,
    days: Number(leave.days),
    reason: leave.reason.trim(),
    status: "Submitted"
  });
  if (saveData()) {
    renderLeaves();
    leaveForm.reset();
    document.getElementById("leave-name").value = data.profile.name;
    document.getElementById("leave-contact").value = data.profile.contact;
    updateLeaveDays();
    leaveStatus.textContent = "Leave request saved in this browser.";
  }
});

attendanceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const record = getFormValues(attendanceForm);
  const existingIndex = data.attendance.findIndex((item) => item.date === record.date);
  if (existingIndex >= 0) data.attendance[existingIndex] = record;
  else data.attendance.push(record);
  if (saveData()) {
    renderAttendance();
    attendanceStatus.textContent = `Attendance saved as ${record.status.toLowerCase()}.`;
  }
});

async function initializeStaffDashboard() {
  const accessStatus = document.getElementById("staff-access-status");
  const previewMode = new URLSearchParams(window.location.search).get("preview") === "1";
  let staffSession;
  try {
    let identity;
    if (previewMode) {
      identity = "preview";
      document.body.classList.add("staff-preview-mode");
      accessStatus.textContent = "Preview mode: records are saved only in this browser; staff sign-in is not active.";
    } else {
      const response = await window.proFitnessApiFetch("/api/staff/session");
      if (response.status === 401) {
        ["staffLoggedIn", "staffEmail", "staffPhone"].forEach((key) => localStorage.removeItem(key));
        window.location.replace("signin-staff.html");
        return;
      }
      const result = await response.json();
      if (!response.ok || !result.success || !(result.email || result.phone)) {
        throw new Error(result.message || "Unable to verify staff access.");
      }
      staffSession = result;
      identity = result.email ? result.email.toLowerCase() : result.phone;
    }

    storageKey = `${STORAGE_KEY_PREFIX}:${identity}`;
    data = readData();
    if (staffSession?.email && !data.profile.email) data.profile.email = staffSession.email;
    if (staffSession?.phone && !data.profile.contact) data.profile.contact = staffSession.phone;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    document.getElementById("attendance-date").value = today;
    renderProfile();
    renderCustomers();
    renderLeaves();
    renderAttendance();
    document.getElementById("staff-dashboard").hidden = false;
    accessStatus.hidden = !previewMode;
  } catch (error) {
    console.error("Staff session check failed:", error);
    accessStatus.textContent = error.message || "Unable to verify staff access. Please try again.";
  }
}

document.getElementById("staff-logout").addEventListener("click", async () => {
  const logoutButton = document.getElementById("staff-logout");
  logoutButton.disabled = true;
  try {
    const response = await window.proFitnessApiFetch("/api/auth/logout", { method: "POST" });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Unable to sign out.");
    }
    ["staffLoggedIn", "staffEmail", "staffPhone"].forEach((key) => localStorage.removeItem(key));
    window.location.replace("signin-staff.html");
  } catch (error) {
    console.error("Staff sign-out failed:", error);
    attendanceStatus.textContent = error.message || "Unable to sign out. Please try again.";
  } finally {
    logoutButton.disabled = false;
  }
});

const navbar = document.querySelector("nav");
const menuButton = document.querySelector(".hamburger");
const navLinks = document.querySelector(".nav-links");
function updateNavbarOnScroll() {
  navbar.classList.toggle("scrolled", window.scrollY > 50);
}
window.addEventListener("scroll", updateNavbarOnScroll, { passive: true });
updateNavbarOnScroll();
menuButton.addEventListener("click", () => {
  const isOpen = navLinks.classList.toggle("show");
  menuButton.setAttribute("aria-expanded", String(isOpen));
});
navLinks.addEventListener("click", (event) => {
  if (event.target.closest("a[href]")) {
    navLinks.classList.remove("show");
    menuButton.setAttribute("aria-expanded", "false");
  }
});

initializeStaffDashboard();
