import { dom } from './dom.js';
import { appendSystemMessage, showIncomingCallOverlay, hideIncomingCallOverlay, setVoiceBarIdle } from './ui.js';
import { state, RING_DURATION_S } from './state.js';

export function sendVoiceSignal(type) {
    if (!state.dataChannel || state.dataChannel.readyState !== 'open') return;
    state.dataChannel.send(JSON.stringify({ __voice: true, type }));
}

export function handleVoiceSignal(signal) {
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
            if (state.callState === 'incoming-ringing') {
                clearRinging();
                hideIncomingCallOverlay();
                setVoiceBarIdle();
                state.callState = 'idle';
                appendSystemMessage("Call timed out.");
            }
            break;
        case 'voice-cancel':
            if (state.callState === 'incoming-ringing') {
                clearRinging();
                hideIncomingCallOverlay();
                setVoiceBarIdle();
                state.callState = 'idle';
                appendSystemMessage("Call cancelled by peer.");
            }
            break;
    }
}

export function handleVoiceButtonClick() {
    if (state.callState === 'idle') {
        initiateCall();
    } else if (state.callState === 'outgoing-ringing') {
        cancelOutgoingCall();
    } else if (state.callState === 'active') {
        endActiveCall();
    }
}

function initiateCall() {
    if (!state.peerConnection || state.peerConnection.connectionState !== 'connected') {
        appendSystemMessage("Cannot call — not connected to peer.");
        return;
    }

    state.callState = 'outgoing-ringing';
    sendVoiceSignal('voice-request');

    dom.voiceCallBtn.classList.add('active');
    dom.voiceCallLabel.textContent = 'Cancel';
    dom.voiceStatus.textContent = 'Calling...';
    dom.voiceStatus.className = 'voice-status ringing';

    appendSystemMessage("Calling peer...");

    startRingTimer(() => {
        sendVoiceSignal('voice-timeout');
        state.callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("No answer — call timed out.");
    });
}

function cancelOutgoingCall() {
    sendVoiceSignal('voice-cancel');
    clearRinging();
    state.callState = 'idle';
    setVoiceBarIdle();
    appendSystemMessage("Call cancelled.");
}

function onCallAcceptedByPeer() {
    if (state.callState !== 'outgoing-ringing') return;
    clearRinging();
    state.callState = 'active';
    startDuplexAudio();
    appendSystemMessage("Call connected!");
}

function onCallDeniedByPeer() {
    if (state.callState !== 'outgoing-ringing') return;
    clearRinging();
    state.callState = 'idle';
    setVoiceBarIdle();
    appendSystemMessage("Call declined by peer.");
}

function onIncomingCallRequest() {
    if (state.callState !== 'idle') {
        sendVoiceSignal('voice-deny');
        return;
    }

    state.callState = 'incoming-ringing';
    showIncomingCallOverlay();
    appendSystemMessage("Incoming voice call...");

    startRingTimer(() => {
        sendVoiceSignal('voice-deny');
        hideIncomingCallOverlay();
        state.callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("Missed call — auto-declined after 30s.");
    });
}

export function acceptIncomingCall() {
    if (state.callState !== 'incoming-ringing') return;
    clearRinging();
    hideIncomingCallOverlay();
    state.callState = 'active';
    sendVoiceSignal('voice-accept');
    startDuplexAudio();
    appendSystemMessage("Call connected!");
}

export function denyIncomingCall() {
    if (state.callState !== 'incoming-ringing') return;
    clearRinging();
    hideIncomingCallOverlay();
    state.callState = 'idle';
    setVoiceBarIdle();
    sendVoiceSignal('voice-deny');
    appendSystemMessage("Call declined.");
}

function endActiveCall() {
    sendVoiceSignal('voice-end');
    teardownAudio();
    state.callState = 'idle';
    setVoiceBarIdle();
    appendSystemMessage("Voice call ended.");
}

function onPeerEndedCall() {
    if (state.callState === 'active') {
        teardownAudio();
        state.callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("Peer ended the call.");
    } else if (state.callState === 'outgoing-ringing') {
        clearRinging();
        state.callState = 'idle';
        setVoiceBarIdle();
        appendSystemMessage("Peer ended the call.");
    }
}

export function cleanupCall() {
    clearRinging();
    hideIncomingCallOverlay();
    teardownAudio();
    state.callState = 'idle';
    setVoiceBarIdle();
}

