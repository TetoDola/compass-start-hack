class LiveCallPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(1600);
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) {
      for (let i = 0; i < channel.length; i++) {
        const value = Math.max(-1, Math.min(1, channel[i]));
        this.buffer[this.offset++] = value < 0 ? value * 32768 : value * 32767;
        if (this.offset === this.buffer.length) {
          this.port.postMessage(this.buffer.buffer, [this.buffer.buffer]);
          this.buffer = new Int16Array(1600);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('live-call-pcm-capture', LiveCallPcmCapture);
