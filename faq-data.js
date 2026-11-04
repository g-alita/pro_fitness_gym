(function (root) {
  const entries = [
    {
      keyword: "membership",
      question: "What membership plans do you offer?",
      category: "Membership & Pricing",
      answer: 'We offer Monthly, Quarterly, Half Yearly, and Annual plans. You can view detailed rates on our "Membership" page.'
    },
    {
      keyword: "plans",
      question: "Where can I see the available plans?",
      category: "Membership & Pricing",
      answer: 'We offer Monthly, Quarterly, Half Yearly, and Annual plans. You can view detailed rates on our "Membership" page.'
    },
    {
      keyword: "day pass",
      question: "Do you offer a day pass?",
      category: "Membership & Pricing",
      answer: "A Day Pass is available for ₹100."
    },
    {
      keyword: "discount",
      question: "Do you offer group discounts?",
      category: "Membership & Pricing",
      answer: "Yes, we offer special discounts for groups of 3 or more."
    },
    {
      keyword: "joining fee",
      question: "Is there a joining fee?",
      category: "Membership & Pricing",
      answer: "No, we do not have any joining fee or other hidden costs."
    },
    {
      keyword: "hidden costs",
      question: "Are there any hidden costs?",
      category: "Membership & Pricing",
      answer: "No, we do not have any joining fee or other hidden costs."
    },
    {
      keyword: "pause",
      question: "Can I pause or freeze my membership?",
      category: "Membership & Pricing",
      answer: "Yes, you can pause or freeze your membership by informing the gym management in advance."
    },
    {
      keyword: "freeze",
      question: "Can I freeze my membership?",
      category: "Membership & Pricing",
      answer: "Yes, you can pause or freeze your membership by informing the gym management in advance."
    },
    {
      keyword: "cancel",
      question: "Can I cancel my membership?",
      category: "Membership & Pricing",
      answer: "Apologies, we cannot cancel your membership or refund you once you have paid for the membership."
    },
    {
      keyword: "refund",
      question: "Can I get a refund?",
      category: "Membership & Pricing",
      answer: "Apologies, we cannot cancel your membership or refund you once you have paid for the membership."
    },
    {
      keyword: "trial",
      question: "Can I try the gym before joining?",
      category: "Membership & Pricing",
      answer: "Absolutely! We offer 3-day free trial."
    },
    {
      keyword: "free trial",
      question: "Do you offer a free trial?",
      category: "Membership & Pricing",
      answer: "Absolutely! We offer 3-day free trial."
    },
    {
      keyword: "timings",
      question: "What are the gym timings?",
      category: "Hours & Location",
      answer: "Pro Fitness is open Monday to Saturday from 5:30 AM to 9:30 PM, and Sunday from 6:00 PM to 8:00 PM."
    },
    {
      keyword: "hours",
      question: "What are your opening hours?",
      category: "Hours & Location",
      answer: "Pro Fitness is open Monday to Saturday from 5:30 AM to 9:30 PM, and Sunday from 6:00 PM to 8:00 PM."
    },
    {
      keyword: "location",
      question: "Where is Pro Fitness Gym located?",
      category: "Hours & Location",
      answer: "Our address is Opposite Gandhi Maidan, Matwari, Hazaribagh, Jharkhand 825301.",
      chatbotAnswer: 'Our address is Opposite Gandhi Maidan, Matwari, Hazaribagh, Jharkhand 825301. <a href="https://maps.app.goo.gl/tFV2p6JizvyDn3UR6" target="_blank" rel="noopener noreferrer">View on Google Maps</a>'
    },
    {
      keyword: "address",
      question: "What is the gym address?",
      category: "Hours & Location",
      answer: "Our address is Opposite Gandhi Maidan, Matwari, Hazaribagh, Jharkhand 825301.",
      chatbotAnswer: 'Our address is Opposite Gandhi Maidan, Matwari, Hazaribagh, Jharkhand 825301. <a href="https://maps.app.goo.gl/tFV2p6JizvyDn3UR6" target="_blank" rel="noopener noreferrer">View on Google Maps</a>'
    },
    {
      keyword: "parking",
      question: "Is parking available?",
      category: "Gym Facilities",
      answer: "Yes, we have free parking available in front of the gym."
    },
    {
      keyword: "locker",
      question: "Do you have locker rooms?",
      category: "Gym Facilities",
      answer: "Yes, we provide separate locker rooms for men and women."
    },
    {
      keyword: "shower",
      question: "Are shower or locker facilities available?",
      category: "Gym Facilities",
      answer: "Yes, we provide separate locker rooms for men and women."
    },
    {
      keyword: "classes",
      question: "Do you offer group fitness classes?",
      category: "Gym Facilities",
      answer: "Yes, we offer a variety of group fitness sessions."
    },
    {
      keyword: "group fitness",
      question: "What group fitness sessions do you offer?",
      category: "Gym Facilities",
      answer: "Yes, we offer a variety of group fitness sessions."
    },
    {
      keyword: "ac",
      question: "Is the gym air conditioned?",
      category: "Gym Facilities",
      answer: "Yes, the gym is fully air conditioned."
    },
    {
      keyword: "air condition",
      question: "Does the gym have air conditioning?",
      category: "Gym Facilities",
      answer: "Yes, the gym is fully air conditioned."
    },
    {
      keyword: "electricity",
      question: "Is there an electricity backup?",
      category: "Gym Facilities",
      answer: "Yes, we provide 24*7 electricity backup."
    },
    {
      keyword: "power",
      question: "Is power backup available?",
      category: "Gym Facilities",
      answer: "Yes, we provide 24*7 electricity backup."
    }
  ];

  function normalizeQuestion(question) {
    return question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findEntry(question) {
    const normalizedQuestion = normalizeQuestion(question)
      .replace(/\btry the gym\b/g, "trial")
      .replace(/\bgym located\b/g, "location");
    const matches = entries
      .filter((entry) => normalizedQuestion.includes(entry.keyword))
      .sort((left, right) => right.keyword.length - left.keyword.length);
    const specificMatches = matches.filter(
      (entry) => entry.keyword !== "membership" && entry.keyword !== "plans"
    );
    return specificMatches[0] || matches[0] || null;
  }

  root.ProFitnessFAQ = { entries, findEntry, normalizeQuestion };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.ProFitnessFAQ;
  }
})(typeof window !== "undefined" ? window : globalThis);
