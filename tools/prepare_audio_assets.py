"""Rebuild licensed recording excerpts. Development only: pip install numpy soundfile.

Public preview files are used as allowed by Freesound's documented preview
download path; no account, original-download endpoint or authentication bypass.
"""
from pathlib import Path
import argparse
import hashlib
import json
import urllib.request
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'apps/patryklars6_motor_sound/audio'
RATE = 24000

def filter_audio(x, rate, low=35, high=8000):
    spectrum = np.fft.rfft(x)
    frequencies = np.fft.rfftfreq(len(x), 1 / rate)
    response = (1 - np.exp(-(frequencies / low) ** 4)) * np.exp(-(frequencies / high) ** 8)
    return np.fft.irfft(spectrum * response, n=len(x))

def convert(x, rate, start, end, loop=False, low=35, high=8000):
    x = x[round(start * rate):round(end * rate)].mean(axis=1).astype(np.float64)
    x -= np.mean(x)
    x = filter_audio(x, rate, low, high)
    x = np.interp(np.arange(round(len(x) * RATE / rate)) * rate / RATE, np.arange(len(x)), x)
    if loop:
        edge = min(round(.04 * RATE), len(x) // 8)
        blend = np.linspace(0, 1, edge)
        x = np.concatenate([x[edge:-edge], x[-edge:] * (1 - blend) + x[:edge] * blend])
    else:
        attack = min(round(.001 * RATE), len(x) // 10)
        release = min(round(.06 * RATE), len(x) // 4)
        x[:attack] *= np.linspace(0, 1, attack)
        x[-release:] *= np.linspace(1, 0, release)
    rms = np.sqrt(np.mean(x * x))
    x *= min(.23 / max(rms, 1e-6), .92 / max(np.max(np.abs(x)), 1e-6))
    return np.round(x * 32767).astype('<i2').tobytes()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    args = parser.parse_args()
    catalog = json.loads((TARGET / 'sources.json').read_text(encoding='utf-8'))
    decoded = {}
    for source in catalog:
        cache = args.cache / (source['id'] + '.mp3')
        if not cache.exists():
            with urllib.request.urlopen(urllib.request.Request(source['publicPreview'], headers={'User-Agent': 'LUXO-Audio-Asset-Build'}), timeout=40) as response:
                cache.parent.mkdir(parents=True, exist_ok=True)
                cache.write_bytes(response.read())
        assert hashlib.sha256(cache.read_bytes()).hexdigest() == source['previewSha256'], source['id']
        decoded[source['id']] = sf.read(cache, always_2d=True, dtype='float32')
    # Reference RPM is a playback tuning parameter, not measured source RPM.
    recipes = [
        ('v6-low', 'v6', 2.55, 3.35, True, 1100, 35, 6500),
        ('v6-high', 'v6', .60, 1.18, True, 3400, 35, 8000),
        ('v8-low', 'v8', 2.05, 2.85, True, 1100, 35, 6500),
        ('v8-high', 'v8', .72, 1.20, True, 3200, 35, 8000),
        ('f90-low', 'f90', 6.40, 7.35, True, 1100, 35, 6500),
        ('f90-high', 'f90', 3.25, 3.95, True, 3400, 35, 8000),
        ('m-low', 'm', 30.05, 30.95, True, 1300, 45, 6500),
        ('m-high', 'm', 15.15, 15.85, True, 3600, 45, 8000),
        ('diesel-low', 'diesel', .20, .95, True, 1400, 35, 4500),
        ('diesel-high', 'diesel', 1.05, 1.85, True, 3200, 35, 6500),
        ('spool', 'm', 15.10, 15.90, True, None, 1600, 9500),
        ('release', 'turbo', 1.00, 2.00, False, None, 850, 9500),
        ('crack-1', 'pop', 1.575, 1.81, False, None, 55, 9500),
        ('crack-2', 'pop', 5.280, 5.50, False, None, 55, 9500),
        ('crack-3', 'pop', .325, .56, False, None, 55, 9500),
        ('stop', 'stop', .80, 1.70, False, None, 40, 6500),
    ]
    sounds = {}
    for name, source, start, end, loop, rpm, low, high in recipes:
        x, sr = decoded[source]
        data = convert(x, sr, start, end, loop, low, high)
        (TARGET / (name + '.pcm')).write_bytes(data)
        sounds[name] = {'file': name + '.pcm', 'source': source, 'sourceIntervalSeconds': [start, end],
            'loop': loop, 'referenceRpm': rpm, 'frames': len(data) // 2,
            'sha256': hashlib.sha256(data).hexdigest(), 'processing': {'highpassHz': low, 'lowpassHz': high,
            'mono': True, 'sampleRate': RATE, 'rmsTarget': .23, 'peakLimit': .92, 'loopCrossfadeMs': 40 if loop else 0}}
    manifest = {'schema': 1, 'sampleRate': RATE, 'channels': 1, 'format': 'S16LE',
        'quality': {'status': 'rejected-by-user', 'productionReady': False,
            'reason': 'Short rev crops and shared turbo effects were rejected as artificial; sustained measured-RPM/load recordings and profile-specific effects are required.',
            'exactBmwM5F90Recording': False, 'profileSpecificTurboRecordings': False},
        'recordedRpmKnown': False, 'referenceRpmMeaning': 'Playback calibration only; not a measured RPM of the recording',
        'sounds': sounds}
    (TARGET / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('Built', len(sounds), 'licensed PCM excerpts;', sum(row['frames'] * 2 for row in sounds.values()), 'bytes')

if __name__ == '__main__':
    main()
