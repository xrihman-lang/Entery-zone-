/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const speak = (text: string, voiceType: 'professional' | 'sweet' = 'professional') => {
  if (!window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Try to find a female voice
  const voices = window.speechSynthesis.getVoices();
  
  // Common female voice names/keywords across different browsers/OS
  const femaleVoiceKeywords = ['female', 'google uk english female', 'samantha', 'victoria', 'premium', 'zira', 'amy'];
  
  let selectedVoice = voices.find(v => 
    femaleVoiceKeywords.some(kw => v.name.toLowerCase().includes(kw))
  );

  // If no explicit female voice found, try to find one by language or just pick index 1-2 which are often female
  if (!selectedVoice) {
    selectedVoice = voices.find(v => v.lang.startsWith('en'));
  }

  if (selectedVoice) {
    utterance.voice = selectedVoice;
  }

  // Adjust pitch/rate for 'sweet' vs 'professional'
  if (voiceType === 'sweet') {
    utterance.pitch = 1.2;
    utterance.rate = 0.9;
  } else {
    utterance.pitch = 1.0;
    utterance.rate = 1.0;
  }

  window.speechSynthesis.speak(utterance);
};
