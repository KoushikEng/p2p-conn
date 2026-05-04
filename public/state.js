export const state = {
    ws: null,
    peerConnection: null,
    dataChannel: null,
    currentRoom: '',
    isInitiator: false,
    iceCandidatesQueue: [],

    // Voice state
    localStream: null,
    isMuted: false,
    isInCall: false,
    callTimerInterval: null,
    callStartTime: null,
    audioContext: null,
    analyser: null,
    animFrameId: null,

    // Call signaling state
    callState: 'idle',
    ringTimeout: null,
    ringCountdownInterval: null,
    ringSecondsLeft: 30
};

export const RING_DURATION_S = 30;

export const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};
