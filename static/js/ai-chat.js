// Optimized AI Chat JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM elements
    const elements = {
        chatToggle: document.getElementById('aiChatToggle'),
        chatContainer: document.getElementById('aiChatContainer'),
        chatClose: document.getElementById('aiChatClose'),
        chatInput: document.getElementById('aiChatInput'),
        chatSend: document.getElementById('aiChatSend'),
        chatMessages: document.getElementById('aiChatMessages'),
        aiTyping: document.getElementById('aiTyping')
    };

    let isWaitingForResponse = false;
    let messageQueue = [];
    let isProcessingQueue = false;

    // Debounce function for performance
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // Toggle chat window with animation
    elements.chatToggle.addEventListener('click', () => {
        const isVisible = elements.chatContainer.style.display === 'flex';
        elements.chatContainer.style.display = isVisible ? 'none' : 'flex';
        if (!isVisible) {
            elements.chatInput.focus();
        }
    });

    // Close chat window
    elements.chatClose.addEventListener('click', () => {
        elements.chatContainer.style.display = 'none';
    });

    // Handle input events with debouncing
    elements.chatInput.addEventListener('keypress', debounce((e) => {
        if (e.key === 'Enter' && !isWaitingForResponse && elements.chatInput.value.trim()) {
            sendMessage();
        }
    }, 250));

    // Send message on button click
    elements.chatSend.addEventListener('click', () => {
        if (!isWaitingForResponse && elements.chatInput.value.trim()) {
            sendMessage();
        }
    });

    function setLoadingState(loading) {
        isWaitingForResponse = loading;
        elements.chatInput.disabled = loading;
        elements.chatSend.disabled = loading;
        elements.aiTyping.style.display = loading ? 'flex' : 'none';
    }

    async function processMessageQueue() {
        if (isProcessingQueue || messageQueue.length === 0) return;

        isProcessingQueue = true;
        const message = messageQueue.shift();

        try {
            await sendMessageToAPI(message);
        } catch (error) {
            console.error('Error processing message:', error);
            addMessage('Sorry, I encountered an error. Please try again.', 'error-message');
        } finally {
            isProcessingQueue = false;
            if (messageQueue.length > 0) {
                processMessageQueue();
            }
        }
    }

    async function sendMessageToAPI(message) {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                context: 'aws_terraform'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(JSON.stringify({
                status: response.status,
                ...data
            }));
        }

        if (data.error) {
            throw new Error(JSON.stringify(data));
        }

        return data;
    }

    function sendMessage() {
        const message = elements.chatInput.value.trim();

        // Add user message to chat
        addMessage(message, 'user-message');

        // Clear input
        elements.chatInput.value = '';

        // Show loading state
        setLoadingState(true);

        // Add to message queue
        messageQueue.push(message);
        processMessageQueue();
    }

    function addMessage(text, className) {
        const messageDiv = document.createElement('div');
        messageDiv.className = className;

        // Sanitize and format text
        const sanitizedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .split('\n')
            .map(line => line.trim() === '' ? '<br>' : line.replace(/ /g, '&nbsp;'))
            .join('<br>');

        messageDiv.innerHTML = sanitizedText;
        elements.chatMessages.appendChild(messageDiv);

        // Smooth scroll to bottom
        elements.chatMessages.scrollTo({
            top: elements.chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }

    // Initial setup
    elements.chatContainer.style.display = 'none';
});
