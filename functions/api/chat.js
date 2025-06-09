export async function onRequest(context) {
  try {
    console.log('Chat request received');

    // Check if API key is configured
    if (!context.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is missing in environment variables');
      return new Response(JSON.stringify({
        error: 'Configuration Error: OpenAI API key is not set. Please configure OPENAI_API_KEY in Cloudflare Pages environment variables.',
        details: {
          missingKey: 'OPENAI_API_KEY',
          availableEnvVars: Object.keys(context.env)
        }
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Log that we have an API key (without showing it)
    console.log('OpenAI API key is configured, length:', context.env.OPENAI_API_KEY.length);

    // Handle preflight CORS request
    if (context.request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Get the request body
    const request = await context.request.json();
    const { message, context: chatContext } = request;

    console.log('Received message:', message);

    // Validate the request
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    console.log('Calling OpenAI API...');

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant specializing in AWS and Terraform. Provide clear, concise answers and include code examples when relevant.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    console.log('OpenAI API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(e => ({ error: 'Failed to parse error response' }));
      console.error('OpenAI API error:', errorData);
      return new Response(JSON.stringify({
        error: 'Error calling OpenAI API',
        details: errorData,
        status: response.status
      }), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const data = await response.json();
    console.log('OpenAI API response received');

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected OpenAI API response:', data);
      return new Response(JSON.stringify({
        error: 'Unexpected response format from OpenAI API',
        details: data
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Return the response
    const aiResponse = data.choices[0].message.content;
    console.log('Sending response back to client');

    return new Response(JSON.stringify({
      response: aiResponse
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Server error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
