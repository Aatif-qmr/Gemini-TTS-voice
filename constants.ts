import type { VoiceOption } from './types';

export const VOICES: VoiceOption[] = [
  { id: 'Kore', name: 'Kore (Female, Calm)' },
  { id: 'Puck', name: 'Puck (Male, Energetic)' },
  { id: 'Charon', name: 'Charon (Male, Deep)' },
  { id: 'Fenrir', name: 'Fenrir (Male, Authoritative)' },
  { id: 'Zephyr', name: 'Zephyr (Female, Gentle)' },
];

export const TTS_SAMPLE_RATE = 24000;
export const TTS_CHANNEL_COUNT = 1;
