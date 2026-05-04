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

// Voice DOM Elements
const voiceCallBtn = document.getElementById('voice-call-btn');
const voiceCallLabel = document.getElementById('voice-call-label');
const voiceMuteBtn = document.getElementById('voice-mute-btn');
const micIcon = document.getElementById('mic-icon');
const micOffIcon = document.getElementById('mic-off-icon');
const voiceStatus = document.getElementById('voice-status');
const voiceTimer = document.getElementById('voice-timer');
const audioVisualizer = document.getElementById('audio-visualizer');
const remoteAudio = document.getElementById('remote-audio');

// Incoming call overlay DOM
const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const ringCountdown = document.getElementById('ring-countdown');
const acceptCallBtn = document.getElementById('accept-call-btn');
const denyCallBtn = document.getElementById('deny-call-btn');

// State
let ws;
let peerConnection;
let dataChannel;
let currentRoom = '';
let isInitiator = false;
let iceCandidatesQueue = [];

// Voice state
let localStream = null;
let isMuted = false;
let isInCall = false;
let callTimerInterval = null;
let callStartTime = null;
let audioContext = null;
let analyser = null;
let animFrameId = null;

// Call signaling state
// 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'active'
let callState = 'idle';
let ringTimeout = null;       // 30s auto-decline timer
let ringCountdownInterval = null;
let ringSecondsLeft = 30;
const RING_DURATION_S = 30;

// STUN Servers for WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
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

