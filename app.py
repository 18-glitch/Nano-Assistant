import os
import sys
import uuid
from flask import Flask, render_template, request, jsonify, Response, session, g
from openai import OpenAI

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

API_KEY = os.environ.get("NVIDIA_API_KEY")
if not API_KEY:
    print("ERROR: Set NVIDIA_API_KEY as an environment variable (or in a .env file).")
    sys.exit(1)

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=API_KEY,
)

MODEL = "nvidia/nemotron-3-nano-30b-a3b"

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "nano-chat-secret-key")

conversations = {}


def get_session_id():
    if "session_id" not in session:
        session["session_id"] = str(uuid.uuid4())
    return session["session_id"]


def get_history():
    sid = get_session_id()
    if sid not in conversations:
        conversations[sid] = []
    return conversations[sid]


def save_history(history):
    sid = get_session_id()
    conversations[sid] = history


def clear_history():
    sid = get_session_id()
    if sid in conversations:
        del conversations[sid]


def generate_stream(messages):
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=1024,
        stream=True,
    )

    for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


@app.route("/")
def index():
    clear_history()
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message", "").strip()

    if not user_message:
        return jsonify({"error": "Empty message"}), 400

    history = get_history()
    history.append({"role": "user", "content": user_message})
    save_history(history)

    sid = get_session_id()
    history_copy = list(history)

    def stream_response():
        full_reply = ""
        try:
            for token in generate_stream(history_copy):
                full_reply += token
                yield token
        except Exception as e:
            yield f"\n[Error: {str(e)}]"
            return

        conv = conversations.get(sid, [])
        conv.append({"role": "assistant", "content": full_reply})
        conversations[sid] = conv

    return Response(stream_response(), mimetype="text/plain")


@app.route("/new-chat", methods=["POST"])
def new_chat():
    clear_history()
    return jsonify({"status": "ok"})


@app.route("/history", methods=["GET"])
def get_history_endpoint():
    return jsonify({"history": get_history()})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
