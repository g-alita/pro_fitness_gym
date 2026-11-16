const heroPhoto = document.querySelector(".hero-photo");
const carouselDots = [...document.querySelectorAll(".carousel-dot")];
const bookingForm = document.getElementById("booking-form");
const bookingMessage = document.getElementById("booking-message");
const menu = document.querySelector(".nav-links");
const navbar = document.querySelector("nav");
const monthLabel = document.getElementById("calendar-month");
const calendarDays = document.getElementById("calendar-days");
const previousMonthButton = document.getElementById("previous-month");
const nextMonthButton = document.getElementById("next-month");
const selectedDateLabel = document.getElementById("selected-date-label");
const slotHead = document.getElementById("slot-head");
const slotRows = document.getElementById("slot-rows");
const heroPhotoPlaceholder = document.getElementById("hero-photo-placeholder");
const turfSlides = [
  { src: "photos/truf.jpeg", position: "center 62%" },
  { src: "photos/turf-2.jpg", position: "center" },
  { src: "photos/turf-3.jpg", position: "center" }
];
const timeSlots = ["6:00 AM", "7:00 AM", "8:00 AM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM"];
const today = new Date();
today.setHours(0, 0, 0, 0);
let activeView = 0;
let displayedMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = new Date(today);
const selectedSlots = new Map();

function showTurfView(index) {
  activeView = index;
  const slide = turfSlides[index];
  const image = new Image();
  heroPhoto.style.backgroundPosition = slide.position;
  heroPhoto.style.transform = "scale(1.04)";
  heroPhotoPlaceholder.hidden = true;
  image.onload = () => {
    if (activeView === index) {
      heroPhoto.style.backgroundImage = `url("${slide.src}")`;
    }
  };
  image.onerror = () => {
    if (activeView === index) {
      heroPhoto.style.backgroundImage = "linear-gradient(135deg, #123b45, #102b46)";
      heroPhotoPlaceholder.textContent = `Add this image to the frontend folder: ${slide.src}`;
      heroPhotoPlaceholder.hidden = false;
    }
  };
  image.src = slide.src;
  carouselDots.forEach((dot, dotIndex) => {
    const isActive = dotIndex === index;
    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-pressed", String(isActive));
  });
}

carouselDots.forEach((dot, index) => {
  dot.addEventListener("click", () => showTurfView(index));
});

if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  window.setInterval(() => showTurfView((activeView + 1) % turfSlides.length), 5000);
}

function toggleMenu() {
  menu.classList.toggle("show");
}

window.toggleMenu = toggleMenu;
menu.addEventListener("click", (event) => {
  if (event.target.closest("a[href]")) menu.classList.remove("show");
});

function updateScrollNavbar() {
  navbar.classList.toggle("scrolled", window.scrollY > 50);
}

window.addEventListener("scroll", updateScrollNavbar, { passive: true });
updateScrollNavbar();

document.querySelectorAll('input[name="bookingType"]').forEach((input) => {
  input.addEventListener("change", () => {
    document.querySelectorAll(".type-option").forEach((option) => {
      option.classList.toggle("is-selected", option.querySelector("input").checked);
    });
  });
});

function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const currentMonthIsToday = year === today.getFullYear() && month === today.getMonth();

  monthLabel.textContent = displayedMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  previousMonthButton.disabled = currentMonthIsToday;
  calendarDays.replaceChildren();

  for (let index = 0; index < firstWeekday; index += 1) {
    const emptyCell = document.createElement("span");
    emptyCell.className = "calendar-day is-empty";
    emptyCell.setAttribute("aria-hidden", "true");
    calendarDays.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dayButton = document.createElement("button");
    dayButton.type = "button";
    dayButton.className = "calendar-day";
    dayButton.textContent = String(day);
    dayButton.setAttribute("aria-label", date.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }));

    if (date < today) {
      dayButton.disabled = true;
    } else {
      dayButton.addEventListener("click", () => {
        selectedDate = date;
        renderCalendar();
        renderTimeSlots();
        showTurfView(0);
      });
    }

    if (date.getTime() === today.getTime()) dayButton.classList.add("is-today");
    if (date.getTime() === selectedDate.getTime()) {
      dayButton.classList.add("is-selected");
      dayButton.setAttribute("aria-pressed", "true");
    } else {
      dayButton.setAttribute("aria-pressed", "false");
    }
    calendarDays.appendChild(dayButton);
  }

  selectedDateLabel.textContent = `Selected: ${selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  })}`;
}

