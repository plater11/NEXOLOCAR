let context: AudioContext | undefined;
/** Short scanner beep, started only from a user gesture; sound failure never blocks a sale. */
export function playCartBeep() {
    try {
        context ??= new AudioContext();
        void context.resume().then(() => {
            if (!context) return;
            const tone = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
            tone.type = "sine"; tone.frequency.value = 1800;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(.06, now + .006);
            gain.gain.exponentialRampToValueAtTime(.001, now + .09);
            tone.connect(gain); gain.connect(context.destination);
            tone.start(now); tone.stop(now + .1);
            tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        }).catch(() => {});
    } catch { /* Audio may be unavailable or blocked on the device. */ }
}
