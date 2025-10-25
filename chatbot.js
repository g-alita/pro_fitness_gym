const responses = {
    'membership': 'We offer Monthly, Quarterly, Half Yearly, and Annual plans. You can view detailed rates on our "Membership" page.',
    'plans': 'We offer Monthly, Quarterly, Half Yearly, and Annual plans. You can view detailed rates on our "Membership" page.',
    'day pass': 'A Day Pass is available for ₹100.',
    'discount': 'Yes, we offer special discounts for groups of 3 or more.',
    'joining fee': 'No, we do not have any joining fee or other hidden costs.',
    'hidden costs': 'No, we do not have any joining fee or other hidden costs.',
    'pause': 'Yes, you can pause or freeze your membership by informing the gym management in advance.',
    'freeze': 'Yes, you can pause or freeze your membership by informing the gym management in advance.',
    'cancel': 'Apologies, we cannot cancel your membership or refund you once you have paid for the membership.',
    'refund': 'Apologies, we cannot cancel your membership or refund you once you have paid for the membership.',
    'trial': 'Absolutely! We offer 3-day free trial.',
    'free trial': 'Absolutely! We offer 3-day free trial.',
    'timings': 'Pro Fitness is open Monday to Saturday from 5:30 AM to 9:30 PM, and Sunday from 6:00 PM to 8:00 PM.',
    'hours': 'Pro Fitness is open Monday to Saturday from 5:30 AM to 9:30 PM, and Sunday from 6:00 PM to 8:00 PM.',
    'location': 'Our address is Opposite Gandhi Maidan, Matwari, Hazaribagh, Jharkhand 825301. <a href="https://maps.app.goo.gl/tFV2p6JizvyDn3UR6" target="_blank">View on Google Maps</a>',
    'address': 'Our address is Opposite Gandhi Maidan, Matwari, Hazaribagh, Jharkhand 825301. <a href="https://maps.app.goo.gl/tFV2p6JizvyDn3UR6" target="_blank">View on Google Maps</a>',
    'parking': 'Yes, we have free parking available in front of the gym.',
    'locker': 'Yes, we provide separate locker rooms for men and women.',
    'shower': 'Yes, we provide separate locker rooms for men and women.',
    'classes': 'Yes, we offer a variety of group fitness sessions.',
    'group fitness': 'Yes, we offer a variety of group fitness sessions.',
    'ac': 'Yes, the gym is fully air conditioned.',
    'air condition': 'Yes, the gym is fully air conditioned.',
    'electricity': 'Yes, we provide 24*7 electricity backup.',
    'power': 'Yes, we provide 24*7 electricity backup.'
};

function toggleChat() {
    const chat = document.getElementById('chatContainer');
    chat.classList.toggle('open');
}

function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    setTimeout(() => {
        const response = getResponse(message);
        addMessage(response, 'bot');
    }, 500);
}

function sendQuickMessage(keyword) {
    addMessage(keyword.charAt(0).toUpperCase() + keyword.slice(1), 'user');
    setTimeout(() => {
        const response = getResponse(keyword);
        addMessage(response, 'bot');
    }, 500);
}

function addMessage(text, sender) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = text;

    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function getResponse(message) {
    const lowerMessage = message.toLowerCase();
    for (let key in responses) {
        if (lowerMessage.includes(key)) return responses[key];
    }
    return "We are unable to process your question. Please contact us at 9508128298 for more details. 😊";
}

function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}