// Generates the synthetic demo media in fixtures/demo:
//   - voice-note-ada.wav      a real recording (synthesised speech) of the demo voice note (Source B)
//   - voice-note-ada.timing.json  sentence timings measured by the speech engine while recording
//   - reference-navy-gown.png an illustration drawn for this demo (Source C)
//
//   pnpm demo:assets
//
// The voice note uses the Windows speech synthesiser (System.Speech). On other systems the script
// explains how to record the sentence yourself — it never fakes a transcript.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { parseFile } from 'music-metadata';

const dir = resolve('fixtures/demo');
mkdirSync(dir, { recursive: true });
const SENTENCES = [
  'Please make the sleeves elbow length.',
  'Keep the square neckline and no slit.',
  'Can we add light beading around the neckline?',
];
const force = process.argv.includes('--force');

// ---------------------------------------------------------------- reference illustration (Source C)
const imagePath = resolve(dir, 'reference-navy-gown.png');
if (force || !existsSync(imagePath)) {
  const beads = [];
  for (let x = 398; x <= 502; x += 13) beads.push(`<circle cx="${x}" cy="306" r="3.2"/>`);
  for (let y = 258; y <= 300; y += 12) beads.push(`<circle cx="392" cy="${y}" r="3.2"/><circle cx="508" cy="${y}" r="3.2"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  <defs>
    <linearGradient id="navy" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#16244a"/><stop offset="0.5" stop-color="#22356b"/><stop offset="1" stop-color="#121d3d"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1200" fill="#f4f1ec"/>
  <ellipse cx="450" cy="1135" rx="230" ry="18" fill="#e3ddd3"/>
  <!-- figure -->
  <circle cx="450" cy="150" r="44" fill="#8a5a3c"/>
  <path d="M426 186 h48 v52 h-48z" fill="#8a5a3c"/>
  <path d="M392 232 L508 232 L508 310 L392 310 Z" fill="#8a5a3c"/>
  <circle cx="328" cy="544" r="12" fill="#8a5a3c"/><circle cx="572" cy="544" r="12" fill="#8a5a3c"/>
  <!-- long sleeves (the customer later asks for elbow length) -->
  <path d="M362 246 C330 300 318 410 312 528 L344 534 C352 420 368 330 392 286 Z" fill="url(#navy)"/>
  <path d="M538 246 C570 300 582 410 588 528 L556 534 C548 420 532 330 508 286 Z" fill="url(#navy)"/>
  <!-- bodice with square neckline -->
  <path d="M362 242 L392 238 L392 306 L508 306 L508 238 L538 242 L522 440 L378 440 Z" fill="url(#navy)"/>
  <!-- floor-length skirt with a side slit on the right -->
  <path d="M378 440 L522 440 L540 760 L548 1120 L304 1120 L330 760 Z" fill="url(#navy)"/>
  <path d="M520 760 L566 1120 L606 1120 L548 760 Z" fill="#1b2a55"/>
  <path d="M520 760 L548 1120 L566 1120 L534 772 Z" fill="#8a5a3c"/>
  <path d="M450 440 L450 1120" stroke="#0f1833" stroke-width="2" opacity="0.35"/>
  <!-- light beading along the neckline -->
  <g fill="#dfe6f5">${beads.join('')}</g>
</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(imagePath);
  console.log(`Created ${imagePath} (illustration drawn for this demo: long sleeves and a side slit that the customer does NOT want).`);
} else {
  console.log(`Kept existing ${imagePath}`);
}

// ---------------------------------------------------------------- voice note (Source B)
const audioPath = resolve(dir, 'voice-note-ada.wav');
const timingPath = resolve(dir, 'voice-note-ada.timing.json');
if (!force && existsSync(audioPath) && existsSync(timingPath)) {
  console.log(`Kept existing ${audioPath}`);
} else if (process.platform === 'win32') {
  const text = SENTENCES.join(' ');
  const script = `
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Gender -eq 'Female' } | Select-Object -First 1
if ($voice) { $s.SelectVoice($voice.VoiceInfo.Name) }
$s.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile('${audioPath.replaceAll("'", "''")}', $format)
$marks = New-Object System.Collections.ArrayList
Register-ObjectEvent -InputObject $s -EventName SpeakProgress -SourceIdentifier tl_progress | Out-Null
$s.Speak('${text.replaceAll("'", "''")}')
foreach ($e in (Get-Event -SourceIdentifier tl_progress)) { [void]$marks.Add(@{ c = $e.SourceEventArgs.CharacterPosition; ms = [int]$e.SourceEventArgs.AudioPosition.TotalMilliseconds }) }
Unregister-Event -SourceIdentifier tl_progress -ErrorAction SilentlyContinue
Remove-Event -SourceIdentifier tl_progress -ErrorAction SilentlyContinue
$s.SetOutputToNull()
$s.Dispose()
Write-Output ($marks | ConvertTo-Json -Compress)
exit 0
`;
  let raw;
  try {
    raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
  } catch (error) {
    // PowerShell may report a non-zero status while event handlers wind down; the marks are on stdout.
    raw = error.stdout ?? '';
  }
  const json = raw.trim().split(/\r?\n/).filter(Boolean).pop() || '[]';
  // Progress events can arrive out of order; sort by character position.
  const marks = JSON.parse(json).sort((a, b) => a.c - b.c);
  // Same parser the API uses for uploads (the WAV header may contain extra chunks).
  const durationMs = Math.round(((await parseFile(audioPath, { duration: true })).format.duration ?? 0) * 1000);
  // Sentence boundaries from the engine's word positions (measured, not guessed).
  let offset = 0;
  const segments = SENTENCES.map((sentence, i) => {
    const startChar = offset;
    offset += sentence.length + 1;
    const startMark = marks.find((m) => m.c >= startChar);
    const nextStart = i + 1 < SENTENCES.length ? marks.find((m) => m.c >= offset) : null;
    return {
      startMs: Math.max(0, (startMark?.ms ?? 0) - 150),
      endMs: nextStart ? Math.max(0, nextStart.ms - 150) : durationMs,
      text: sentence,
    };
  });
  writeFileSync(timingPath, JSON.stringify({ source: 'System.Speech SpeakProgress events', durationMs, segments }, null, 2) + '\n');
  console.log(`Created ${audioPath} (${(durationMs / 1000).toFixed(1)} s, synthesised speech) and ${timingPath}`);
} else {
  console.log(
    `\nNo speech synthesiser is used on ${process.platform}. Record this sentence yourself and save it as\n  ${audioPath}\n\n  "${SENTENCES.join(' ')}"\n\n` +
      'Any WAV/MP3/M4A works for live AI; fixture (example) mode only recognises the generated file.\n',
  );
}
