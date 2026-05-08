import { dom } from './dom.js';
import { appendSystemMessage, appendMessage } from './ui.js';
import { state, rtcConfig } from './state.js';
import { handleVoiceSignal, cleanupCall } from './voice.js';

export function startWebRTC(isInitiatorLocal) {
    state.isInitiator = isInitiatorLocal;
    state.peerConnection = new RTCPeerConnection(rtcConfig);

    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            state.ws.send(JSON.stringify({
                action: 'ice-candidate',
                candidate: event.candidate
            }));
        }
    };

    state.peerConnection.onconnectionstatechange = () => {
        if (state.peerConnection.connectionState === 'connected') {
            dom.connectionStatus.textContent = "Connected";
            dom.connectionStatus.className = "status-badge connected";
            dom.messageInput.disabled = false;
            dom.sendBtn.disabled = false;
            dom.voiceCallBtn.disabled = false;
            appendSystemMessage("Secure connection established.");
        } else if (state.peerConnection.connectionState === 'disconnected' || state.peerConnection.connectionState === 'failed') {
            dom.connectionStatus.textContent = "Disconnected";
            dom.connectionStatus.className = "status-badge disconnected";
            dom.messageInput.disabled = true;
            dom.sendBtn.disabled = true;
            dom.voiceCallBtn.disabled = true;
            cleanupCall();
        }
    };

    state.peerConnection.ontrack = (event) => {
        console.log("Received remote audio track");
        dom.remoteAudio.srcObject = event.streams[0];
    };

    state.peerConnection.onnegotiationneeded = async () => {
        if (!state.isInitiator) return;
        try {
            const offer = await state.peerConnection.createOffer();
            await state.peerConnection.setLocalDescription(offer);
            state.ws.send(JSON.stringify({
                action: 'offer',
                offer: state.peerConnection.localDescription
            }));
        } catch (err) {
            console.error("Renegotiation failed:", err);
        }
    };

    if (state.isInitiator) {
        state.dataChannel = state.peerConnection.createDataChannel('chat');
        setupDataChannel();

        state.peerConnection.createOffer()
            .then(offer => state.peerConnection.setLocalDescription(offer))
            .then(() => {
                state.ws.send(JSON.stringify({
                    action: 'offer',
                    offer: state.peerConnection.localDescription
                }));
            });
    } else {
        state.peerConnection.ondatachannel = (event) => {
            state.dataChannel = event.channel;
            setupDataChannel();
        };
    }
}

export async function handleOffer(offer) {
    if (!state.peerConnection) {
        startWebRTC(false);
    }
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);
    state.ws.send(JSON.stringify({
        action: 'answer',
        answer: state.peerConnection.localDescription
    }));

    while (state.iceCandidatesQueue.length > 0) {
        await state.peerConnection.addIceCandidate(state.iceCandidatesQueue.shift());
    }
}

export async function handleAnswer(answer) {
    if (!state.peerConnection) return;
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

    while (state.iceCandidatesQueue.length > 0) {
        await state.peerConnection.addIceCandidate(state.iceCandidatesQueue.shift());
    }
}

export async function handleIceCandidate(candidate) {
    if (!state.peerConnection) return;
    if (!state.peerConnection.remoteDescription) {
        state.iceCandidatesQueue.push(new RTCIceCandidate(candidate));
    } else {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
}

function setupDataChannel() {
    state.dataChannel.onopen = () => {
        console.log("Data Channel is open");
    };

    state.dataChannel.onmessage = (event) => {
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

    state.dataChannel.onclose = () => {
        console.log("Data Channel closed");
    };
}

export function resetWebRTC() {
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    if (state.dataChannel) {
        state.dataChannel.close();
        state.dataChannel = null;
    }
    dom.connectionStatus.textContent = "Waiting...";
    dom.connectionStatus.className = "status-badge connecting";
    dom.messageInput.disabled = true;
    dom.sendBtn.disabled = true;
    dom.voiceCallBtn.disabled = true;
}

export function sendMessage() {
    const msg = dom.messageInput.value.trim();
    if (!msg || !state.dataChannel || state.dataChannel.readyState !== 'open') return;

    state.dataChannel.send(msg);
    appendMessage(msg, 'sent');
    dom.messageInput.value = '';
}
