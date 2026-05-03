// DOM Elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const statusMsg = document.getElementById('status-msg');
const roomDisplay = document.getElementById('room-display');
const connectionStatus = document.getElementById('connection-status');
const chatBox = document.getElementById('chat-box');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');

// State
let ws;
let peerConnection;
let dataChannel;
let currentRoom = '';
let isInitiator = false;
let iceCandidatesQueue = [];

// STUN Servers for WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// Event Listeners
joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function appendSystemMessage(msg) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendMessage(msg, type) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.textContent = msg;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function joinRoom() {
    const room = roomInput.value.trim();
    if (!room) {
        statusMsg.textContent = "Please enter a room code";
        return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = "Connecting...";
    statusMsg.textContent = "";

    // Connect to WebSocket Signaling Server
    // Use window.location.hostname to support both local testing and potential remote
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        currentRoom = room;
        ws.send(JSON.stringify({ action: 'join', room: currentRoom }));
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.action) {
            case 'error':
                statusMsg.textContent = data.message;
                joinBtn.disabled = false;
                joinBtn.textContent = "Join Room";
                ws.close();
                break;
            case 'ready':
                startWebRTC(data.initiator);
                break;
            case 'offer':
                await handleOffer(data.offer);
                break;
            case 'answer':
                await handleAnswer(data.answer);
                break;
            case 'ice-candidate':
                await handleIceCandidate(data.candidate);
                break;
            case 'peer-disconnected':
                appendSystemMessage("Peer disconnected. Waiting for someone to join...");
                resetWebRTC();
                break;
        }
    };

    ws.onerror = () => {
        statusMsg.textContent = "Could not connect to signaling server";
        joinBtn.disabled = false;
        joinBtn.textContent = "Join Room";
    };

    // Assuming we switch UI immediately if no error
    setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            joinScreen.classList.remove('active');
            chatScreen.classList.add('active');
            roomDisplay.textContent = currentRoom;
        }
    }, 500);
}

function startWebRTC(isInitiatorLocal) {
    isInitiator = isInitiatorLocal;
    peerConnection = new RTCPeerConnection(rtcConfig);

    // ICE Candidate generation
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                action: 'ice-candidate',
                candidate: event.candidate
            }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            connectionStatus.textContent = "Connected";
            connectionStatus.className = "status-badge connected";
            messageInput.disabled = false;
            sendBtn.disabled = false;
            appendSystemMessage("Secure connection established.");
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            connectionStatus.textContent = "Disconnected";
            connectionStatus.className = "status-badge disconnected";
            messageInput.disabled = true;
            sendBtn.disabled = true;
        }
    };

    if (isInitiator) {
        // Create Data Channel
        dataChannel = peerConnection.createDataChannel('chat');
        setupDataChannel();

        // Create Offer
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                ws.send(JSON.stringify({
                    action: 'offer',
                    offer: peerConnection.localDescription
                }));
            });
    } else {
        // Wait for Data Channel
        peerConnection.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannel();
        };
    }
}

async function handleOffer(offer) {
    if (!peerConnection) {
        startWebRTC(false);
    }
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({
        action: 'answer',
        answer: peerConnection.localDescription
    }));
    
    // Process queued candidates
    while (iceCandidatesQueue.length > 0) {
        await peerConnection.addIceCandidate(iceCandidatesQueue.shift());
    }
}

async function handleAnswer(answer) {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    
    // Process queued candidates
    while (iceCandidatesQueue.length > 0) {
        await peerConnection.addIceCandidate(iceCandidatesQueue.shift());
    }
}

async function handleIceCandidate(candidate) {
    if (!peerConnection) return;
    if (!peerConnection.remoteDescription) {
        iceCandidatesQueue.push(new RTCIceCandidate(candidate));
    } else {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log("Data Channel is open");
    };

    dataChannel.onmessage = (event) => {
        appendMessage(event.data, 'received');
    };

    dataChannel.onclose = () => {
        console.log("Data Channel closed");
    };
}

function resetWebRTC() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    connectionStatus.textContent = "Waiting...";
    connectionStatus.className = "status-badge connecting";
    messageInput.disabled = true;
    sendBtn.disabled = true;
}

function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg || !dataChannel || dataChannel.readyState !== 'open') return;

    dataChannel.send(msg);
    appendMessage(msg, 'sent');
    messageInput.value = '';
}
