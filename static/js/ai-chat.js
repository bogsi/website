document.addEventListener('DOMContentLoaded', function() {
    const chatToggle = document.getElementById('aiChatToggle');
    const chatContainer = document.getElementById('aiChatContainer');
    const chatClose = document.getElementById('aiChatClose');
    const chatInput = document.getElementById('aiChatInput');
    const chatSend = document.getElementById('aiChatSend');
    const chatMessages = document.getElementById('aiChatMessages');
    const aiTyping = document.getElementById('aiTyping');

    let isWaitingForResponse = false;

    // Toggle chat window
    chatToggle.addEventListener('click', () => {
        chatContainer.style.display = chatContainer.style.display === 'none' ? 'flex' : 'none';
        if (chatContainer.style.display === 'flex') {
            chatInput.focus();
        }
    });

    // Close chat window
    chatClose.addEventListener('click', () => {
        chatContainer.style.display = 'none';
    });

    // Send message on enter
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isWaitingForResponse && chatInput.value.trim()) {
            sendMessage();
        }
    });

    // Send message on button click
    chatSend.addEventListener('click', () => {
        if (!isWaitingForResponse && chatInput.value.trim()) {
            sendMessage();
        }
    });

    function setLoadingState(loading) {
        isWaitingForResponse = loading;
        chatInput.disabled = loading;
        chatSend.disabled = loading;
        aiTyping.style.display = loading ? 'flex' : 'none';
    }

    function sendMessage() {
        const message = chatInput.value.trim();
        
        // Add user message to chat
        addMessage(message, 'user-message');
        
        // Clear input
        chatInput.value = '';
        
        // Show loading state
        setLoadingState(true);
        
        // Send to backend API
        fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                context: 'aws_terraform'
            })
        })
        .then(async response => {
            const data = await response.json();
            if (!response.ok) {
                throw new Error(JSON.stringify({
                    status: response.status,
                    ...data
                }));
            }
            return data;
        })
        .then(data => {
            if (data.error) {
                // Handle error response
                console.error('API Error:', data);
                let errorMessage = `Error: ${data.error}`;
                if (data.details) {
                    errorMessage += '\n\nDetails: ' + JSON.stringify(data.details, null, 2);
                }
                addMessage(errorMessage, 'error-message');
            } else {
                // Add AI response to chat
                addMessage(data.response, 'ai-message');
            }
        })
        .catch(error => {
            console.error('Network/API Error:', error);
            let errorMessage = 'Sorry, I encountered an error. Please try again.';
            try {
                const errorData = JSON.parse(error.message);
                errorMessage = `Error (${errorData.status}): ${errorData.error}`;
                if (errorData.details) {
                    errorMessage += '\n\nDetails: ' + JSON.stringify(errorData.details, null, 2);
                }
            } catch (e) {
                errorMessage += '\n\nDetails: ' + error.message;
            }
            addMessage(errorMessage, 'error-message');
        })
        .finally(() => {
            setLoadingState(false);
        });
    }

    function addMessage(text, className) {
        const messageDiv = document.createElement('div');
        messageDiv.className = className;
        
        // Handle multiline text and code blocks
        const formattedText = text.split('\n').map(line => {
            if (line.trim() === '') return '<br>';
            // Preserve whitespace
            return line.replace(/ /g, '&nbsp;');
        }).join('<br>');
        
        messageDiv.innerHTML = formattedText;
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Initial setup
    chatContainer.style.display = 'none';
}); 
