// AssistantPanel.tsx
// In-app voice/NLP assistant using Web Speech API and Smart Home APIs

import React, { useEffect, useRef, useState } from 'react';
import { voiceAssistantAPI } from '@/services/api';
import { toast } from 'sonner';
import { parseVoiceIntent, buildRetrySuggestions } from '@/lib/voiceIntents';
import { voiceLogService } from '@/services/voiceLogService';

const languages = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'hi-IN', label: 'Hindi' },
  // Add more languages as needed
];

export const AssistantPanel: React.FC = () => {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [intentInfo, setIntentInfo] = useState<string>('');
  const [continuous, setContinuous] = useState(false);
  const [confirmNeeded, setConfirmNeeded] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<any>(null);
  const [retrySuggestions, setRetrySuggestions] = useState<string[]>([]);
  const [lang, setLang] = useState('en-US');
  const [requireWakeWord, setRequireWakeWord] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Keyboard accessibility: Ctrl+Shift+M toggles mic
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key.toLowerCase() === 'm')) {
        e.preventDefault();
        listening ? stopListening() : startListening();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [listening]);

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setResponse('Speech recognition not supported in this browser.');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event: any) => {
      const res = event.results[event.resultIndex];
      const text = res[0].transcript.trim();
      setTranscript(text);
      if (res.isFinal) {
        handleCommand(text);
      }
    };
    recognition.onend = () => {
      setListening(false);
      if (continuous) {
        setTimeout(() => recognition.start(), 250);
      }
    };
    recognition.onerror = (e: any) => setResponse('Error: ' + e.error);
    recognitionRef.current = recognition;
  }, [lang]);

  const startListening = () => {
    setTranscript('');
    setResponse('');
    setListening(true);
    // Start audio visualization
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      setMicDenied(false);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const canvas = canvasRef.current;
      const draw = () => {
        if (!canvas || !analyserRef.current) return;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteTimeDomainData(dataArray);
        canvasCtx.fillStyle = '#f3f4f6';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeStyle = '#3b82f6';
        canvasCtx.beginPath();
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;
          if (i === 0) canvasCtx.moveTo(x, y);
          else canvasCtx.lineTo(x, y);
          x += sliceWidth;
        }
        canvasCtx.lineTo(canvas.width, canvas.height / 2);
        canvasCtx.stroke();
        animRef.current = requestAnimationFrame(draw);
      };
      draw();
    }).catch(() => {
      setMicDenied(true);
    });
    recognitionRef.current?.start();
  };

  const stopListening = () => {
    setListening(false);
    recognitionRef.current?.stop();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
  };

  // Intent + command handler
  const handleCommand = async (text: string) => {
    try {
      const intent = parseVoiceIntent(text);
      voiceLogService.log({ level: 'info', stage: 'parse', message: 'Parsed intent', data: { intent } });
      setIntentInfo(`${intent.type} • devices: ${intent.deviceNames.join(', ') || 'none'} • conf ${Math.round(intent.confidence*100)}%${intent.wakeWordDetected ? ' • wake' : ''}`);
      // Wake word gating if enabled
      if (requireWakeWord && !intent.wakeWordDetected) {
        setResponse('👂 Waiting for wake word (say: "Hey AutoVolt")');
        return;
      }
      if (intent.type === 'UNKNOWN') {
        setResponse('❓ I did not understand that.');
        setRetrySuggestions(buildRetrySuggestions(intent));
        voiceLogService.log({ level: 'warn', stage: 'parse', message: 'Unknown intent', data: { text } });
        return;
      }

      // Security confirmation for ALL_OFF / ALL_ON
      if ((intent.type === 'ALL_OFF' || intent.type === 'ALL_ON') && !confirmNeeded) {
        setConfirmNeeded(true);
        setPendingIntent(intent);
        setResponse(intent.type === 'ALL_OFF' ? 'Confirm turning OFF all devices?' : 'Confirm turning ON all devices?');
        voiceLogService.log({ level: 'info', stage: 'confirm', message: 'Confirmation requested', data: { type: intent.type } });
        return;
      }
      if (confirmNeeded && pendingIntent) {
        setConfirmNeeded(false);
      }

      // Example: "Turn off all lights in Room 101"
      if (/turn off all lights in room (\d+)/i.test(text)) {
        const room = text.match(/room (\d+)/i)?.[1];
        
        // Send voice command to backend
        await voiceAssistantAPI.processVoiceCommand({
          command: text,
          voiceToken: 'web-assistant-session', // Use a session token for web interface
        });
        
        setResponse(`✅ All lights in Room ${room} are now OFF.`);
        voiceLogService.log({ level: 'info', stage: 'execute', message: 'Processed specific lights-off command', data: { room } });
        toast.success(`Lights turned off in Room ${room}`);
        return;
      }
      
      if (/schedule ac to start (\d+) minutes before class/i.test(text)) {
        const minutes = text.match(/(\d+) minutes/i)?.[1];
        
        // Send scheduling command to backend
        await voiceAssistantAPI.processVoiceCommand({
          command: text,
          voiceToken: 'web-assistant-session',
        });
        
        setResponse(`✅ AC scheduled to start ${minutes} minutes before class.`);
        voiceLogService.log({ level: 'info', stage: 'execute', message: 'Processed AC scheduling', data: { minutes } });
        toast.success(`AC scheduled to start ${minutes} minutes before class`);
        return;
      }
      
      // Map intent actions
      if (intent.type === 'TURN_ON' || intent.type === 'TURN_OFF' || intent.type === 'TOGGLE' || intent.type === 'STATUS' || intent.type === 'SCHEDULE' || intent.type === 'ALL_OFF' || intent.type === 'ALL_ON') {
        try {
          await voiceAssistantAPI.processVoiceCommand({
            command: text,
            intentType: intent.type,
            devices: intent.deviceNames,
            parameters: intent.parameters,
            voiceToken: 'web-assistant-session'
          });
          setResponse(`✅ ${intent.type} processed${intent.deviceNames.length? ' for '+intent.deviceNames.join(', '): ''}`);
          voiceLogService.log({ level: 'info', stage: 'execute', message: 'Command executed', data: { type: intent.type, devices: intent.deviceNames } });
          toast.success('Voice command executed');
        } catch (apiError) {
          console.error('Voice command processing failed:', apiError);
          setResponse('❌ Failed to execute command.');
          setRetrySuggestions(buildRetrySuggestions(intent));
          voiceLogService.log({ level: 'error', stage: 'execute', message: 'Command failed', data: { error: String(apiError) } });
          toast.error('Voice command failed');
        }
        return;
      }
    } catch (error) {
      console.error('Command execution error:', error);
      setResponse('Sorry, there was an error processing your command.');
      voiceLogService.log({ level: 'error', stage: 'other', message: 'Unhandled error in handleCommand', data: { error: String(error) } });
      toast.error('Command execution failed');
    }
  };

  return (
  <div className="w-full max-w-xl mx-auto p-4 bg-white rounded-lg shadow" ref={panelRef} aria-live="polite">
      <h2 className="text-xl font-bold mb-2">Smart Assistant</h2>
      {micDenied && (
        <div className="mb-2 p-2 border rounded bg-red-50 text-sm text-red-700">
          Microphone permission denied. Please enable it in your browser/site settings and try again.
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <select value={lang} onChange={e => setLang(e.target.value)} className="border rounded px-2 py-1">
          {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <button
          onClick={listening ? stopListening : startListening}
          className={`px-4 py-2 rounded ${listening ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}
        >
          {listening ? 'Stop' : 'Start'} Listening
        </button>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden>🎤</span>
        <canvas ref={canvasRef} width={240} height={40} className="border rounded bg-gray-100" aria-label="Microphone waveform" />
      </div>
      <div className="mb-2">
        <strong>Status:</strong> {listening ? '🎤 Listening' : 'Idle'} {continuous && '(Continuous)'}
      </div>
      <div className="mb-2">
        <strong>Transcript:</strong> <span aria-live="polite">{transcript}</span>
      </div>
      <div className="mb-2">
        <strong>Parsed Intent:</strong> {intentInfo || '—'}
      </div>
      <div className="mb-2">
        <strong>Assistant:</strong> {response}
      </div>
      {confirmNeeded && (
        <div className="mb-3 p-2 border rounded bg-yellow-50">
          <p className="text-sm">This action affects all devices. Proceed?</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { if (pendingIntent) handleCommand(pendingIntent.raw); }} className="px-3 py-1 bg-red-600 text-white rounded">Confirm</button>
            <button onClick={() => { setConfirmNeeded(false); setPendingIntent(null); setResponse('Cancelled'); }} className="px-3 py-1 bg-gray-300 rounded">Cancel</button>
          </div>
        </div>
      )}
      {retrySuggestions.length > 0 && (
        <div className="mb-2 text-xs text-gray-600">
          Suggestions: {retrySuggestions.map(s => <span key={s} className="inline-block mr-2">{s}</span>)}
        </div>
      )}
      <div className="flex items-center gap-3 mt-3">
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)} /> Continuous
        </label>
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={requireWakeWord} onChange={e => setRequireWakeWord(e.target.checked)} /> Require wake word
        </label>
      </div>
      <div className="text-xs text-gray-500">Try: "Turn off all lights in Room 101" or "Schedule AC to start 30 minutes before class"</div>
    </div>
  );
};

export default AssistantPanel;
