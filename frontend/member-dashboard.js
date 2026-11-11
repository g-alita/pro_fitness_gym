/*
  Pro Fitness member dashboard
  --------------------------------
  This version is a front-end prototype with sample member data.
  Before production, replace the DEMO_MEMBER object with data from your
  authenticated member API. Pause requests, profile edits and password
  changes must be validated and persisted by the server.

  Navbar behaviour (mobile menu, same-page smooth scroll, shrink on scroll)
  is ported from gym.js. Everything is wrapped in an IIFE so it cannot clash
  with variables declared in chatbot.js / faq-data.js.
*/
(function () {
  "use strict";

  const DEMO_MEMBER = {
    name: "Anjali Kumari",
    memberId: "PF-2026-001",
    email: "anjali@example.com",
    phone: "+91 98765 43210",
    plan: "Half Yearly",
    startDate: "2026-09-01",
    expiryDate: "2027-03-01",
    amount: 6500,
    paymentStatus: "Paid"
  };

  const $ = (id) => document.getElementById(id);
  let member = { ...DEMO_MEMBER };

  /* ===================== NAVBAR (from gym.js) ===================== */
  const siteNav = $("siteNav");
  const navLinks = $("navLinks");
  const menuToggle = $("menuToggle");

  function setMenu(open) {
    navLinks.classList.toggle("show", open);
    menuToggle.setAttribute("aria-expanded", String(open));
  }

  // Toggle mobile menu
  menuToggle.addEventListener("click", () => {
    setMenu(!navLinks.classList.contains("show"));
  });

  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", function (e) {
      const href = this.getAttribute("href") || "";
      // Smooth scroll for same-page links
      if (href.startsWith("#")) {
        e.preventDefault();
        const target = document.getElementById(href.substring(1));
        if (target) {
          window.scrollTo({ top: target.offsetTop - 50, behavior: "smooth" });
        }
      }
      setMenu(false);
    });
  });

  // Shrink navbar when scrolling
  function updateNavbar() {
    siteNav.classList.toggle("scrolled", window.scrollY > 50);
  }
  window.addEventListener("scroll", updateNavbar, { passive: true });
  updateNavbar();

  /* ===================== DASHBOARD ===================== */
  function todayISO() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  function formatDate(value) {
    if (!value) return "—";
    return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
      day: "2-digit", month: "long", year: "numeric"
    });
  }
  function money(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  }
  function dayDiff(a, b) {
    return Math.ceil((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
  }
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  }

  function renderDashboard() {
    const today = todayISO();
    const total = Math.max(1, dayDiff(member.startDate, member.expiryDate));
    const elapsed = Math.max(0, Math.min(total, dayDiff(member.startDate, today)));
    const remaining = Math.max(0, dayDiff(today, member.expiryDate));
    const percent = Math.min(100, Math.round((elapsed / total) * 100));
    $("welcomeName").textContent = member.name.split(" ")[0];
    $("profileName").textContent = member.name;
    $("avatarInitials").textContent = initials(member.name);
    $("memberId").textContent = member.memberId;
    $("memberEmail").textContent = member.email;
    $("credentialEmail").textContent = member.email;
    $("memberPhone").textContent = member.phone;
    $("planName").textContent = member.plan;
    $("detailPlan").textContent = member.plan;
    $("startDate").textContent = formatDate(member.startDate);
    $("expiryDate").textContent = formatDate(member.expiryDate);
    $("detailExpiry").textContent = formatDate(member.expiryDate);
    $("detailAmount").textContent = money(member.amount);
    $("paymentAmount").textContent = `${money(member.amount)} membership fee`;
    $("paymentStatus").textContent = member.paymentStatus;
    $("detailPayment").textContent = member.paymentStatus;
    $("daysRemaining").textContent = remaining === 0 ? "Membership has expired" : `${remaining} days remaining`;
    $("progressBar").style.width = `${percent}%`;
    $("progressLabel").textContent = `${percent}% used`;
    $("membershipStatus").textContent = remaining === 0 ? "Expired" : "Active";
    $("membershipStatus").className = `status-pill ${remaining === 0 ? "pending" : "active"}`;
    $("progressHint").textContent = remaining === 0 ? "Please contact the gym to renew your membership." : "Keep showing up. Every workout counts.";
    $("year").textContent = new Date().getFullYear();
  }

  /* ===================== MODALS ===================== */
  function openModal(id) {
    $(id).classList.add("open");
    $(id).setAttribute("aria-hidden", "false");
  }
  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
  document.querySelectorAll("[data-close-modal]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop")));
  });
  document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", event => {
      if (event.target === backdrop) closeModal(backdrop);
    });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      document.querySelectorAll(".modal-backdrop.open").forEach(closeModal);
      setMenu(false);
    }
  });

  /* ===================== PAUSE REQUEST ===================== */
  $("openPauseModal").addEventListener("click", () => {
    const iso = todayISO();
    $("pauseStart").min = iso;
    $("pauseEnd").min = iso;
    $("pauseStart").value = "";
    $("pauseEnd").value = "";
    $("pauseReason").value = "";
    $("pauseError").textContent = "";
    openModal("pauseModal");
  });
  $("pauseStart").addEventListener("change", () => {
    $("pauseEnd").min = $("pauseStart").value || $("pauseEnd").min;
    if ($("pauseEnd").value && $("pauseEnd").value < $("pauseStart").value) $("pauseEnd").value = "";
  });
  $("pauseForm").addEventListener("submit", event => {
    event.preventDefault();
    const start = $("pauseStart").value;
    const end = $("pauseEnd").value;
    if (!start || !end || end < start) {
      $("pauseError").textContent = "Please choose a valid pause date range.";
      return;
    }
    const days = dayDiff(start, end) + 1;
    const request = { start, end, days, reason: $("pauseReason").value.trim(), status: "Pending", submittedAt: new Date().toISOString() };
    // Demo only: replace with POST /api/member/pause-requests using authenticated session.
    try { localStorage.setItem("pf-demo-pause-request", JSON.stringify(request)); } catch (e) { /* storage unavailable */ }
    closeModal($("pauseModal"));
    const status = $("pauseRequestStatus");
    status.className = "request-status";
    status.textContent = `Your pause request (${formatDate(start)} – ${formatDate(end)}, ${days} days) has been recorded in this demo as Pending. It has not paused your membership.`;
    status.classList.remove("hidden");
  });

  /* ===================== EDIT PROFILE ===================== */
  $("editProfileBtn").addEventListener("click", () => {
    $("editName").value = member.name;
    $("editEmail").value = member.email;
    $("editPhone").value = member.phone;
    $("profileError").textContent = "";
    openModal("profileModal");
  });
  $("profileForm").addEventListener("submit", event => {
    event.preventDefault();
    const name = $("editName").value.trim();
    const email = $("editEmail").value.trim();
    const phone = $("editPhone").value.trim();
    if (!name || !email || !phone) {
      $("profileError").textContent = "Please complete all fields.";
      return;
    }
    // Demo only: production profile changes must be saved through an authenticated API.
    member = { ...member, name, email, phone };
    renderDashboard();
    closeModal($("profileModal"));
  });

  /* ===================== CHANGE PASSWORD ===================== */
  $("changePasswordBtn").addEventListener("click", () => {
    $("passwordForm").reset();
    $("passwordError").textContent = "";
    openModal("passwordModal");
  });
  $("passwordForm").addEventListener("submit", event => {
    event.preventDefault();
    const current = $("currentPassword").value;
    const next = $("newPassword").value;
    const confirm = $("confirmPassword").value;
    if (!current || next.length < 8) {
      $("passwordError").textContent = "Enter your current password and a new password with at least 8 characters.";
      return;
    }
    if (next !== confirm) {
      $("passwordError").textContent = "The new passwords do not match.";
      return;
    }
    $("passwordError").textContent = "The interface is ready, but password changes need the secure backend endpoint before they can be saved.";
  });

  renderDashboard();
})();
