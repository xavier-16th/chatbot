// =============================================
// Session Management
// =============================================

// grab the session id from storage, or create a new one if first visit
let sessionId = localStorage.getItem("chatSessionId") || crypto.randomUUID();
localStorage.setItem("chatSessionId", sessionId);

// get the list of all chat sessions we've had (stored locally in the browser)
function getSavedSessions() {
  return JSON.parse(localStorage.getItem("chatSessions") || "[]");
}

// save the updated sessions list back to localStorage
function saveSessions(list) {
  localStorage.setItem("chatSessions", JSON.stringify(list));
}

// add a session id to our list if it's not already there
function addSessionToList(sid) {
  const list = getSavedSessions();
  if (!list.includes(sid)) {
    list.unshift(sid); // put new ones at the top
    saveSessions(list);
  }
}

// =============================================
// DOM Elements
// =============================================

const messagesEl = document.getElementById("messages");
const typingEl = document.getElementById("typing");
const inputEl = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const sessionListEl = document.getElementById("sessionList");

// =============================================
// Sidebar (chat history panel)
// =============================================

// fetch all sessions from the server and render the sidebar
async function loadSessions() {
  try {
    const res = await fetch("/sessions");
    const data = await res.json();
    const serverSessions = data.sessions || [];

    // make sure any sessions the server knows about are saved locally too
    serverSessions.forEach(s => addSessionToList(s.session_id));

    renderSidebar(serverSessions);
  } catch {
    renderSidebar([]);
  }
}

// build out the sidebar with all our chat sessions
function renderSidebar(serverSessions) {
  // map session ids to their preview text (first message snippet)
  const serverMap = {};
  serverSessions.forEach(s => { serverMap[s.session_id] = s.preview; });

  const allIds = getSavedSessions();

  // nothing to show yet
  if (allIds.length === 0) {
    sessionListEl.innerHTML = '<div class="no-sessions">No conversations yet</div>';
    return;
  }

  // build each session item in the sidebar
  sessionListEl.innerHTML = "";
  allIds.forEach(sid => {
    const preview = serverMap[sid] || "New conversation";
    const item = document.createElement("div");
    item.className = "session-item" + (sid === sessionId ? " active" : "");

    // the preview text label
    const label = document.createElement("span");
    label.textContent = preview;
    label.style.overflow = "hidden";
    label.style.textOverflow = "ellipsis";
    label.style.flex = "1";
    item.appendChild(label);

    // little X button to delete a chat
    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "✕";
    delBtn.onclick = (e) => { e.stopPropagation(); deleteSession(sid); };
    item.appendChild(delBtn);

    // clicking the item switches to that chat
    item.onclick = () => switchSession(sid);
    sessionListEl.appendChild(item);
  });
}

// switch to a different chat session when clicked in the sidebar
async function switchSession(sid) {
  sessionId = sid;
  localStorage.setItem("chatSessionId", sid);

  // wipe current messages from the screen
  document.querySelectorAll(".message").forEach(m => m.remove());

  // pull up the old messages for this session
  try {
    const res = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sid }),
    });
    const data = await res.json();
    if (res.ok && data.history.length > 0) {
      data.history.forEach(m => addMessage(m.content, m.role));
    } else {
      addGreeting(); // no history? show the default greeting
    }
  } catch {
    addGreeting();
  }

  loadSessions(); // re-render sidebar so the active one is highlighted
}

// show pluto's intro message
function addGreeting() {
  const div = document.createElement("div");
  div.className = "message assistant";
  div.id = "greeting";
  div.textContent = "yoo its pluto ya . You looking at cars today? cause i found some crazy 4 u 👀";
  messagesEl.insertBefore(div, typingEl);
}

// delete a chat session (from server + localStorage)
async function deleteSession(sid) {
  // tell the server to forget this session
  await fetch("/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sid }),
  });

  // remove it from our local list
  const list = getSavedSessions().filter(s => s !== sid);
  saveSessions(list);

  // if we just deleted the chat we were looking at, start fresh
  if (sid === sessionId) {
    newChat();
  } else {
    loadSessions();
  }
}

// start a brand new chat
function newChat() {
  sessionId = crypto.randomUUID();
  localStorage.setItem("chatSessionId", sessionId);
  addSessionToList(sessionId);

  // clear the screen and show the greeting
  document.querySelectorAll(".message").forEach(m => m.remove());
  addGreeting();

  loadSessions();
  inputEl.focus();
}

// =============================================
// Page Load — restore previous chat if any
// =============================================

(async function init() {
  addSessionToList(sessionId);

  // try to load any existing messages for the current session
  try {
    const res = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json();
    if (res.ok && data.history.length > 0) {
      // we have real history, so ditch the default greeting
      document.getElementById("greeting")?.remove();
      data.history.forEach(m => addMessage(m.content, m.role));
    }
  } catch {}

  loadSessions(); // populate the sidebar
})();

// =============================================
// Chat Input & Messaging
// =============================================

// auto-grow the textarea as user types
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = inputEl.scrollHeight + "px";
});

// send on Enter, new line on Shift+Enter
function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// add a message bubble to the chat area
function addMessage(text, role) {
  const div = document.createElement("div");
  div.className = "message " + role;
  div.textContent = text;
  messagesEl.insertBefore(div, typingEl);
  messagesEl.scrollTop = messagesEl.scrollHeight; // auto-scroll to bottom
}

// send the user's message to the server and display the response
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  addMessage(text, "user");

  // once they actually say something, remove the intro greeting
  document.getElementById("greeting")?.remove();

  // reset the input box
  inputEl.value = "";
  inputEl.style.height = "auto";

  // show loading state
  sendBtn.disabled = true;
  typingEl.style.display = "block";
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId }),
    });
    const data = await res.json();
    if (res.ok) {
      addMessage(data.reply, "assistant");

      // update the sidebar so this chat shows up with a preview
      addSessionToList(sessionId);
      loadSessions();
    } else {
      addMessage(data.error || "Something went wrong.", "error");
    }
  } catch {
    addMessage("Could not reach the server.", "error");
  } finally {
    // done loading, re-enable input
    typingEl.style.display = "none";
    sendBtn.disabled = false;
    inputEl.focus();
  }
}
