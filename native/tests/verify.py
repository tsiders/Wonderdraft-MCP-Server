"""End-to-end native backend checks against a caller-supplied Wonderdraft map.

Usage: python tests/verify.py ABSOLUTE_MAP_PATH
Requires a map with at least one existing label. Writes only in a temporary folder.
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

base = pathlib.Path(__file__).resolve().parents[1]
exe = base / 'target' / 'release' / ('wonderdraft-native.exe' if sys.platform == 'win32' else 'wonderdraft-native')
source = pathlib.Path(sys.argv[1]).resolve()
before = hashlib.sha256(source.read_bytes()).hexdigest()

def call(op, **kwargs):
    p = subprocess.run([str(exe)], input=json.dumps({'op': op, 'path': str(source), **kwargs}), text=True, encoding='utf-8', capture_output=True, check=True)
    return json.loads(p.stdout)

assert call('inspect')['ok']
original = call('list_labels')['result']['labels']
assert original, 'Choose a map with at least one label'
with tempfile.TemporaryDirectory() as folder:
    output = pathlib.Path(folder) / 'renamed.wonderdraft_map'
    assert call('rename_label', output=str(output), label_index=0, text='MCP verified — 港')['ok']
    p = subprocess.run([str(exe)], input=json.dumps({'op':'list_labels','path':str(output)}),text=True,encoding='utf-8',capture_output=True,check=True)
    assert json.loads(p.stdout)['result']['labels'][0]['text'] == 'MCP verified — 港'
    assert not call('rename_label', output=str(output), label_index=0, text='Overwrite')['ok']
    added = pathlib.Path(folder) / 'added.wonderdraft_map'
    result = call('add_label', output=str(added), template_index=0, text='MCP Town', x=500, y=600)
    assert result['ok'] and result['result']['label']['index'] == len(original)
assert before == hashlib.sha256(source.read_bytes()).hexdigest()
print('PASS: inspect, Unicode rename, add-label, exclusive output, original hash unchanged')
