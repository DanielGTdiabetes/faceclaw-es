"""Deploy the inspected voice-chat tuning and balanced conversation STYLE.

On Jarvis: python3 deploy-hermes-latency.py CANDIDATE_DIRECTORY
Rollback:  python3 deploy-hermes-latency.py --rollback
Run candidate loopback tests first, then apply only while Faceclaw audio is OFF.
Preserves provider, credentials, tools, gateway and phone settings. No API calls.
"""
from pathlib import Path
import hashlib
import os
import subprocess
import sys

ROOT = Path.home() / 'faceclaw-hermes-bridge'
BACKUP = ROOT / 'rollback-20261007-latency'
HASHES = {
    'conversation.py': (
        '6350ced02429121c13dfd3826305f6cfde2317ae0d34e07760a4efd31d63ba26',
        '893b44f0ed9acd9d8ebd1e6b1c727ed6bab73cf16883eb0433134066380d5f74'),
    'bridge.py': (
        'f0147d168e9c6d53f0f83c2780ad8020b940ce6b80d52b5796314d3f878fe0d5',
        '8e0cab24ac5d011c50064cf60040deadec1073ba846276189e98aefda2b460a9'),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_atomic(path, data):
    temp = path.with_name(path.name + '.latency.tmp')
    with temp.open('xb') as stream:
        os.chmod(temp, 0o600)
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def restart():
    subprocess.run(['systemctl', '--user', 'restart', 'faceclaw-hermes.service'], check=True)
    subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'faceclaw-hermes.service'], check=True)


def apply(candidate=None, rollback=False):
    source_dir = BACKUP if rollback else Path(candidate)
    current = {name: (ROOT / name).read_bytes() for name in HASHES}
    source = {name: (source_dir / name).read_bytes() for name in HASHES}
    expected = {name: hashes[::-1] if rollback else hashes for name, hashes in HASHES.items()}
    for name, (_, desired) in expected.items():
        if digest(source[name]) != desired:
            raise ValueError('Candidate hash differs: ' + name)
        compile(source[name], name, 'exec')
    if all(digest(current[name]) == desired for name, (_, desired) in expected.items()):
        print('Already applied; no restart')
        return
    for name, (previous, _) in expected.items():
        if digest(current[name]) != previous:
            raise ValueError('Production changed since review; refusing to overwrite: ' + name)
    if not rollback:
        BACKUP.mkdir(mode=0o700)
        for name, data in current.items():
            write_atomic(BACKUP / name, data)
    try:
        for name, data in source.items():
            write_atomic(ROOT / name, data)
        restart()
    except BaseException:
        for name, data in current.items():
            write_atomic(ROOT / name, data)
        restart()
        raise
    for name, (_, desired) in expected.items():
        if digest((ROOT / name).read_bytes()) != desired:
            raise RuntimeError('Installed hash differs: ' + name)
    print('Rolled back' if rollback else 'Applied')
    for name in HASHES:
        print(name + ' ' + digest((ROOT / name).read_bytes()))


if __name__ == '__main__':
    if sys.argv[1:] == ['--rollback']:
        apply(rollback=True)
    elif len(sys.argv) == 2:
        apply(sys.argv[1])
    else:
        raise SystemExit('Usage: deploy-hermes-latency.py CANDIDATE_DIRECTORY | --rollback')