function startRingTimer(onExpire) {
    state.ringSecondsLeft = RING_DURATION_S;
    updateRingCountdownDisplay();

    state.ringCountdownInterval = setInterval(() => {
        state.ringSecondsLeft--;
        updateRingCountdownDisplay();
    }, 1000);

    state.ringTimeout = setTimeout(() => {
        clearRinging();
        onExpire();
    }, RING_DURATION_S * 1000);
}

function clearRinging() {
    if (state.ringTimeout) {
        clearTimeout(state.ringTimeout);
        state.ringTimeout = null;
    }
    if (state.ringCountdownInterval) {
        clearInterval(state.ringCountdownInterval);
        state.ringCountdownInterval = null;
    }
}

function updateRingCountdownDisplay() {
    dom.ringCountdown.textContent = `${state.ringSecondsLeft}s`;
}

async function startDuplexAudio() {
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
        console.error("Microphone access denied:", err);
        appendSystemMessage("Microphone access denied. Call connected but you cannot send audio.");
    }

    if (state.localStream && state.peerConnection) {
        state.localStream.getTracks().forEach(track => {
            state.peerConnection.addTrack(track, state.localStream);
        });
    }

    state.isInCall = true;
    state.isMuted = false;

    dom.voiceCallBtn.classList.add('active');
    dom.voiceCallLabel.textContent = 'End';
    dom.voiceMuteBtn.style.display = 'flex';
    dom.voiceMuteBtn.disabled = false;
    dom.voiceStatus.textContent = 'In call';
    dom.voiceStatus.className = 'voice-status active';
    dom.voiceTimer.style.display = 'block';
    dom.audioVisualizer.style.display = 'flex';

    state.callStartTime = Date.now();
    state.callTimerInterval = setInterval(updateCallTimer, 1000);

    startAudioVisualizer();
}

function teardownAudio() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
        state.localStream = null;
    }

    if (state.peerConnection) {
        const senders = state.peerConnection.getSenders();
        senders.forEach(sender => {
            if (sender.track && sender.track.kind === 'audio') {
                state.peerConnection.removeTrack(sender);
            }
        });
    }

    stopAudioVisualizer();

    if (state.callTimerInterval) {
        clearInterval(state.callTimerInterval);
        state.callTimerInterval = null;
    }

    state.isInCall = false;
    state.isMuted = false;

    dom.remoteAudio.srcObject = null;
}

export function toggleMute() {
    if (!state.localStream) return;

    state.isMuted = !state.isMuted;
    state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !state.isMuted;
    });

    if (state.isMuted) {
        dom.voiceMuteBtn.classList.add('muted');
        dom.micIcon.style.display = 'none';
        dom.micOffIcon.style.display = 'inline';
        dom.voiceMuteBtn.title = 'Unmute Microphone';
    } else {
        dom.voiceMuteBtn.classList.remove('muted');
        dom.micIcon.style.display = 'inline';
        dom.micOffIcon.style.display = 'none';
        dom.voiceMuteBtn.title = 'Mute Microphone';
    }
}

function updateCallTimer() {
    if (!state.callStartTime) return;
    const elapsed = Math.floor((Date.now() - state.callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    dom.voiceTimer.textContent = `${mins}:${secs}`;
}

function startAudioVisualizer() {
    if (!state.localStream) return;

    try {
        state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        state.analyser = state.audioContext.createAnalyser();
        state.analyser.fftSize = 64;
        state.analyser.smoothingTimeConstant = 0.8;

        const source = state.audioContext.createMediaStreamSource(state.localStream);
        source.connect(state.analyser);

        const vizBars = dom.audioVisualizer.querySelectorAll('.viz-bar');
        const dataArray = new Uint8Array(state.analyser.frequencyBinCount);

        function draw() {
            state.analyser.getByteFrequencyData(dataArray);

            const step = Math.floor(dataArray.length / vizBars.length);
            vizBars.forEach((bar, i) => {
                const value = dataArray[i * step] || 0;
                const height = Math.max(3, (value / 255) * 24);
                bar.style.height = `${height}px`;
            });

            state.animFrameId = requestAnimationFrame(draw);
        }

        draw();
    } catch (err) {
        console.error("Audio visualizer error:", err);
    }
}

function stopAudioVisualizer() {
    if (state.animFrameId) {
        cancelAnimationFrame(state.animFrameId);
        state.animFrameId = null;
    }
    if (state.audioContext) {
        state.audioContext.close().catch(() => {});
        state.audioContext = null;
        state.analyser = null;
    }

    const vizBars = dom.audioVisualizer.querySelectorAll('.viz-bar');
    vizBars.forEach(bar => {
        bar.style.height = '3px';
    });
}
