/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const speak = (text: string, voiceType: 'professional' | 'sweet' = 'professional') => {
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Set language to Hindi as requested
  utterance.lang = 'hi-IN';
  
  // Try to find a female Hindi voice
  const voices = window.speechSynthesis.getVoices();
  
  // Look for Hindi female voices first
  const hindiFemaleKeywords = ['hindi', 'hi-in', 'female', 'google hi-in'];
  
  let selectedVoice = voices.find(v => 
    v.lang.toLowerCase().includes('hi') && 
    hindiFemaleKeywords.some(kw => v.name.toLowerCase().includes(kw))
  );

  // Fallback to any Hindi voice
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang.startsWith('hi'));
  }

  // Fallback to English female if no Hindi found (browser-specific)
  if (!selectedVoice) {
    const femaleVoiceKeywords = ['female', 'google uk english female', 'samantha', 'victoria', 'premium', 'zira', 'amy'];
    selectedVoice = voices.find(v => 
      femaleVoiceKeywords.some(kw => v.name.toLowerCase().includes(kw))
    );
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  // Adjust pitch/rate for 'sweet' vs 'professional'
  if (voiceType === 'sweet') {
    utterance.pitch = 1.1; // Slightly lowered from 1.2 to sound better in Hindi
    utterance.rate = 0.85; // Slightly slower for clarity
  } else {
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
  }

  window.speechSynthesis.speak(utterance);
};
