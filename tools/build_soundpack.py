"""Prepare an optional MGU Store soundpack source component, never an executable plugin.

The author supplies licensed, already-prepared PCM and attribution. This validates
format/digests and produces real Store tool metadata; it cannot verify authorship.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil

REQUIRED = [name + suffix for name in ('v6', 'v8', 'f90', 'm', 'diesel') for suffix in ('-low', '-high')] + ['spool', 'release', 'stop', 'crack-1', 'crack-2', 'crack-3']

def prepare(source, output, version):
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or source in output.parents:
        raise ValueError('Output must be outside the input bank')
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Expected semantic version')
    manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
    if (manifest.get('schema'), manifest.get('sampleRate'), manifest.get('channels'), manifest.get('format')) != (1, 24000, 1, 'S16LE'):
        raise ValueError('Expected schema 1, mono 24 kHz S16LE')
    attribution = (source / 'ATTRIBUTION.md').read_text(encoding='utf-8')
    sources = json.loads((source / 'sources.json').read_text(encoding='utf-8'))
    if not attribution.strip() or not sources or any(not row.get('author') or not row.get('license') for row in sources):
        raise ValueError('Source attribution and licenses required')
    names = ['manifest.json', 'sources.json', 'ATTRIBUTION.md']
    total = 0
    for name in REQUIRED:
        row = manifest['sounds'][name]
        if not re.fullmatch(r'[a-z0-9-]+\.pcm', row['file']) or type(row['frames']) is not int or not 16 <= row['frames'] <= 240000:
            raise ValueError('Invalid PCM entry: ' + name)
        if name.endswith(('-low', '-high')) and (type(row.get('referenceRpm')) not in (int, float) or not 400 <= row['referenceRpm'] <= 12000):
            raise ValueError('Missing motor playback calibration: ' + name)
        data = (source / row['file']).read_bytes()
        total += len(data)
        if total > 12000000 or len(data) != row['frames'] * 2 or hashlib.sha256(data).hexdigest() != row['sha256']:
            raise ValueError('Invalid length/hash/size: ' + name)
        names.append(row['file'])
    target = output / 'pack' / 'audio'
    target.mkdir(parents=True, exist_ok=True)
    for name in names:
        shutil.copyfile(source / name, target / name)
    component = {'id': 'luxo-soundpack', 'kind': 'tool', 'version': version, 'title': 'LUXO Optionales Aufnahmepaket',
        'description': 'Lokale PCM-Bank; Quelle und Rechte stehen in der enthaltenen Attribution.', 'mguHmi': ['ID7'],
        'files': [{'path': 'audio/' + name, 'from': 'audio/' + name, 'mode': '0644'} for name in names]}
    (output / 'pack' / 'component.json').write_text(json.dumps(component, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    catalog = {'schema': 1, 'components': [{'id': 'luxo-soundpack', 'kind': 'tool', 'path': 'pack', 'mguHmi': ['ID7']}]}
    (output / 'mgu-repo.json').write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8', newline='\n')
    return component

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--version', default='0.4.0')
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, args.version), ensure_ascii=False))

if __name__ == '__main__': main()
