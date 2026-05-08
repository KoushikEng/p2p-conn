import { dom } from './dom.js';

export function appendSystemMessage(msg) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = msg;
    dom.chatBox.appendChild(div);
    dom.chatBox.scrollTop = dom.chatBox.scrollHeight;
}

export function appendMessage(msg, type) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.textContent = msg;
    dom.chatBox.appendChild(div);
    dom.chatBox.scrollTop = dom.chatBox.scrollHeight;
}

export function showIncomingCallOverlay() {
    dom.incomingCallOverlay.style.display = 'flex';
}

export function hideIncomingCallOverlay() {
    dom.incomingCallOverlay.style.display = 'none';
}

export function setVoiceBarIdle() {
    dom.voiceCallBtn.classList.remove('active');
    dom.voiceCallLabel.textContent = 'Voice';
    dom.voiceMuteBtn.style.display = 'none';
    dom.voiceMuteBtn.disabled = true;
    dom.voiceMuteBtn.classList.remove('muted');
    dom.micIcon.style.display = 'inline';
    dom.micOffIcon.style.display = 'none';
    dom.voiceStatus.textContent = 'Voice channel ready';
    dom.voiceStatus.className = 'voice-status';
    dom.voiceTimer.style.display = 'none';
    dom.voiceTimer.textContent = '00:00';
    dom.audioVisualizer.style.display = 'none';
}
