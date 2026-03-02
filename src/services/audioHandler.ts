export class AudioHandler {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sampleRate: number = 24000;

  constructor() {
    // AudioContext will be initialized on first use to comply with browser policies
  }

  private initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRate,
      });
    }
    return this.audioContext;
  }

  async playPCM(base64: string) {
    const ctx = this.initAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Int16Array(len / 2);
    for (let i = 0; i < len; i += 2) {
      bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
    }

    const float32Data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      float32Data[i] = bytes[i] / 32768.0;
    }

    const buffer = this.audioContext.createBuffer(1, float32Data.length, this.sampleRate);
    buffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  stop() {
    this.nextStartTime = 0;
    // In a real app, we'd keep track of sources and stop them
  }

  async getMicrophoneStream(onData: (base64: string) => void) {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 16000
      } 
    });
    const audioContext = new AudioContext({ sampleRate: 16000 });
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
      }
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
      onData(base64);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    return () => {
      stream.getTracks().forEach(t => t.stop());
      processor.disconnect();
      source.disconnect();
      audioContext.close();
    };
  }
}
