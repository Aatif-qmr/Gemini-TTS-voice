
import React, { useState, useCallback, useRef } from 'react';
import { generateSpeech } from './services/geminiService';
import { VOICES, TTS_SAMPLE_RATE, TTS_CHANNEL_COUNT } from './constants';
import VoiceSelector from './components/VoiceSelector';

// Helper function to decode base64 string to Uint8Array
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper function to decode raw PCM audio data into an AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Helper function to convert an AudioBuffer to a WAV file Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const getChannelData = buffer.getChannelData(0);
    const pcmData = new Int16Array(getChannelData.length);
    for (let i = 0; i < getChannelData.length; i++) {
        const s = Math.max(-1, Math.min(1, getChannelData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const dataLength = pcmData.length * (bitDepth / 8);
    const bufferLength = 44 + dataLength;
    const wavBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(wavBuffer);

    function writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
        }
    }
    
    let offset = 0;
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + dataLength, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, format, true); offset += 2;
    view.setUint16(offset, numChannels, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numChannels * (bitDepth / 8), true); offset += 4;
    view.setUint16(offset, numChannels * (bitDepth / 8), true); offset += 2;
    view.setUint16(offset, bitDepth, true); offset += 2;

    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, dataLength, true); offset += 4;
    
    for (let i = 0; i < pcmData.length; i++, offset += 2) {
        view.setInt16(offset, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
}


const App: React.FC = () => {
  const [text, setText] = useState<string>('Say cheerfully: Hello! Welcome to the Gemini Text-to-Speech narrator. You can provide instructions on how I should speak.');
  const [selectedVoice, setSelectedVoice] = useState<string>(VOICES[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handleGenerateSpeech = useCallback(async () => {
    if (!text.trim()) {
      setError("Please enter some text to generate speech.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedAudioUrl(null);
    setAudioBuffer(null);

    // Stop any currently playing audio
    if (audioSourceRef.current) {
        audioSourceRef.current.onended = null; // Prevent onended from firing on stop
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
    }
    // If context is suspended, resume it so new audio can play
    if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    setIsPlaying(false);
    
    try {
      const base64Audio = await generateSpeech(text, selectedVoice);

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: TTS_SAMPLE_RATE,
        });
      }
      
      const audioData = decode(base64Audio);
      const newAudioBuffer = await decodeAudioData(audioData, audioContextRef.current, TTS_SAMPLE_RATE, TTS_CHANNEL_COUNT);
      setAudioBuffer(newAudioBuffer);
      
      const wavBlob = audioBufferToWav(newAudioBuffer);
      const url = URL.createObjectURL(wavBlob);
      setGeneratedAudioUrl(url);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = newAudioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
          // Check if this source is still the active one before updating state
          if (audioSourceRef.current === source) {
            setIsPlaying(false);
            audioSourceRef.current = null;
          }
      };
      source.start();
      audioSourceRef.current = source;
      setIsPlaying(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setIsPlaying(false);
      setGeneratedAudioUrl(null);
      setAudioBuffer(null);
    } finally {
      setIsLoading(false);
    }
  }, [text, selectedVoice]);

  const handleTogglePlayPause = useCallback(async () => {
    if (!audioContextRef.current || !audioBuffer) return;

    if (isPlaying) {
      await audioContextRef.current.suspend();
      setIsPlaying(false);
    } else {
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        setIsPlaying(true);
      } else {
        // If playback finished, start from beginning
        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
        }
        const newSource = audioContextRef.current.createBufferSource();
        newSource.buffer = audioBuffer;
        newSource.connect(audioContextRef.current.destination);
        newSource.onended = () => {
          if (audioSourceRef.current === newSource) {
            setIsPlaying(false);
            audioSourceRef.current = null;
          }
        };
        newSource.start(0);
        audioSourceRef.current = newSource;
        setIsPlaying(true);
      }
    }
  }, [isPlaying, audioBuffer]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 space-y-6 border border-gray-700">
        <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-500">
                Gemini TTS Narrator
            </h1>
            <p className="text-gray-400 mt-2">Bring your text to life with expressive voices.</p>
        </div>

        {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg" role="alert">
                <p><span className="font-bold">Error:</span> {error}</p>
            </div>
        )}

        <div className="space-y-4">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter text with narration, e.g., 'Say excitedly: This is amazing!'"
                className="w-full h-40 bg-gray-700 border border-gray-600 rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 resize-none text-gray-200"
                disabled={isLoading}
            />
            <VoiceSelector 
                voices={VOICES}
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                disabled={isLoading}
            />
        </div>

        <div className="space-y-3">
            <button
                onClick={handleGenerateSpeech}
                disabled={isLoading}
                className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/50 transform hover:scale-105 disabled:scale-100"
            >
                {isLoading ? (
                    <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Generate Speech
                    </>
                )}
            </button>
            {generatedAudioUrl && audioBuffer && (
                <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg border border-gray-600">
                    <button
                        onClick={handleTogglePlayPause}
                        className="flex items-center justify-center p-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
                        aria-label={isPlaying ? "Pause audio" : "Play audio"}
                    >
                        {isPlaying ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                               <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            </svg>
                        )}
                    </button>
                    <span className="text-gray-300 font-medium text-sm">
                        {isPlaying ? 'Playing...' : audioContextRef.current?.state === 'suspended' ? 'Paused' : 'Ready to play'}
                    </span>
                    <a
                        href={generatedAudioUrl}
                        download="gemini-tts-narration.wav"
                        className="flex items-center justify-center p-2 rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-green-500"
                        aria-label="Download generated audio as WAV file"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                    </a>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default App;