voiceCallBtn.addEventListener('click', handleVoiceButtonClick);
voiceMuteBtn.addEventListener('click', toggleMute);
acceptCallBtn.addEventListener('click', acceptIncomingCall);
denyCallBtn.addEventListener('click', denyIncomingCall);

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
                cleanupCall();
                resetWebRTC();
                break;
        }
    };

    ws.onerror = () => {
        statusMsg.textContent = "Could not connect to signaling server";
        joinBtn.disabled = false;
        joinBtn.textContent = "Join Room";
    };

    // Switch UI
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
            voiceCallBtn.disabled = false;
            appendSystemMessage("Secure connection established.");
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            connectionStatus.textContent = "Disconnected";
            connectionStatus.className = "status-badge disconnected";
            messageInput.disabled = true;
            sendBtn.disabled = true;
            voiceCallBtn.disabled = true;
            cleanupCall();
        }
    };

    // Handle incoming audio tracks from remote peer
    peerConnection.ontrack = (event) => {
        console.log("Received remote audio track");
        remoteAudio.srcObject = event.streams[0];
    };

    // Handle renegotiation (needed when audio tracks are added mid-session)
    peerConnection.onnegotiationneeded = async () => {
        if (!isInitiator) return;
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            ws.send(JSON.stringify({
                action: 'offer',
                offer: peerConnection.localDescription
            }));
        } catch (err) {
            console.error("Renegotiation failed:", err);
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

// ==================== Data Channel Setup ====================
// Messages are now either plain text chat or JSON voice-signal objects.
// We distinguish by attempting JSON parse; if it has a `__voice` field it's a signal.

function setupDataChannel() {
    dataChannel.onopen = () => {
        console.log("Data Channel is open");
    };

    dataChannel.onmessage = (event) => {
        let parsed = null;
        try {
            parsed = JSON.parse(event.data);
        } catch (_) { /* not JSON, treat as chat */ }

        if (parsed && parsed.__voice) {
            handleVoiceSignal(parsed);
        } else {
            appendMessage(event.data, 'received');
        }
    };

    dataChannel.onclose = () => {
        console.log("Data Channel closed");
    };
}

function sendVoiceSignal(type) {
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    dataChannel.send(JSON.stringify({ __voice: true, type }));
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
    voiceCallBtn.disabled = true;
}

function sendMessage() {
    const msg = messageInput.value.trim();
    if (!msg || !dataChannel || dataChannel.readyState !== 'open') return;

    dataChannel.send(msg);
    appendMessage(msg, 'sent');
    messageInput.value = '';
}

// ==================== Voice Call Signaling ====================
// Protocol over data channel:
//   voice-request   — caller sends to callee
//   voice-accept    — callee accepts
//   voice-deny      — callee declines
//   voice-end       — either side ends the call
//   voice-timeout   — caller's ring expired (informational)

function handleVoiceSignal(signal) {
    switch (signal.type) {
        case 'voice-request':
            onIncomingCallRequest();
            break;
        case 'voice-accept':
            onCallAcceptedByPeer();
            break;
        case 'voice-deny':
            onCallDeniedByPeer();
            break;
        case 'voice-end':
            onPeerEndedCall();
            break;
        case 'voice-timeout':
            // Peer's ring timed out — same as deny from our perspective
            if (callState === 'incoming-ringing') {
                clearRinging();
                hideIncomingCallOverlay();
                setVoiceBarIdle();
                callState = 'idle';
                appendSystemMessage("Call timed out.");
            }
            break;
    }
}

// ---- Caller side ----

function handleVoiceButtonClick() {
    if (callState === 'idle') {
        initiateCall();
    } else if (callState === 'outgoing-ringing') {
        cancelOutgoingCall();
    } else if (callState === 'active') {
        endActiveCall();
    }
}

function initiateCall() {
    if (!peerConnection || peerConnection.connectionState !== 'connected') {
        appendSystemMessage("Cannot call — not connected to peer.");
        return;
    }

    callState = 'outgoing-ringing';
    sendVoiceSignal('voice-request');

    // Update voice bar to "Calling..." state
    voiceCallBtn.classList.add('active');
    voiceCallLabel.textContent = 'Cancel';
    voiceStatus.textContent = 'Calling...';
    voiceStatus.className = 'voice-status ringing';

    appendSystemMessage("Calling peer...");

    // Start 30s ring timeout
    startRingTimer(() => {
        // Ring expired on caller side
        sendVoiceSignal('voice-timeout');
        callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("No answer — call timed out.");
    });
}

function cancelOutgoingCall() {
    sendVoiceSignal('voice-deny'); // re-use deny to tell peer to stop ringing
    clearRinging();
    callState = 'idle';
    setVoiceBarIdle();
    appendSystemMessage("Call cancelled.");
}

function onCallAcceptedByPeer() {
    if (callState !== 'outgoing-ringing') return;
    clearRinging();
    callState = 'active';
    startDuplexAudio();
    appendSystemMessage("Call connected!");
}

function onCallDeniedByPeer() {
    if (callState !== 'outgoing-ringing') return;
    clearRinging();
    callState = 'idle';
    setVoiceBarIdle();
    appendSystemMessage("Call declined by peer.");
}

// ---- Callee side ----

function onIncomingCallRequest() {
    if (callState !== 'idle') {
        // Already in a call or ringing — auto-deny
        sendVoiceSignal('voice-deny');
        return;
    }

    callState = 'incoming-ringing';
    showIncomingCallOverlay();
    appendSystemMessage("Incoming voice call...");

    // Start 30s ring timeout (auto-deny)
    startRingTimer(() => {
        sendVoiceSignal('voice-deny');
        hideIncomingCallOverlay();
        callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("Missed call — auto-declined after 30s.");
    });
}

function acceptIncomingCall() {
    if (callState !== 'incoming-ringing') return;
    clearRinging();
    hideIncomingCallOverlay();
    callState = 'active';
    sendVoiceSignal('voice-accept');
    startDuplexAudio();
    appendSystemMessage("Call connected!");
}

function denyIncomingCall() {
    if (callState !== 'incoming-ringing') return;
    clearRinging();
    hideIncomingCallOverlay();
    callState = 'idle';
    setVoiceBarIdle();
    sendVoiceSignal('voice-deny');
    appendSystemMessage("Call declined.");
}

// ---- Shared call control ----

function endActiveCall() {
    sendVoiceSignal('voice-end');
    teardownAudio();
    callState = 'idle';
    setVoiceBarIdle();
    appendSystemMessage("Voice call ended.");
}

function onPeerEndedCall() {
    if (callState === 'active') {
        teardownAudio();
        callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("Peer ended the call.");
    } else if (callState === 'outgoing-ringing') {
        // Peer sent end while we were ringing (shouldn't normally happen, but handle)
        clearRinging();
        callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("Peer ended the call.");
    }
}

/**
 * Full cleanup — called when peer disconnects or WebRTC drops.
 * Handles any call state gracefully.
 */
function cleanupCall() {
    clearRinging();
    hideIncomingCallOverlay();
    teardownAudio();
    callState = 'idle';
    setVoiceBarIdle();
}

// ==================== Ring Timer ====================

function startRingTimer(onExpire) {
    ringSecondsLeft = RING_DURATION_S;
    updateRingCountdownDisplay();

    ringCountdownInterval = setInterval(() => {
        ringSecondsLeft--;
        updateRingCountdownDisplay();
    }, 1000);

    ringTimeout = setTimeout(() => {
        clearRinging();
        onExpire();
    }, RING_DURATION_S * 1000);
}

function clearRinging() {
    if (ringTimeout) {
        clearTimeout(ringTimeout);
        ringTimeout = null;
    }
    if (ringCountdownInterval) {
        clearInterval(ringCountdownInterval);
        ringCountdownInterval = null;
    }
}

function updateRingCountdownDisplay() {
    ringCountdown.textContent = `${ringSecondsLeft}s`;
}

// ==================== Incoming Call Overlay ====================

function showIncomingCallOverlay() {
    incomingCallOverlay.style.display = 'flex';
}

function hideIncomingCallOverlay() {
    incomingCallOverlay.style.display = 'none';
}

// ==================== Audio Track Management ====================

/**
 * Start full duplex audio: capture mic, add tracks to peer connection,
 * and switch UI to active call state.
 */
async function startDuplexAudio() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        console.error("Microphone access denied:", err);
        appendSystemMessage("Microphone access denied. Call connected but you cannot send audio.");
        // Still allow the call to proceed (one-way audio from peer)
    }

    // Add local audio tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    isInCall = true;
    isMuted = false;

    // Update voice bar UI to active call
    voiceCallBtn.classList.add('active');
    voiceCallLabel.textContent = 'End';
    voiceMuteBtn.style.display = 'flex';
    voiceMuteBtn.disabled = false;
    voiceStatus.textContent = 'In call';
    voiceStatus.className = 'voice-status active';
    voiceTimer.style.display = 'block';
    audioVisualizer.style.display = 'flex';

    // Start call timer
    callStartTime = Date.now();
    callTimerInterval = setInterval(updateCallTimer, 1000);

    // Start audio visualizer
    startAudioVisualizer();
}

