const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const typingIndicator = document.getElementById('typingIndicator');
const introScreen = document.getElementById('introScreen');
const chatContainer = document.getElementById('chatContainer');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const suggestionChips = document.querySelectorAll('.suggestion-chip');

let conversationTitles = [];
let isStreaming = false;
let currentAbortController = null;

function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
}

function updateSendButton() {
    const hasContent = messageInput.value.trim().length > 0;
    sendBtn.disabled = !hasContent || isStreaming;
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function createMessageElement(role, content, isStreaming = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.textContent = role === 'user' ? 'Y' : 'N';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const roleDiv = document.createElement('div');
    roleDiv.className = 'message-role';
    roleDiv.textContent = role === 'user' ? 'You' : 'Nano';

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'message-bubble';
    if (isStreaming) {
        bubbleDiv.classList.add('streaming');
    }
    bubbleDiv.innerHTML = escapeHtml(content);

    contentDiv.appendChild(roleDiv);
    contentDiv.appendChild(bubbleDiv);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    return { messageDiv, bubbleDiv };
}

function addMessageToUI(role, content, isStreaming = false) {
    if (introScreen && !introScreen.classList.contains('hidden')) {
        introScreen.classList.add('hidden');
    }

    const { messageDiv, bubbleDiv } = createMessageElement(role, content, isStreaming);
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();

    return { messageDiv, bubbleDiv };
}

function showTypingIndicator() {
    typingIndicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.classList.add('hidden');
}

function updateHistoryUI(firstMessage) {
    if (conversationTitles.length === 0) {
        const truncatedTitle = firstMessage.length > 30 ? firstMessage.substring(0, 30) + '...' : firstMessage;
        conversationTitles.push({
            title: truncatedTitle,
            id: Date.now()
        });
        renderHistory();
    }
}

function renderHistory() {
    historyList.innerHTML = '';
    conversationTitles.forEach((conv, index) => {
        const li = document.createElement('li');
        li.className = 'history-item' + (index === conversationTitles.length - 1 ? ' active' : '');
        li.textContent = conv.title;
        historyList.appendChild(li);
    });
}

async function sendMessage(message) {
    if (isStreaming || !message.trim()) return;

    const userMessage = message.trim();
    messageInput.value = '';
    autoResizeTextarea();
    updateSendButton();

    addMessageToUI('user', userMessage);

    if (conversationTitles.length === 0) {
        updateHistoryUI(userMessage);
    }

    isStreaming = true;
    updateSendButton();
    showTypingIndicator();

    currentAbortController = new AbortController();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: userMessage }),
            signal: currentAbortController.signal,
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        hideTypingIndicator();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';
        const { bubbleDiv } = addMessageToUI('assistant', '', true);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            assistantContent += chunk;
            bubbleDiv.innerHTML = escapeHtml(assistantContent);
            scrollToBottom();
        }

        bubbleDiv.classList.remove('streaming');

    } catch (error) {
        hideTypingIndicator();
        if (error.name === 'AbortError') {
            addMessageToUI('assistant', '[Request cancelled]');
        } else {
            console.error('Error:', error);
            addMessageToUI('assistant', `Sorry, there was an error: ${error.message}`);
            const lastBubble = messagesContainer.querySelector('.message.assistant:last-child .message-bubble');
            if (lastBubble) {
                lastBubble.classList.add('error');
            }
        }
    } finally {
        isStreaming = false;
        currentAbortController = null;
        updateSendButton();
        messageInput.focus();
    }
}

async function startNewChat() {
    if (isStreaming && currentAbortController) {
        currentAbortController.abort();
    }

    try {
        await fetch('/new-chat', { method: 'POST' });
    } catch (e) {
        console.error('Error resetting chat:', e);
    }

    messagesContainer.innerHTML = '';
    introScreen.classList.remove('hidden');
    messageInput.value = '';
    autoResizeTextarea();
    updateSendButton();
    messageInput.focus();
}

messageInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateSendButton();
});

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.requestSubmit();
    }
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value;
    if (message.trim() && !isStreaming) {
        sendMessage(message);
    }
});

newChatBtn.addEventListener('click', startNewChat);

suggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
        const message = chip.getAttribute('data-message');
        if (message) {
            sendMessage(message);
        }
    });
});

window.addEventListener('load', () => {
    messageInput.focus();
    autoResizeTextarea();
});
