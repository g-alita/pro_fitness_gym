const faqSearchForm = document.getElementById("faq-search-form");
const faqSearchInput = document.getElementById("faq-search");
const faqAnswerSection = document.getElementById("faq-answer");
const faqAnswerQuestion = document.getElementById("faq-answer-question");
const faqAnswerText = document.getElementById("faq-answer-text");
const faqAnswerContact = document.getElementById("faq-answer-contact");
const faqCategories = document.getElementById("faq-categories");

function toggleMenu() {
  document.querySelector(".nav-links").classList.toggle("show");
}

const categoryIcons = {
  "Membership & Pricing": "fas fa-wallet",
  "Hours & Location": "fas fa-map-marker-alt",
  "Gym Facilities": "fas fa-dumbbell"
};

function renderFAQCategories() {
  const categories = new Map();
  window.ProFitnessFAQ.entries.forEach((entry) => {
    if (!categories.has(entry.category)) categories.set(entry.category, []);
    categories.get(entry.category).push(entry);
  });

  categories.forEach((entries, category) => {
    const card = document.createElement("article");
    card.className = "faq-category";

    const heading = document.createElement("div");
    heading.className = "faq-category-heading";
    const icon = document.createElement("span");
    icon.className = "faq-category-icon";
    const iconElement = document.createElement("i");
    iconElement.className = categoryIcons[category] || "fas fa-circle-question";
    iconElement.setAttribute("aria-hidden", "true");
    icon.appendChild(iconElement);
    const title = document.createElement("h3");
    title.textContent = category;
    heading.append(icon, title);

    const questionList = document.createElement("div");
    questionList.className = "faq-question-list";
    entries.forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "faq-question";
      button.dataset.faqQuery = entry.question;
      button.append(document.createTextNode(entry.question));
      const arrow = document.createElement("i");
      arrow.className = "fas fa-arrow-right";
      arrow.setAttribute("aria-hidden", "true");
      button.appendChild(arrow);
      questionList.appendChild(button);
    });

    card.append(heading, questionList);
    faqCategories.appendChild(card);
  });
}

async function searchFAQ(question) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) return;

  const localEntry = window.ProFitnessFAQ.findEntry(trimmedQuestion);
  faqAnswerSection.hidden = false;
  faqAnswerQuestion.textContent = trimmedQuestion;
  faqAnswerText.textContent = localEntry
    ? localEntry.answer
    : "Searching for an answer...";
  faqAnswerContact.hidden = Boolean(localEntry);
  faqAnswerSection.scrollIntoView({ behavior: "smooth", block: "center" });

  try {
    const response = await fetch("/api/faq/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: trimmedQuestion })
    });
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("FAQ search service returned an invalid response.");
    }
    if (!response.ok) throw new Error(data.message || "Unable to search FAQs right now.");

    if (data.answer) {
      faqAnswerText.textContent = data.answer;
    } else {
      faqAnswerText.textContent = "We couldn't find an answer for this question yet.";
      faqAnswerContact.hidden = false;
    }
  } catch (error) {
    if (!localEntry) {
      faqAnswerText.textContent = error.message || "Unable to search FAQs right now. Please try again.";
      faqAnswerContact.hidden = false;
    }
  }
}

faqSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  searchFAQ(faqSearchInput.value);
});

document.querySelectorAll("[data-faq-query]").forEach((button) => {
  button.addEventListener("click", () => {
    const question = button.dataset.faqQuery;
    faqSearchInput.value = question;
    searchFAQ(question);
  });
});

faqCategories.addEventListener("click", (event) => {
  const button = event.target.closest("[data-faq-query]");
  if (button) {
    faqSearchInput.value = button.dataset.faqQuery;
    searchFAQ(button.dataset.faqQuery);
  }
});

renderFAQCategories();
