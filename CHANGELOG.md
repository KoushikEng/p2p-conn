# Changelog

All notable changes to this project will be documented in this file.

## [2026-05-04] - Fixes & Environment Updates
### Fixed
- **Voice Call Cancellation**: Fixed a bug where a caller cancelling an outgoing call would not dismiss the incoming call overlay on the receiver's screen. Introduced a `voice-cancel` signal to properly handle this state.

### Changed
- **Environment**: Updated Dockerfile to use `node:lts-alpine` for a smaller image footprint and explicitly exposed the port using an environment variable.
- **Gitignore**: Refined `.gitignore` rules to ignore all hidden files while preserving `.gitignore` and `.dockerignore`.

## [2026-05-04] - Added Voice Channel with Call Control
### Added
- **P2P Voice Channel**: Full duplex audio support alongside the existing text chat using WebRTC.
- **Call Signaling Protocol**: `voice-request`, `voice-accept`, `voice-deny`, and `voice-end` signals routed over the existing WebRTC data channel.
- **Call State Machine**: Explicit accept/deny logic with a 30-second ring timeout instead of immediate simplex audio connections.
- **Incoming Call UI**: Glass-morphic incoming call overlay featuring a 30-second countdown, ringing animation, and accept/deny buttons.
- **Voice Bar UI**: Real-time call controls including Mute/Unmute, call duration timer, and a status indicator.
- **Audio Visualizer**: Real-time 5-bar visualizer using the Web Audio API (`AnalyserNode`) to reflect local microphone input levels.
