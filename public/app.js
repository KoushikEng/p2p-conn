import { dom } from './dom.js';
import { state } from './state.js';
import { startWebRTC, handleOffer, handleAnswer, handleIceCandidate, resetWebRTC, sendMessage } from './webrtc.js';
import { handleVoiceButtonClick, toggleMute, acceptIncomingCall, denyIncomingCall, cleanupCall } from './voice.js';
import { appendSystemMessage } from './ui.js';

// Event Listeners
dom.joinBtn.addEventListener('click', joinRoom);
dom.roomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

dom.sendBtn.addEventListener('click', sendMessage);
dom.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

dom.voiceCallBtn.addEventListener('click', handleVoiceButtonClick);
dom.voiceMuteBtn.addEventListener('click', toggleMute);
dom.acceptCallBtn.addEventListener('click', acceptIncomingCall);
dom.denyCallBtn.addEventListener('click', denyIncomingCall);

function joinRoom() {
    const room = dom.roomInput.value.trim();
    if (!room) {
        dom.statusMsg.textContent = "Please enter a room code";
        return;
    }

    dom.joinBtn.disabled = true;
    dom.joinBtn.textContent = "Connecting...";
    dom.statusMsg.textContent = "";

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        state.currentRoom = room;
        state.ws.send(JSON.stringify({ action: 'join', room: state.currentRoom }));
    };

    state.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.action) {
            case 'error':
                dom.statusMsg.textContent = data.message;
                dom.joinBtn.disabled = false;
                dom.joinBtn.textContent = "Join Room";
                state.ws.close();
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

    state.ws.onerror = () => {
        dom.statusMsg.textContent = "Could not connect to signaling server";
        dom.joinBtn.disabled = false;
        dom.joinBtn.textContent = "Join Room";
    };

    setTimeout(() => {
        if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
            dom.joinScreen.classList.remove('active');
            dom.chatScreen.classList.add('active');
            dom.roomDisplay.textContent = state.currentRoom;
        }
    }, 500);
}
