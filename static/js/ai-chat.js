document.addEventListener('DOMContentLoaded', function() {
    const chatToggle = document.getElementById('aiChatToggle');
    const chatContainer = document.getElementById('aiChatContainer');
    const chatClose = document.getElementById('aiChatClose');
    const chatInput = document.getElementById('aiChatInput');
    const chatSend = document.getElementById('aiChatSend');
    const chatMessages = document.getElementById('aiChatMessages');
    const aiTyping = document.getElementById('aiTyping');

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
        if (e.key === 'Enter' && chatInput.value.trim()) {
            sendMessage();
        }
    });

    // Send message on button click
    chatSend.addEventListener('click', () => {
        if (chatInput.value.trim()) {
            sendMessage();
        }
    });

    function sendMessage() {
        const message = chatInput.value.trim();
        
        // Add user message to chat
        addMessage(message, 'user-message');
        
        // Clear input
        chatInput.value = '';
        
        // Show typing indicator
        aiTyping.style.display = 'flex';
        
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
        .then(response => response.json())
        .then(data => {
            // Hide typing indicator
            aiTyping.style.display = 'none';
            
            if (data.error) {
                // Handle error response
                console.error('API Error:', data);
                addMessage(`Error: ${data.error}${data.details ? '\nDetails: ' + JSON.stringify(data.details) : ''}`, 'error-message');
            } else {
                // Add AI response to chat
                addMessage(data.response, 'ai-message');
            }
        })
        .catch(error => {
            console.error('Network Error:', error);
            aiTyping.style.display = 'none';
            addMessage('Sorry, I encountered a network error. Please try again.', 'error-message');
        });
    }

    function addMessage(text, className) {
        const messageDiv = document.createElement('div');
        messageDiv.className = className;
        
        // Handle multiline text
        const formattedText = text.split('\n').map(line => {
            if (line.trim() === '') return '<br>';
            return line;
        }).join('<br>');
        
        messageDiv.innerHTML = formattedText;
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Initial setup
    chatContainer.style.display = 'none';
}); 
