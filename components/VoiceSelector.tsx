import React from 'react';
import type { VoiceOption } from '../types';

interface VoiceSelectorProps {
  voices: VoiceOption[];
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  disabled: boolean;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ voices, selectedVoice, onVoiceChange, disabled }) => {
  return (
    <div>
      <label htmlFor="voice-selector" className="block text-sm font-medium text-gray-300 mb-2">
        Choose a Voice
      </label>
      <div className="relative">
        <select
          id="voice-selector"
          value={selectedVoice}
          onChange={(e) => onVoiceChange(e.target.value)}
          disabled={disabled}
          className="w-full bg-gray-700 border border-gray-600 text-white rounded-lg p-3 appearance-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id} className="bg-gray-800 text-white">
              {voice.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
    </div>
  );
};

export default VoiceSelector;
