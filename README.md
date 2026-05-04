# P2P WebRTC Chat System

## Overview

This repository provides a **minimal peer‑to‑peer (P2P) chat application** that works entirely in the browser using **WebRTC** for direct media/data connections and a **WebSocket‑based signaling server** for peer discovery. The entire stack is packaged into a **single Node.js server** that serves static client files **and** handles WebSocket signalling on the **same HTTP port (8000)**.

---

## Project Structure
```
P2P_conn/
├── README.md                # <-- This file
├── server.js                # Unified HTTP + WebSocket server
├── public/                  # Static assets served to the browser
│   ├── index.html           # Main UI (glass‑morphic premium design)
│   ├── style.css           # Styles for the UI
│   └── app.js              # Client‑side JavaScript (WebRTC + signalling)
```

- **`server.js`** – Starts an HTTP server using `express` and a WebSocket server using `ws`. It:
  1. Serves files from the `public/` directory for any normal HTTP request via Express.
  2. Upgrades requests to `/ws` to a WebSocket connection for signalling.
  3. Manages rooms (max two peers) and relays SDP/ICE messages between them.
- **`public/index.html`** – Simple HTML skeleton that loads `style.css` and `app.js`. The UI is styled with a modern glass‑morphism look, includes a room‑code input, text chat area, and voice calling overlay.
- **`public/style.css`** – Premium CSS using custom colour palettes, subtle gradients, hover animations, and incoming call ring animations.
- **`public/app.js`** – Front‑end logic:
  - Connects to the signalling endpoint (`ws://<host>:8000/ws`).
  - Handles the **join**, **offer**, **answer**, and **ice‑candidate** messages.
  - Sets up a `RTCPeerConnection` and creates a data channel for chat and call signaling.
  - Implements a complete voice calling state machine (request, accept, deny, timeout) and adds audio tracks for duplex communication.

---

## Prerequisites

- **Node.js** (v14+ recommended).  
- Required Node packages (install via npm):
  ```bash
  npm install express ws
  ```

---

## Installation & Setup

1. **Clone / copy the repository** (you already have the files in `~/Desktop/P2P_conn`).
2. **Install dependencies:**
   Navigate to the project root and run:
   ```bash
   cd ~/Desktop/P2P_conn
   npm install express ws
   ```

---

## Running the Application

From the project root (`~/Desktop/P2P_conn`), simply execute:
```bash
node server.js
```
The server will start and output something similar to:
```
Server listening on http://0.0.0.0:8000 (and ws://0.0.0.0:8000/ws)
```

- Open a browser and navigate to **`http://127.0.0.1:8000`** (or the host's IP if you want to connect from another device on the same network).
- Enter a **room code** (any string, e.g., `room1`). The first participant will see "Waiting for peer…"; the second participant will see "Ready – you can start chatting".
- Type messages in the input box; they are sent over the WebRTC data channel directly between peers.
- Click the **Voice** button to initiate a voice call. The receiver will get an incoming call overlay and has 30 seconds to accept or deny before it times out. Audio is only transmitted after the receiver accepts.

To stop the server, press **`Ctrl‑C`** in the terminal.

---

## How It Works (Brief Technical Walk‑through)

1. **HTTP Request Handling** – `server.js` uses `express.static` to serve files from the `public/` folder. For every path other than `/ws`, it reads the corresponding file and returns the content with the appropriate MIME type.
2. **WebSocket Signalling** – The `ws` library attaches to the same Node `http` server on the `/ws` path. The server maintains a global `rooms` object where each key is a room ID and the value is a `Set` of connected WebSocket objects (max 2). Messages are JSON objects with an `action` field (`join`, `offer`, `answer`, `ice-candidate`, etc.). The server simply forwards each signalling message to the other peer.
3. **WebRTC Peer Connection** – In `app.js`:
   - After receiving a `ready` signal, the first peer creates an **offer**, sends it via the signalling channel, and sets up a data channel.
   - The second peer receives the offer, creates an **answer**, and sends it back.
   - Both peers exchange ICE candidates until the connection is established.
   - Once the `datachannel` is open, chat messages and call signaling (`voice-request`, `voice-accept`, etc.) are sent directly between browsers; the server is no longer involved.
   - For voice calls, local media streams are obtained using `getUserMedia`, and audio tracks are dynamically added to the existing `RTCPeerConnection`, triggering renegotiation.

---

## Customisation

- **Port** – Change `PORT = 8000` inside `server.js` or set the `PORT` environment variable if you need a different port.
- **Room Size** – The server currently limits rooms to two participants (`if (rooms[roomId].size >= 2)`). Adjust the condition in `server.js` if you want larger groups.
- **Styling** – Edit `public/style.css` to modify the colour palette, gradients, or animation timings.
- **Signalling Protocol** – The JSON fields are simple (`action`, `room`, `offer`, `answer`, `candidate`). You can extend them to add authentication, logging, etc.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| "Room is full" message | More than two browsers tried to join the same room. | Use a different room code for additional participants or increase the limit in `server.js`. |
| No ICE candidates exchanged | Firewall or NAT blocking UDP. | Test on a local network first; for public‑internet usage consider TURN server integration (out of scope for this minimal demo). |
| Static files return 404 | `public/` directory moved or missing files. | Ensure `index.html`, `style.css`, and `app.js` reside inside `public/`. |
| Server crashes on restart | Existing socket still bound. | Make sure the previous process is fully stopped (`Ctrl‑C`) or change the port.

---

## License

This project is released under the **MIT License** – you are free to use, modify, and distribute it.

---

## Acknowledgements

- **WebRTC** – Open‑source real‑time communication framework.
- **`ws` & `express`** – Fast, unopinionated, minimalist web framework and WebSocket library for Node.js.
- UI inspiration from modern glass‑morphism design trends.

---

*Happy chatting!*