function renderTimeSlots() {
  slotHead.replaceChildren();
  slotRows.replaceChildren();

  const dateHeading = document.createElement("th");
  dateHeading.scope = "col";
  dateHeading.textContent = "Date";
  slotHead.appendChild(dateHeading);

  timeSlots.forEach((time) => {
    const heading = document.createElement("th");
    heading.scope = "col";
    heading.textContent = time;
    slotHead.appendChild(heading);
  });

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const date = new Date(selectedDate);
    date.setDate(selectedDate.getDate() + dayOffset);
    const dateKey = getDateKey(date);
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    row.appendChild(dateCell);

    timeSlots.forEach((time) => {
      const cell = document.createElement("td");
      const button = document.createElement("button");
      const isPastSlot = date < today || (date.getTime() === today.getTime() && isPastTime(time));
      const isSelected = selectedSlots.get(dateKey)?.has(time) || false;
      button.type = "button";
      button.className = "time-slot";
      button.disabled = isPastSlot;
      button.setAttribute("aria-label", `${isPastSlot ? "Unavailable" : "Select"} ${time} on ${date.toLocaleDateString()}`);
      button.setAttribute("aria-pressed", String(isSelected));
      button.innerHTML = isPastSlot
        ? '<i class="fas fa-minus" aria-hidden="true"></i>'
        : '<i class="fas fa-check" aria-hidden="true"></i>';
      if (isSelected) button.classList.add("is-selected");
      button.addEventListener("click", () => {
        let daySlots = selectedSlots.get(dateKey);
        if (!daySlots) {
          daySlots = new Set();
          selectedSlots.set(dateKey, daySlots);
        }
        if (daySlots.has(time)) {
          daySlots.delete(time);
          if (!daySlots.size) selectedSlots.delete(dateKey);
        } else {
          daySlots.add(time);
        }
        const selected = selectedSlots.get(dateKey)?.has(time) || false;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      cell.appendChild(button);
      row.appendChild(cell);
    });
    slotRows.appendChild(row);
  }
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isPastTime(time) {
  const [timePart, meridiem] = time.split(" ");
  const hour = Number(timePart.split(":")[0]) % 12 + (meridiem === "PM" ? 12 : 0);
  return hour <= today.getHours();
}

previousMonthButton.addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthButton.addEventListener("click", () => {
  displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
  renderCalendar();
});

renderCalendar();
renderTimeSlots();

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const hasSelectedSlots = [...selectedSlots.values()].some((daySlots) => daySlots.size > 0);
  if (!hasSelectedSlots) {
    bookingMessage.textContent = "Please select at least one time slot to continue.";
    return;
  }

  const selectedType = bookingForm.querySelector('input[name="bookingType"]:checked').value;
  const bookingDetails = [...selectedSlots.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([dateKey, times]) => {
      const date = new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "long" });
      const orderedTimes = [...times].sort((first, second) =>
        timeSlots.indexOf(first) - timeSlots.indexOf(second)
      );
      return `${date}: ${orderedTimes.join(", ")}`;
    })
    .join("\n");
  const subject = encodeURIComponent("Pro Fitness Turf booking request");
  const body = encodeURIComponent(
    `Hello Pro Fitness,\n\nI would like to request a turf booking.\n\nType: ${selectedType}\nRequested slots:\n${bookingDetails}\n\nPlease confirm availability and booking details.`
  );
  bookingMessage.textContent = "Opening your email app to send this request. Your booking is not confirmed until the team replies.";
  window.location.href = `mailto:profitnessgym26@gmail.com?subject=${subject}&body=${body}`;
});
