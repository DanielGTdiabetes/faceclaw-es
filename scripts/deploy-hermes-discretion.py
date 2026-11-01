"""Deploy conversation discretion, bounded sequential fallback and timing diagnostics.

On Jarvis: python3 deploy-hermes-discretion.py CANDIDATE_DIRECTORY
Rollback:  python3 deploy-hermes-discretion.py --rollback
Run candidate loopback tests first, then apply only while Faceclaw audio is OFF.
Preserves provider, credentials, tools, gateway and phone settings. No API calls.
"""
from pathlib import Path
import hashlib
import os
import subprocess
import sys

ROOT = Path.home() / 'faceclaw-hermes-bridge'
BACKUP = ROOT / 'rollback-20261008-discretion'
HASHES = {
    'conversation.py': (
        'd6db6b9db6a3edf8a16679cfcc2ff184475d119131fdd01135bd4300294a464b',
        '4a2e23e8b60416948b3c1ac122efc99cf94d8ed7ac6ed77c8d09813f4ee37246'),
    'bridge.py': (
        'ac610f9d18b398d49c78fce5688af4aae62940d457c5311037caf786243b1c4a',
        'ae97e5acf9f4283a6a257193bec8db041323c0e5affebf3cf9540b2bd7c88886'),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_atomic(path, data):
    temp = path.with_name(path.name + '.discretion.tmp')
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
        raise SystemExit('Usage: deploy-hermes-discretion.py CANDIDATE_DIRECTORY | --rollback')
