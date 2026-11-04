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
    const entry = window.ProFitnessFAQ.findEntry(message);
    if (entry) return entry.chatbotAnswer || entry.answer;
    return "We are unable to process your question. Please contact us at 9508128298 for more details. 😊";
}

function handleKeyPress(event) {
    if (event.key === 'Enter') sendMessage();
}