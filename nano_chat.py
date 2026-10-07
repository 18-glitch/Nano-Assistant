import os
import sys
from openai import OpenAI

try:
    from dotenv import load_dotenv
    load_dotenv()  # loads NVIDIA_API_KEY from a .env file if present
except ImportError:
    pass  # dotenv is optional — env var works fine without it

API_KEY = os.environ.get("NVIDIA_API_KEY")
if not API_KEY:
    print("ERROR: Set NVIDIA_API_KEY as an environment variable (or in a .env file).")
    print('  export NVIDIA_API_KEY="nvapi-your-key-here"')
    sys.exit(1)

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=API_KEY,
)

MODEL = "nvidia/nemotron-3-nano-30b-a3b"


def ask(messages, stream=True):
    """Send messages to nano and print/stream the reply. Returns the full reply text."""
    response = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.6,
        max_tokens=1024,
        stream=stream,
    )

    full_reply = ""
    if stream:
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                print(delta, end="", flush=True)
                full_reply += delta
        print()
    else:
        full_reply = response.choices[0].message.content
        print(full_reply)

    return full_reply


def interactive_mode():
    """Chat loop that keeps conversation history in memory."""
    print("Nano chat — type 'exit' or 'quit' to stop.\n")
    history = []

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye.")
            break

        if user_input.lower() in ("exit", "quit"):
            print("Bye.")
            break
        if not user_input:
            continue

        history.append({"role": "user", "content": user_input})
        print("Nano: ", end="", flush=True)
        reply = ask(history)
        history.append({"role": "assistant", "content": reply})
        print()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # One-shot mode: python nano_chat.py "your question"
        question = " ".join(sys.argv[1:])
        ask([{"role": "user", "content": question}])
    else:
        interactive_mode()