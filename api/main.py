from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import openai
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize OpenAI client
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your actual domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    message: str
    context: str

@app.post("/api/chat")
async def chat(chat_message: ChatMessage):
    try:
        # Create system message based on context
        system_message = """You are an expert AI assistant specializing in AWS cloud infrastructure, 
        networking, and Terraform. You provide detailed, technical answers about:
        - AWS services and best practices
        - Cloud networking and architecture
        - Infrastructure as Code with Terraform
        - DevOps practices and automation
        
        Keep responses concise but informative. If you need clarification, ask follow-up questions."""

        # Create chat completion
        response = openai.ChatCompletion.create(
            model="gpt-4",  # or your preferred model
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": chat_message.message}
            ],
            temperature=0.7,
            max_tokens=500
        )

        # Extract and return the AI's response
        ai_response = response.choices[0].message.content

        return {"response": ai_response}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 
