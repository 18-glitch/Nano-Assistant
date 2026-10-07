# Nano: A Streaming Chatbot on NVIDIA Nemotron-3-Nano

**Nano** is a lightweight chatbot powered by NVIDIA's `nemotron-3-nano-30b-a3b` model, served through the NVIDIA NIM API. It comes in two forms that share the same model setup:

- **Web app** (`app.py`): a Flask server with a streaming chat interface and per-user conversation memory.
- **Command-line app** (`nano_chat.py`): an interactive terminal chat, plus a one-shot mode for quick questions.

Replies are **streamed token by token**, so text appears as it is generated instead of after a long wait.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Web App](#running-the-web-app)
- [Running the CLI](#running-the-cli)
- [API Reference](#api-reference)
- [How It Works](#how-it-works)
- [Limitations & Production Notes](#limitations--production-notes)

---

## Features

- Streaming responses from Nemotron-3-Nano in both the web app and the CLI
- Multi-turn conversations: the full message history is sent with each request, so the model keeps context
- Separate conversation per browser session in the web app
- CLI with an interactive loop and a one-shot mode (`python nano_chat.py "your question"`)
- Uses the standard `openai` Python client pointed at NVIDIA's OpenAI-compatible endpoint
- API key loaded from the environment or a `.env` file, with a clear error if it is missing

---

## Tech Stack

| Component | Purpose |
|-----------|---------|
| **Python 3.9+** | Language |
| **Flask** | Web server and routing |
| **openai** (Python SDK) | Client for NVIDIA's OpenAI-compatible API |
| **python-dotenv** (optional) | Loads variables from a `.env` file |
| **NVIDIA NIM** (`integrate.api.nvidia.com`) | Hosts the `nvidia/nemotron-3-nano-30b-a3b` model |

---

## Project Structure

```
.
├── app.py              # Flask web app (routes, sessions, streaming)
├── nano_chat.py        # Terminal chat client (interactive + one-shot)
├── templates/
│   └── index.html      # Chat page rendered by the "/" route
├── requirements.txt
├── .env                # Your API key (never commit this)
└── README.md
```

`app.py` renders `templates/index.html`, so that file must exist for the web app to load.

---

## Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd <your-repo-folder>

# 2. (Recommended) create a virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install flask openai python-dotenv
```

---

## Configuration

### Get an API key

Create a free key at [build.nvidia.com](https://build.nvidia.com). Keys start with `nvapi-`.

### Set environment variables

Create a `.env` file in the project root:

```env
NVIDIA_API_KEY=nvapi-your-key-here
FLASK_SECRET_KEY=replace-with-a-long-random-string
```

Or export them in your shell:

```bash
export NVIDIA_API_KEY="nvapi-your-key-here"
export FLASK_SECRET_KEY="replace-with-a-long-random-string"
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `NVIDIA_API_KEY` | **Yes** | Authenticates requests to NVIDIA NIM. Both apps exit with an error if it is missing. |
| `FLASK_SECRET_KEY` | Recommended | Signs the Flask session cookie. If unset, a hard-coded default is used, which is fine for local testing but **insecure for anything public**. |

Add `.env` to your `.gitignore` so your key is never pushed to GitHub.

### Model settings

Both files use the same settings, defined near the top of each:

| Setting | Value | Effect |
|---------|-------|--------|
| `MODEL` | `nvidia/nemotron-3-nano-30b-a3b` | The model to call |
| `temperature` | `0.6` | Moderate randomness: focused but not robotic |
| `max_tokens` | `1024` | Upper limit on the length of each reply |

---

## Running the Web App

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

Visiting `/` **starts a fresh conversation**, so refreshing the page clears the chat.

---

## Running the CLI

**Interactive mode** (keeps history for the whole session):

```bash
python nano_chat.py
```

```
Nano chat — type 'exit' or 'quit' to stop.

You: What is a transformer?
Nano: A transformer is a neural network architecture that ...
```

Type `exit` or `quit` (or press `Ctrl+C` / `Ctrl+D`) to leave.

**One-shot mode** (a single question, no history):

```bash
python nano_chat.py "Explain gradient descent in two sentences"
```

---

## API Reference

All routes are served by `app.py`. Conversation state is tied to a session cookie, so API clients must keep and resend cookies.

| Method | Route | Body | Response | Description |
|--------|-------|------|----------|-------------|
| `GET` | `/` | none | HTML | Clears the current conversation and renders the chat page. |
| `POST` | `/chat` | JSON `{"message": "..."}` | Streamed `text/plain` | Adds the message to history, streams the model's reply, then stores the reply in history. Returns `400` with `{"error": "Empty message"}` if the message is blank. |
| `POST` | `/new-chat` | none | `{"status": "ok"}` | Clears the current conversation without reloading the page. |
| `GET` | `/history` | none | `{"history": [...]}` | Returns the stored messages as `{"role", "content"}` objects. |

**Example with `curl`** (the cookie jar keeps your session so history persists):

```bash
curl -N -c cookies.txt -b cookies.txt \
  -X POST http://localhost:5000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, who are you?"}'

curl -b cookies.txt http://localhost:5000/history
```

The `-N` flag turns off curl's output buffering so you can watch tokens arrive.

---

## How It Works

1. **Session identity.** The first time a browser calls the server, it is assigned a random UUID stored in a signed Flask session cookie. This UUID is the key into the `conversations` dictionary.
2. **Message flow.** `/chat` appends the user's message to that session's history and sends the *entire* history to the model, because the API is stateless and has no memory of earlier turns.
3. **Streaming.** `generate_stream()` calls the API with `stream=True` and yields each text fragment (`delta`) as it arrives. Flask wraps this generator in a `Response`, so the browser receives text progressively.
4. **Saving the reply.** The fragments are accumulated into `full_reply`. Only after the stream finishes is the complete assistant message appended to history, so the next turn includes it.
5. **Session ID captured early.** The session ID is read *before* streaming begins, because the request's session object is not reliably accessible from inside a streaming generator.
6. **Error handling.** If the API call fails mid-stream, the error is sent to the client as `[Error: ...]` and the partial reply is **not** saved, which keeps broken text out of future context.

---

## Limitations & Production Notes

- **History lives in memory.** The `conversations` dict is lost on server restart, is not shared between multiple worker processes, and is never pruned, so it grows over time. Use Redis or a database for anything beyond a demo.
- **No context-window management.** The entire history is sent every turn. Very long chats will eventually exceed the model's context limit or slow down. Trim or summarize old messages to handle this.
- **Reply length is capped at 1024 tokens**, so long answers may be cut off. Raise `max_tokens` if needed.
- **Debug mode is on.** `app.run(debug=True, host="0.0.0.0")` exposes the Werkzeug debugger to your whole network, which allows remote code execution. Use `debug=False` and a production server (for example `gunicorn`) when deploying, or bind to `127.0.0.1` for local use.
- **Default secret key.** Always set `FLASK_SECRET_KEY` outside local testing; otherwise anyone can forge session cookies.
- **JSON required.** `/chat` expects a JSON body. A request without one will fail with a server error rather than a clean `400`.
- **No rate limiting or authentication**, so anyone who can reach the server can spend your API quota.

---

## License

Add your preferred license here (e.g. MIT).