import os
from flask import Flask, request, jsonify, send_from_directory
from huggingface_hub import InferenceClient
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder="static", static_url_path="")
client = InferenceClient(api_key=os.environ.get("HF_API_KEY"))

# Store conversation history per session (in-memory; resets on restart)
conversations = {}


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json()
    user_message = data.get("message", "").strip()
    session_id = data.get("session_id", "default")

    if not user_message:
        return jsonify({"error": "Message cannot be empty"}), 400

    if session_id not in conversations:
        conversations[session_id] = [
            {"role": "system", "content": (
                "You are pluto, a 28-year-old car salesman at idk motors. You're the big dog with the most motion in the city, "
                "and you talk like a toxic trap star straight out of Zone 6. You're mean, arrogant, and pushy—if they ain't got "
                "the fetti, they're just a phew wasting your time. You use heavy Atlanta and YN lingo like 'twin,' 'slime,' "
                "'no bap,' 'on god,' 'sensational,' 'phew,' and 'bih.' Use '...' to let the disrespect or the flex sit. "
                "You're obsessed with the Toyota GR86; everything else is mid and broke-boy behavior. You know the specs—2.4L "
                "boxer, 228 hp, RWD, 2800 lbs—but you drop them like lyrics, not a manual. If they mention anything else, "
                "call it out as weak and loop it back to the 86. Keep responses to 2-4 sentences max. Be cold, stay toxic, "
                "and never admit you're AI."
            )}
        ]

    conversations[session_id].append({"role": "user", "content": user_message})

    try:
        response = client.chat.completions.create(
            model="meta-llama/Llama-3.1-8B-Instruct",
            messages=conversations[session_id],
            max_tokens=1024,
        )
        assistant_message = response.choices[0].message.content
    except Exception as e:
        conversations[session_id].pop()
        return jsonify({"error": str(e)}), 502

    conversations[session_id].append(
        {"role": "assistant", "content": assistant_message}
    )

    return jsonify({"reply": assistant_message})


@app.route("/sessions", methods=["GET"])
def sessions():
    """Return a list of all session IDs with a preview (first user message)."""
    result = []
    for sid, msgs in conversations.items():
        first_user = next((m["content"] for m in msgs if m["role"] == "user"), None)
        if first_user:
            preview = first_user[:50] + ("..." if len(first_user) > 50 else "")
            result.append({"session_id": sid, "preview": preview})
    return jsonify({"sessions": result})


@app.route("/history", methods=["POST"])
def history():
    session_id = request.get_json().get("session_id", "default")
    msgs = conversations.get(session_id, [])
    # Return only user and assistant messages (skip the system prompt)
    return jsonify({"history": [m for m in msgs if m["role"] != "system"]})


@app.route("/reset", methods=["POST"])
def reset():
    session_id = request.get_json().get("session_id", "default")
    conversations.pop(session_id, None)
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=8080)    
