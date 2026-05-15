'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useCamera }        from '@/hooks/useCamera';
import { useAnalyzer }      from '@/hooks/useAnalyzer';
import { useKeyboard }      from '@/hooks/useKeyboard';
import { useVoiceCommands } from '@/hooks/useVoiceCommands';
import { speech }           from '@/lib/speech';
import { getMapUrl }        from '@/lib/gps';
import { preloadVisionModel } from '@/lib/vision';
import type { AppMode, AppLang, AppTone, AIResult } from '@/lib/types';
import { CameraView }    from '@/components/CameraView';
import { ResponsePanel } from '@/components/ResponsePanel';
import { ControlDock }   from '@/components/ControlDock';
import { StatusBar }     from '@/components/StatusBar';

const AUTO_VOICE_COOLDOWN_MS   = 5000;
const MANUAL_VOICE_COOLDOWN_MS = 1000;

const GENERIC_PHRASES_EN = ['local mode active', 'local features', 'local guidance is ready', 'explore mode active', 'people awareness mode is active'];
const GENERIC_PHRASES_BN = ['লোকাল মোড চালু।', 'লোকাল গাইডেন্স প্রস্তুত'];

function makeSignature(r: AIResult): string {
  return r.priority + '|' + r.action + '|' + r.description.slice(0, 80);
}

function isGenericMessage(desc: string): boolean {
  const d = desc.toLowerCase();
  return GENERIC_PHRASES_EN.some(g => d.includes(g)) || GENERIC_PHRASES_BN.some(g => desc.includes(g));
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>('navigation');
  const [lang, setLang] = useState<AppLang>('en');
  const [tone, setTone] = useState<AppTone>('professional');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [dangerOnly, setDangerOnly] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [displayCommand, setDisplayCommand] = useState<string | null>(null);

  const displayTimerRef = useRef<any>(null);
  const gpsDeniedSpoken = useRef(false);
  const lastSpokenSigRef = useRef('');
  const lastSpokenAtRef = useRef(0);

  const camera = useCamera();
  const analyzer = useAnalyzer();

  const voiceEnabledRef = useRef(voiceEnabled);
  const dangerOnlyRef = useRef(dangerOnly);
  const modeRef = useRef(mode);

  useEffect(() => { voiceEnabledRef.current = voiceEnabled; }, [voiceEnabled]);
  useEffect(() => { dangerOnlyRef.current = dangerOnly; }, [dangerOnly]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    preloadVisionModel().catch(() => {});
    camera.startCamera();
  }, []);

  useEffect(() => {
    const r = analyzer.result;
    if (!r || !voiceEnabledRef.current || r.isDuplicate) return;
    if (modeRef.current === 'silent') return;

    const isDanger = r.priority === 'high' || r.warning;
    const isAuto = !!r.wasAutoTrigger;

    if (!isDanger) {
      if (isAuto && r.priority === 'low' && !r.warning) return;
      if (dangerOnlyRef.current && r.priority !== 'high' && !r.warning) return;
      if (isAuto && isGenericMessage(r.description)) return;

      const sig = makeSignature(r);
      const now = Date.now();
      const cooldown = isAuto ? AUTO_VOICE_COOLDOWN_MS : MANUAL_VOICE_COOLDOWN_MS;
      if (sig === lastSpokenSigRef.current && now - lastSpokenAtRef.current < cooldown) return;
      lastSpokenSigRef.current = sig;
      lastSpokenAtRef.current = now;
    }
    speech.speak(r.description, lang, tone, { urgent: isDanger });
  }, [analyzer.result, lang, tone]);

  const handleToggleVoice = useCallback(() => {
    const turningOn = !voiceEnabledRef.current;
    if (turningOn) speech.unlock();
    setVoiceEnabled(turningOn);
  }, []);

  const doAnalyze = useCallback((isAuto = false) => {
    if (modeRef.current === 'silent') return;
    const frame = camera.captureFrame();
    if (!frame) return;
    analyzer.analyze(frame, modeRef.current, lang, tone, isAuto, soundEnabled);
  }, [camera, analyzer, lang, tone, soundEnabled]);

  const handleRepeat = useCallback(() => {
    if (!analyzer.result) return;
    speech.speak(analyzer.result.description, lang, tone, { force: true });
  }, [analyzer.result, lang, tone]);

  const doAnalyzeRef = useRef(doAnalyze);
  useEffect(() => { doAnalyzeRef.current = doAnalyze; }, [doAnalyze]);

  useEffect(() => {
    if (!analyzer.autoAnalyze) return;
    const id = setInterval(() => doAnalyzeRef.current(true), 2000);
    return () => clearInterval(id);
  }, [analyzer.autoAnalyze]);

  const voiceCommands = useVoiceCommands({
    onAnalyze: () => doAnalyzeRef.current(false),
    onRepeat: handleRepeat,
    onVoiceOn: () => { speech.unlock(); setVoiceEnabled(true); },
    onVoiceOff: () => setVoiceEnabled(false),
    onSetMode: setMode,
    onSetLang: setLang,
  });

  useKeyboard({
    onAnalyze: () => doAnalyzeRef.current(false),
    onToggleVoice: handleToggleVoice,
    onToggleDanger: () => setDangerOnly(v => !v),
    onRepeat: handleRepeat,
    onSetMode: setMode,
  });

  return (
    <main style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', color: '#fff' }}>
      <CameraView videoRef={camera.videoRef} isActive={camera.isActive} isAnalyzing={analyzer.isAnalyzing} priority={analyzer.result?.priority ?? null} error={camera.error} onStart={camera.startCamera} />
      <StatusBar mode={mode} voiceEnabled={voiceEnabled} gpsStatus={analyzer.gpsStatus} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40, display: 'flex', flexDirection: 'column' }}>
        <ResponsePanel result={analyzer.result} error={analyzer.error} onDismissError={analyzer.clearError} />
        <ControlDock mode={mode} lang={lang} tone={tone} autoAnalyze={analyzer.autoAnalyze} voiceEnabled={voiceEnabled} dangerOnly={dangerOnly} soundEnabled={soundEnabled} isAnalyzing={analyzer.isAnalyzing} canAnalyze={analyzer.canAnalyze && camera.isActive} cooldownLeft={analyzer.cooldownLeft} micOn={voiceCommands.isListening} micSupported={voiceCommands.isSupported} cameraMode={camera.cameraMode} gpsStatus={analyzer.gpsStatus} gpsLocation={analyzer.gpsLocation} onAnalyze={() => doAnalyzeRef.current(false)} onToggleAuto={() => analyzer.setAutoAnalyze(!analyzer.autoAnalyze)} onToggleVoice={handleToggleVoice} onToggleDanger={() => setDangerOnly(v => !v)} onToggleSound={() => setSoundEnabled(v => !v)} onToggleMic={voiceCommands.toggle} onRepeat={handleRepeat} onSwitchCamera={camera.switchCamera} onOpenMap={() => {}} onSetMode={setMode} onSetLang={setLang} onSetTone={setTone} />
      </div>
    </main>
  );
}
