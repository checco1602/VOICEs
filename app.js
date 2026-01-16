class ZenAudioProcessor {
    constructor() {
        // Audio contexts
        this.audioContext = null;
        this.analyser = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.stream = null;

        // State
        this.isRecording = false;
        this.isPlaying = false;
        this.recordingStartTime = 0;
        this.recordingDuration = 0;
        this.timerInterval = null;

        // Audio processing
        this.audioBuffer = null;
        this.zenAudioBuffer = null;
        this.sourceNode = null;

        // Visualizer
        this.canvas = document.getElementById('visualizer');
        this.canvasCtx = this.canvas.getContext('2d');
        this.animationId = null;

        // DOM elements
        this.recordBtn = document.getElementById('recordBtn');
        this.playBtn = document.getElementById('playBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.timerDisplay = document.getElementById('timer');
        this.statusText = document.getElementById('statusText');

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.startVisualizerIdle();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.canvasCtx.scale(dpr, dpr);

        this.canvasWidth = rect.width;
        this.canvasHeight = rect.height;
    }

    setupEventListeners() {
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.playBtn.addEventListener('click', () => this.playZenAudio());
        this.downloadBtn.addEventListener('click', () => this.downloadZenAudio());

        window.addEventListener('resize', () => {
            this.setupCanvas();
        });
    }

    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Initialize audio context
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Setup analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            const source = this.audioContext.createMediaStreamSource(this.stream);
            source.connect(this.analyser);

            // Setup media recorder
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.recordedChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                await this.processRecording(blob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            // Update UI
            this.recordBtn.classList.add('recording');
            this.recordBtn.querySelector('.btn-text').textContent = 'Stop';
            this.updateStatus('Recording...');

            // Start timer
            this.startTimer();

            // Start visualizer
            this.startVisualizer();

        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Failed to access microphone. Please grant microphone permissions.');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;

            // Stop all tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            // Update UI
            this.recordBtn.classList.remove('recording');
            this.recordBtn.querySelector('.btn-text').textContent = 'Record';
            this.updateStatus('Processing...');

            // Stop timer
            this.stopTimer();
            this.recordingDuration = Date.now() - this.recordingStartTime;
        }
    }

    async processRecording(blob) {
        try {
            const arrayBuffer = await blob.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Transform to zen audio
            this.zenAudioBuffer = await this.transformToZenAudio(this.audioBuffer);

            // Enable play and download buttons
            this.playBtn.disabled = false;
            this.downloadBtn.disabled = false;

            this.updateStatus('Ready');

        } catch (error) {
            console.error('Error processing recording:', error);
            this.updateStatus('Error processing audio', 'error');
        }
    }

    async transformToZenAudio(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numberOfChannels = 2;

        // Create new buffer for zen audio
        const zenBuffer = this.audioContext.createBuffer(
            numberOfChannels,
            Math.floor(duration * sampleRate),
            sampleRate
        );

        // Get original audio data
        const originalData = audioBuffer.getChannelData(0);

        // Analyze amplitude envelope and pitch
        const envelopeData = this.extractEnvelope(originalData, sampleRate);
        const pitchData = this.analyzePitch(originalData, sampleRate);

        // Generate ambient/chill sounds based on envelope
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const zenData = zenBuffer.getChannelData(channel);
            const channelOffset = channel * 0.05; // Slight stereo variation

            // Ambient musical layers
            this.addAmbientPad(zenData, envelopeData, pitchData, sampleRate, 0.20, channelOffset);
            this.addSoftSynth(zenData, envelopeData, pitchData, sampleRate, 0.15, channelOffset);
            this.addGentlePiano(zenData, envelopeData, pitchData, sampleRate, 0.12, channelOffset);
            this.addReverbTail(zenData, envelopeData, sampleRate, 0.10);
            this.addSubBass(zenData, envelopeData, pitchData, sampleRate, 0.08);
            this.addShimmer(zenData, envelopeData, sampleRate, 0.06, channelOffset);

            // Apply overall envelope for natural breathing
            for (let i = 0; i < zenData.length; i++) {
                const envIndex = Math.floor(i / (zenData.length / envelopeData.length));
                const envValue = envelopeData[Math.min(envIndex, envelopeData.length - 1)];
                zenData[i] *= Math.pow(envValue, 0.5) * 0.75; // Smooth curve, prevent clipping
            }
        }

        return zenBuffer;
    }

    extractEnvelope(audioData, sampleRate, windowSize = 2048) {
        const hopSize = windowSize / 4;
        const numWindows = Math.floor((audioData.length - windowSize) / hopSize);
        const envelope = new Float32Array(numWindows);

        for (let i = 0; i < numWindows; i++) {
            const startIdx = i * hopSize;
            let sum = 0;

            for (let j = 0; j < windowSize; j++) {
                sum += Math.abs(audioData[startIdx + j]);
            }

            envelope[i] = sum / windowSize;
        }

        // Smooth the envelope
        return this.smoothData(envelope, 5);
    }

    smoothData(data, windowSize) {
        const smoothed = new Float32Array(data.length);

        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let count = 0;

            for (let j = -windowSize; j <= windowSize; j++) {
                const idx = i + j;
                if (idx >= 0 && idx < data.length) {
                    sum += data[idx];
                    count++;
                }
            }

            smoothed[i] = sum / count;
        }

        return smoothed;
    }

    analyzePitch(audioData, sampleRate) {
        const windowSize = 2048;
        const hopSize = windowSize / 4;
        const numWindows = Math.floor((audioData.length - windowSize) / hopSize);
        const pitchData = new Float32Array(numWindows);

        for (let i = 0; i < numWindows; i++) {
            const startIdx = i * hopSize;

            // Simple zero-crossing rate for pitch estimation
            let crossings = 0;
            for (let j = 1; j < windowSize; j++) {
                if ((audioData[startIdx + j - 1] >= 0 && audioData[startIdx + j] < 0) ||
                    (audioData[startIdx + j - 1] < 0 && audioData[startIdx + j] >= 0)) {
                    crossings++;
                }
            }

            // Estimate fundamental frequency
            pitchData[i] = (crossings / 2) * (sampleRate / windowSize);
        }

        return this.smoothData(pitchData, 3);
    }

    addAmbientPad(outputData, envelope, pitchData, sampleRate, amplitude, offset = 0) {
        // Soft, evolving pad sounds with harmonic progressions
        const chordProgression = [
            [220, 277.18, 329.63], // Am (A, C, E)
            [196, 246.94, 293.66], // G (G, B, D)
            [261.63, 329.63, 392],  // C (C, E, G)
            [220, 277.18, 329.63]   // Am (A, C, E)
        ];

        let currentChordIndex = 0;
        const chordDuration = outputData.length / chordProgression.length;

        for (let i = 0; i < outputData.length; i++) {
            const t = i / sampleRate;
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];

            // Change chord based on position
            currentChordIndex = Math.floor(i / chordDuration);
            const chord = chordProgression[currentChordIndex];

            // Generate soft pad from chord
            let padSample = 0;
            chord.forEach((freq, idx) => {
                const phase = 2 * Math.PI * freq * t;
                // Multiple oscillators for richness
                padSample += Math.sin(phase) * 0.3;
                padSample += Math.sin(phase * 1.01) * 0.2; // Slight detune
                padSample += Math.sin(phase * 2) * 0.15; // Harmonic
            });

            // Slow LFO for movement
            const lfo = Math.sin(2 * Math.PI * 0.2 * t + offset) * 0.3 + 0.7;

            outputData[i] += padSample * amplitude * envValue * lfo;
        }
    }

    addSoftSynth(outputData, envelope, pitchData, sampleRate, amplitude, offset = 0) {
        // Gentle melodic synth that follows pitch
        for (let i = 0; i < outputData.length; i++) {
            const t = i / sampleRate;
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];
            const pitchIndex = Math.min(envIndex, pitchData.length - 1);
            const basePitch = pitchData[pitchIndex];

            // Map pitch to pentatonic scale (more pleasant)
            const pentatonicRatios = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
            const scaleNote = pentatonicRatios[Math.floor((basePitch / 50) % pentatonicRatios.length)];
            const targetFreq = 220 * scaleNote; // A3 as base

            // Generate soft synth tone
            const phase = 2 * Math.PI * targetFreq * t;
            const fundamental = Math.sin(phase);
            const harmonic2 = Math.sin(phase * 2) * 0.3;
            const harmonic3 = Math.sin(phase * 3) * 0.15;

            // Gentle envelope
            const attack = Math.min(1, (i % (sampleRate * 0.5)) / (sampleRate * 0.1));

            const synthSample = (fundamental + harmonic2 + harmonic3) * attack;

            outputData[i] += synthSample * amplitude * envValue;
        }
    }

    addGentlePiano(outputData, envelope, pitchData, sampleRate, amplitude, offset = 0) {
        // Piano-like bell tones triggered on voice peaks
        for (let i = 0; i < outputData.length; i++) {
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];
            const pitchIndex = Math.min(envIndex, pitchData.length - 1);
            const pitch = pitchData[pitchIndex];

            // Trigger note on voice peaks
            if (envValue > 0.4 && Math.random() < 0.001 * envValue) {
                const noteDuration = 2.0 + Math.random(); // 2-3s
                const noteSamples = Math.floor(noteDuration * sampleRate);

                // Pentatonic scale frequencies
                const scale = [261.63, 293.66, 329.63, 392, 440, 523.25]; // C D E G A C
                const freq = scale[Math.floor(Math.random() * scale.length)];

                for (let j = 0; j < noteSamples && (i + j) < outputData.length; j++) {
                    const t = j / sampleRate;
                    const decay = Math.exp(-t * 1.2);

                    // Piano-like timbre with inharmonicity
                    const phase = 2 * Math.PI * freq * t;
                    let pianoSample = Math.sin(phase) * 0.6;
                    pianoSample += Math.sin(phase * 2.01) * 0.3 * decay;
                    pianoSample += Math.sin(phase * 3.02) * 0.15 * decay;
                    pianoSample += Math.sin(phase * 4.03) * 0.08 * decay;

                    outputData[i + j] += pianoSample * amplitude * decay * envValue;
                }
            }
        }
    }

    addReverbTail(outputData, envelope, sampleRate, amplitude) {
        // Simulated reverb using multiple delays
        const delayTimes = [0.037, 0.053, 0.079, 0.097]; // Reverb delays in seconds
        const feedback = 0.5;

        for (let i = 0; i < outputData.length; i++) {
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];

            // Get current sample
            const currentSample = outputData[i];

            // Add delayed versions for reverb effect
            delayTimes.forEach((delayTime, idx) => {
                const delaySamples = Math.floor(delayTime * sampleRate);
                const delayIndex = i - delaySamples;

                if (delayIndex >= 0) {
                    const delayedSample = outputData[delayIndex];
                    outputData[i] += delayedSample * amplitude * feedback * Math.pow(0.8, idx);
                }
            });
        }
    }

    addSubBass(outputData, envelope, pitchData, sampleRate, amplitude) {
        // Deep sub bass drone
        let phase = 0;

        for (let i = 0; i < outputData.length; i++) {
            const t = i / sampleRate;
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];
            const pitchIndex = Math.min(envIndex, pitchData.length - 1);
            const bassPitch = pitchData[pitchIndex];

            // Sub bass frequency (55-110 Hz range)
            const freq = 55 + (bassPitch / 300) * 55;

            // Sine wave bass with slight modulation
            phase = 2 * Math.PI * freq * t;
            const lfo = Math.sin(2 * Math.PI * 0.1 * t) * 0.2 + 0.8;

            const bassSample = Math.sin(phase) * lfo;

            outputData[i] += bassSample * amplitude * envValue;
        }
    }

    addShimmer(outputData, envelope, sampleRate, amplitude, offset = 0) {
        // High frequency shimmer/sparkle
        for (let i = 0; i < outputData.length; i++) {
            const t = i / sampleRate;
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];

            // Random sparkles
            if (Math.random() < 0.005 * envValue) {
                const shimmerDuration = 0.1 + Math.random() * 0.2;
                const shimmerSamples = Math.floor(shimmerDuration * sampleRate);
                const freq = 2000 + Math.random() * 2000; // 2-4kHz range

                for (let j = 0; j < shimmerSamples && (i + j) < outputData.length; j++) {
                    const shimmerT = j / shimmerSamples;
                    const decay = Math.exp(-shimmerT * 10);
                    const envelope = Math.sin(shimmerT * Math.PI);
                    const phase = 2 * Math.PI * freq * (j / sampleRate);

                    outputData[i + j] += Math.sin(phase) * amplitude * decay * envelope * envValue;
                }
            }
        }
    }

    addRaindrops(outputData, envelope, sampleRate, amplitude) {
        // Minimal raindrop effect - keeping ambient not noisy
        for (let i = 0; i < outputData.length; i++) {
            const envIndex = Math.floor((i / outputData.length) * envelope.length);
            const envValue = envelope[Math.min(envIndex, envelope.length - 1)];

            // Random raindrops
            if (Math.random() < 0.0005 * envValue) {
                const dropLength = Math.floor(sampleRate * 0.05); // 50ms drops

                for (let j = 0; j < dropLength && (i + j) < outputData.length; j++) {
                    const decay = Math.exp(-j / (dropLength * 0.3));
                    const drop = (Math.random() - 0.5) * amplitude * decay * envValue;
                    outputData[i + j] += drop;
                }
            }
        }
    }

    playZenAudio() {
        if (this.isPlaying) {
            this.stopPlayback();
            return;
        }

        if (!this.zenAudioBuffer) return;

        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.zenAudioBuffer;

        // Setup analyser for visualization
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;

        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioContext.destination);

        this.sourceNode.onended = () => {
            this.stopPlayback();
        };

        this.sourceNode.start();
        this.isPlaying = true;

        // Update UI
        this.playBtn.querySelector('.btn-text').textContent = 'Stop';
        this.updateStatus('Playing...');

        // Start visualizer
        this.startVisualizer();
    }

    stopPlayback() {
        if (this.sourceNode) {
            this.sourceNode.stop();
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        this.isPlaying = false;

        // Update UI
        this.playBtn.querySelector('.btn-text').textContent = 'Play';
        this.updateStatus('Ready');

        // Stop visualizer
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        this.startVisualizerIdle();
    }

    async downloadZenAudio() {
        if (!this.zenAudioBuffer) return;

        // Convert audio buffer to MP3
        const mp3Data = this.audioBufferToMp3(this.zenAudioBuffer);
        const blob = new Blob([mp3Data], { type: 'audio/mp3' });

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zen-audio-${Date.now()}.mp3`;
        a.click();

        URL.revokeObjectURL(url);
    }

    audioBufferToMp3(buffer) {
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const samples = buffer.length;

        // Get audio data from both channels
        const left = buffer.getChannelData(0);
        const right = channels > 1 ? buffer.getChannelData(1) : left;

        // Convert float samples to 16-bit PCM
        const leftPCM = new Int16Array(samples);
        const rightPCM = new Int16Array(samples);

        for (let i = 0; i < samples; i++) {
            leftPCM[i] = Math.max(-32768, Math.min(32767, left[i] * 32767));
            rightPCM[i] = Math.max(-32768, Math.min(32767, right[i] * 32767));
        }

        // Initialize MP3 encoder
        const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128); // 128 kbps
        const mp3Data = [];

        const sampleBlockSize = 1152; // Must be multiple of 576 for MP3

        for (let i = 0; i < samples; i += sampleBlockSize) {
            const leftChunk = leftPCM.subarray(i, i + sampleBlockSize);
            const rightChunk = rightPCM.subarray(i, i + sampleBlockSize);
            const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);

            if (mp3buf.length > 0) {
                mp3Data.push(mp3buf);
            }
        }

        // Finish encoding
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }

        // Combine all MP3 data
        const totalLength = mp3Data.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of mp3Data) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result;
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.recordingStartTime;
            this.updateTimerDisplay(elapsed);
        }, 100);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateTimerDisplay(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        this.timerDisplay.textContent =
            `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }

    updateStatus(text) {
        this.statusText.textContent = text;
    }

    startVisualizer() {
        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.animationId = requestAnimationFrame(draw);

            this.analyser.getByteFrequencyData(dataArray);

            // Clear canvas with fade effect
            this.canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            this.canvasCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

            // Draw minimalist waveform
            const centerY = this.canvasHeight / 2;
            const step = this.canvasWidth / bufferLength;

            this.canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            this.canvasCtx.lineWidth = 1;
            this.canvasCtx.lineCap = 'round';
            this.canvasCtx.lineJoin = 'round';

            this.canvasCtx.beginPath();

            for (let i = 0; i < bufferLength; i++) {
                const value = dataArray[i];
                const percent = value / 255;
                const y = centerY + (percent - 0.5) * this.canvasHeight * 0.8;
                const x = i * step;

                if (i === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
            }

            this.canvasCtx.stroke();
        };

        draw();
    }

    startVisualizerIdle() {
        let time = 0;

        const draw = () => {
            if (this.isRecording || this.isPlaying) return;

            this.animationId = requestAnimationFrame(draw);
            time += 0.01;

            // Clear
            this.canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
            this.canvasCtx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

            // Draw subtle breathing line
            const centerY = this.canvasHeight / 2;

            this.canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            this.canvasCtx.lineWidth = 1;
            this.canvasCtx.beginPath();

            for (let x = 0; x < this.canvasWidth; x += 2) {
                const normalizedX = x / this.canvasWidth;
                const wave = Math.sin(normalizedX * Math.PI * 2 + time) * 10;
                const y = centerY + wave;

                if (x === 0) {
                    this.canvasCtx.moveTo(x, y);
                } else {
                    this.canvasCtx.lineTo(x, y);
                }
            }

            this.canvasCtx.stroke();
        };

        draw();
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new ZenAudioProcessor();
});
