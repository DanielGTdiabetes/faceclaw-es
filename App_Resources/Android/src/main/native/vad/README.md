# WebRTC VAD

Vendored unchanged `cbits/webrtc` from https://github.com/wiseman/py-webrtcvad
commit `e283ca41df3a84b0e87fb1f5cb9b21580a286b09`, plus its LICENSE.
The wrapper is Faceclaw code. No Python runtime or neural model is used.

16 kHz PCM, 30 ms frames, mode 1, at least six positive frames per Whisper
window. Runs before conditioning and decoding, on the ASR worker. A rejected
window increments `rejectedNoVoice`, without counting a Whisper decode.
Failure to load the library preserves audio and appears as `vad=unavailable`
in the runtime diagnostic. This detects speech presence, not language, intent,
speaker identity or whether the voice comes from a television.
