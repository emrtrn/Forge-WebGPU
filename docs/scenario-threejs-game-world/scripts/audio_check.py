#!/usr/bin/env python3
"""Check and prepare generated game sounds without listening to them.

Usage:
  uv run --with numpy python scripts/audio_check.py <out-dir> <report.tsv> name=src[:maxdur[:peakdb[:k|t]]] [...]
  uv run --with numpy --with mlx-whisper python scripts/audio_check.py ...   (adds the stray-voice transcript, Apple silicon)

  example: shot=raw/shot.mp3:0.6:-1.5:t  rain=raw/rain.mp3:20:-6:k

Per file: source duration, peak and RMS level, spectral centroid, share of energy in the speech
band (300 to 3400 Hz) and, when mlx-whisper is present, a transcript (a sound effect that returns
words carries a voice). Then the leading silence is trimmed (k keeps the start, t trims tight to
the main transient), the clip is cut to maxdur seconds with a short fade, peak-normalised to
peakdb (default -1.5) and written as mono MP3. One row per file is appended to the report. Needs
ffmpeg. State in the hand-over whether a person listened to the set.

Reading the transcript column: on sounds with no voice the model still returns something. In the
build's report that was one repeated glyph (steam, hum, water), "You" or "Thank you.". Treat
those as noise; anything longer deserves a listen.
"""
import os
import subprocess
import sys

import numpy as np

if len(sys.argv) < 4:
    sys.exit(__doc__)
out, rep = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
try:
    import mlx_whisper
except Exception:
    mlx_whisper = None


def pcm(f):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', '44100', '-f', 'f32le', '-'],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


rows = []
for a in sys.argv[3:]:
    name, spec = a.split('=', 1)
    p = spec.split(':')
    src = p[0]
    maxd = float(p[1]) if len(p) > 1 and p[1] else 0
    peak = float(p[2]) if len(p) > 2 and p[2] else -1.5
    keep = len(p) > 3 and p[3] == 'k'
    tight = len(p) > 3 and p[3] == 't'
    x = pcm(src)
    n = len(x)
    dur = n / 44100
    pk = float(np.abs(x).max()) or 1e-9
    rms = float(np.sqrt((x ** 2).mean())) or 1e-9
    m = min(n, 44100 * 30)
    S = np.abs(np.fft.rfft(x[:m])) ** 2
    fr = np.fft.rfftfreq(m, 1 / 44100)
    cen = float((S * fr).sum() / (S.sum() + 1e-12))
    sp = float(S[(fr > 300) & (fr < 3400)].sum() / (S.sum() + 1e-12))
    txt = ''
    if mlx_whisper:
        try:
            txt = mlx_whisper.transcribe(src, path_or_hf_repo='mlx-community/whisper-small-mlx', verbose=None)['text'].strip()
        except Exception as e:
            txt = 'ERR ' + str(e)[:40]
    th = pk * (0.3 if tight else 0.02)
    i0 = 0 if keep else int(np.argmax(np.abs(x) > th))
    i0 = max(0, i0 - (1800 if tight else 220))
    y = x[i0:]
    if maxd and len(y) > maxd * 44100:
        y = y[: int(maxd * 44100)].copy()
        f = int(min(0.08, maxd * 0.3) * 44100)
        y[-f:] *= np.linspace(1, 0, f)
    y = y / (np.abs(y).max() + 1e-9) * 10 ** (peak / 20)
    dst = os.path.join(out, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', '-', '-b:a', '160k', dst],
                   input=y.astype(np.float32).tobytes(), check=True)
    rows.append([name, f'{dur:.2f}', f'{len(y) / 44100:.2f}', f'{20 * np.log10(pk):.1f}', f'{20 * np.log10(rms):.1f}',
                 f'{cen:.0f}', f'{sp:.2f}', txt.replace('\t', ' ')[:80]])
    print('\t'.join(rows[-1]))
new = not os.path.exists(rep)
with open(rep, 'a', encoding='utf-8') as f:
    if new:
        f.write('name\tsrc_s\tout_s\tpeak_dB\trms_dB\tcentroid_Hz\tspeech_band\twhisper\n')
    for r in rows:
        f.write('\t'.join(r) + '\n')