/**
 * Tear down audio: stop mic, remove senders, reset UI.
 */
function teardownAudio() {
    // Stop local audio tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Remove audio senders from peer connection
    if (peerConnection) {
        const senders = peerConnection.getSenders();
        senders.forEach(sender => {
            if (sender.track && sender.track.kind === 'audio') {
                peerConnection.removeTrack(sender);
            }
        });
    }

    // Stop visualizer
    stopAudioVisualizer();

    // Stop call timer
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }

    isInCall = false;
    isMuted = false;

    // Clear remote audio
    remoteAudio.srcObject = null;
}

/**
 * Reset voice bar to idle visual state.
 */
function setVoiceBarIdle() {
    voiceCallBtn.classList.remove('active');
    voiceCallLabel.textContent = 'Voice';
    voiceMuteBtn.style.display = 'none';
    voiceMuteBtn.disabled = true;
    voiceMuteBtn.classList.remove('muted');
    micIcon.style.display = 'inline';
    micOffIcon.style.display = 'none';
    voiceStatus.textContent = 'Voice channel ready';
    voiceStatus.className = 'voice-status';
    voiceTimer.style.display = 'none';
    voiceTimer.textContent = '00:00';
    audioVisualizer.style.display = 'none';
}

// ==================== Mute / Timer / Visualizer ====================

function toggleMute() {
    if (!localStream) return;

    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });

    if (isMuted) {
        voiceMuteBtn.classList.add('muted');
        micIcon.style.display = 'none';
        micOffIcon.style.display = 'inline';
        voiceMuteBtn.title = 'Unmute Microphone';
    } else {
        voiceMuteBtn.classList.remove('muted');
        micIcon.style.display = 'inline';
        micOffIcon.style.display = 'none';
        voiceMuteBtn.title = 'Mute Microphone';
    }
}

function updateCallTimer() {
    if (!callStartTime) return;
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    voiceTimer.textContent = `${mins}:${secs}`;
}

// Audio Visualizer using Web Audio API
function startAudioVisualizer() {
    if (!localStream) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.8;

        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyser);

        const vizBars = audioVisualizer.querySelectorAll('.viz-bar');
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function draw() {
            analyser.getByteFrequencyData(dataArray);

            const step = Math.floor(dataArray.length / vizBars.length);
            vizBars.forEach((bar, i) => {
                const value = dataArray[i * step] || 0;
                const height = Math.max(3, (value / 255) * 24);
                bar.style.height = `${height}px`;
            });

            animFrameId = requestAnimationFrame(draw);
        }

        draw();
    } catch (err) {
        console.error("Audio visualizer error:", err);
    }
}

function stopAudioVisualizer() {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
        analyser = null;
    }

    // Reset bar heights
    const vizBars = audioVisualizer.querySelectorAll('.viz-bar');
    vizBars.forEach(bar => {
        bar.style.height = '3px';
    });
}
