// androidVoiceHelper.ts - Android-specific voice control enhancements
import { Capacitor } from '@capacitor/core';
// Import community plugins (guard actual usage with isPluginAvailable checks)
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

export interface AndroidVoiceConfig {
  continuous: boolean;
  language: string;
  maxResults?: number;
  partialResults?: boolean;
  popup?: boolean;
}

class AndroidVoiceHelper {
  private isAndroid: boolean;
  private isListening: boolean = false;
  private recognitionAvailable: boolean = false;
  private ttsAvailable: boolean = false;

  constructor() {
    this.isAndroid = Capacitor.getPlatform() === 'android';
  }

  /**
   * Initialize Android voice features
   * Checks permissions and availability
   */
  async initialize(): Promise<boolean> {
    if (!this.isAndroid) {
      console.log('📱 Not on Android, using web fallback');
      return false;
    }

    console.log('📱 Initializing Android voice features...');

    try {
      // Guard: verify plugins are actually bridged in this build
      const speechPluginAvailable = Capacitor.isPluginAvailable('SpeechRecognition');
      const ttsPluginAvailable = Capacitor.isPluginAvailable('TextToSpeech');

      if (!speechPluginAvailable) {
        console.warn('⚠️ SpeechRecognition plugin not available (did you run: npx cap sync?)');
        this.recognitionAvailable = false;
      } else {
        // Check speech recognition availability through plugin
        const recognitionStatus = await SpeechRecognition.available();
        this.recognitionAvailable = recognitionStatus.available;
        console.log('🎤 Speech Recognition available:', this.recognitionAvailable);
      }

      if (!ttsPluginAvailable) {
        console.warn('⚠️ TextToSpeech plugin not available (install @capacitor-community/text-to-speech and run sync)');
        this.ttsAvailable = false;
      } else {
        // Assume available when plugin bridged
        this.ttsAvailable = true;
        console.log('🔊 Text-to-Speech plugin bridged');
      }

      // Request permissions if available
      if (this.recognitionAvailable) {
        await this.requestPermissions();
      }

      return this.recognitionAvailable;
    } catch (error) {
      console.error('❌ Failed to initialize Android voice:', error);
      return false;
    }
  }

  /**
   * Request microphone permissions on Android
   */
  async requestPermissions(): Promise<boolean> {
    if (!this.isAndroid) return false;

    try {
      const { speechRecognition } = await SpeechRecognition.requestPermissions();
      console.log('🎤 Microphone permission:', speechRecognition);
      return speechRecognition === 'granted';
    } catch (error) {
      console.error('❌ Failed to request permissions:', error);
      return false;
    }
  }

  /**
   * Check current permissions status
   */
  async checkPermissions(): Promise<boolean> {
    if (!this.isAndroid) return false;

    try {
      // Try to request permissions - if already granted, returns immediately
      const result = await SpeechRecognition.requestPermissions();
      return result.speechRecognition === 'granted';
    } catch (error) {
      console.error('❌ Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Start native Android speech recognition
   */
  async startRecognition(config: AndroidVoiceConfig): Promise<void> {
    if (!this.isAndroid || !this.recognitionAvailable) {
      throw new Error('Speech recognition not available on this device');
    }

    if (this.isListening) {
      console.warn('⚠️ Already listening, stopping first...');
      await this.stopRecognition();
    }

    console.log('🎤 Starting Android speech recognition...');

    try {
      await SpeechRecognition.start({
        language: config.language || 'en-US',
        maxResults: config.maxResults || 5,
        partialResults: config.partialResults !== false, // Enable by default
        popup: config.popup !== false, // Show popup by default
      });

      this.isListening = true;
      console.log('✅ Speech recognition started');
    } catch (error) {
      console.error('❌ Failed to start speech recognition:', error);
      this.isListening = false;
      throw error;
    }
  }

  /**
   * Stop native Android speech recognition
   */
  async stopRecognition(): Promise<void> {
    if (!this.isAndroid || !this.isListening) return;

    console.log('🛑 Stopping Android speech recognition...');

    try {
      await SpeechRecognition.stop();
      this.isListening = false;
      console.log('✅ Speech recognition stopped');
    } catch (error) {
      console.error('❌ Failed to stop speech recognition:', error);
      this.isListening = false;
    }
  }

  /**
   * Add listener for speech recognition results
   */
  addRecognitionListener(callback: (matches: string[]) => void): void {
    if (!this.isAndroid) return;

    SpeechRecognition.addListener('partialResults', (data: any) => {
      console.log('🎤 Partial results:', data.matches);
      if (data.matches && data.matches.length > 0) {
        callback(data.matches);
      }
    });
  }

  /**
   * Remove all speech recognition listeners
   */
  removeRecognitionListeners(): void {
    if (!this.isAndroid) return;
    SpeechRecognition.removeAllListeners();
  }

  /**
   * Speak text using native Android TTS
   */
  async speak(text: string, options?: {
    language?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    category?: string;
  }): Promise<void> {
    if (!this.isAndroid) {
      throw new Error('Not running on Android');
    }
    if (!this.ttsAvailable || !Capacitor.isPluginAvailable('TextToSpeech')) {
      throw new Error('Text-to-speech plugin not available on this device');
    }

    console.log('🔊 Speaking with Android TTS:', text);

    try {
      await TextToSpeech.speak({
        text: text,
        lang: options?.language || 'en-US',
        rate: options?.rate || 1.0,
        pitch: options?.pitch || 1.0,
        volume: options?.volume || 1.0,
        category: options?.category || 'ambient',
      });

      console.log('✅ TTS completed');
    } catch (error) {
      console.error('❌ Failed to speak:', error);
      throw error;
    }
  }

  /**
   * Stop current TTS playback
   */
  async stopSpeaking(): Promise<void> {
    if (!this.isAndroid) return;
    if (!this.ttsAvailable || !Capacitor.isPluginAvailable('TextToSpeech')) return;

    try {
      await TextToSpeech.stop();
      console.log('🛑 TTS stopped');
    } catch (error) {
      console.error('❌ Failed to stop TTS:', error);
    }
  }

  /**
   * Get list of available TTS voices
   */
  async getAvailableVoices(): Promise<any[]> {
    if (!this.isAndroid) return [];

    try {
      // Note: This requires implementing native code
      // For now, return empty array and use default voice
      console.log('ℹ️ Voice list not implemented, using default voice');
      return [];
    } catch (error) {
      console.error('❌ Failed to get voices:', error);
      return [];
    }
  }

  /**
   * Check if currently listening
   */
  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  /**
   * Check if running on Android
   */
  isAndroidPlatform(): boolean {
    return this.isAndroid;
  }

  /**
   * Expose plugin availability (helpful for guarded usage in UI layer)
   */
  pluginsAvailable(): { speech: boolean; tts: boolean } {
    return {
      speech: this.recognitionAvailable && Capacitor.isPluginAvailable('SpeechRecognition'),
      tts: this.ttsAvailable && Capacitor.isPluginAvailable('TextToSpeech')
    };
  }

  /**
   * Get platform info
   */
  getPlatformInfo(): {
    platform: string;
    isAndroid: boolean;
    recognitionAvailable: boolean;
    ttsAvailable: boolean;
  } {
    return {
      platform: Capacitor.getPlatform(),
      isAndroid: this.isAndroid,
      recognitionAvailable: this.recognitionAvailable,
      ttsAvailable: this.ttsAvailable,
    };
  }
}

// Export singleton instance
export const androidVoiceHelper = new AndroidVoiceHelper();

// Export class for testing
export default AndroidVoiceHelper;
