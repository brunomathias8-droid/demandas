// Reaproveita o microfone liberado enquanto o app está aberto,
// para o iPhone não pedir permissão a cada gravação.
let stream = null;
let releaseTimer = null;
const KEEP_MS = 5 * 60 * 1000; // mantém por 5 min sem uso

const alive = () => stream && stream.getAudioTracks().some((t) => t.readyState === 'live');

export function releaseMic() {
  clearTimeout(releaseTimer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

export async function getMic() {
  clearTimeout(releaseTimer);
  if (alive()) {
    stream.getAudioTracks().forEach((t) => { t.enabled = true; });
    return stream;
  }
  stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return stream;
}

// Pausa o microfone (sem devolver a permissão) e agenda a liberação
export function idleMic() {
  if (!stream) return;
  stream.getAudioTracks().forEach((t) => { t.enabled = false; });
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(releaseMic, KEEP_MS);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') releaseMic(); });
}
