"""Deploy the additive memoryUpdated metric for Gatekeeper shadow; no prompt/provider changes.

On Jarvis: python3 deploy-hermes-gatekeeper-metrics.py CANDIDATE_DIRECTORY
Rollback:  python3 deploy-hermes-gatekeeper-metrics.py --rollback
Run candidate loopback tests first, then apply only while Faceclaw audio is OFF.
Preserves provider, credentials, tools, gateway and phone settings. No API calls.
"""
from pathlib import Path
import hashlib
import os
import subprocess
import sys

ROOT = Path.home() / 'faceclaw-hermes-bridge'
BACKUP = ROOT / 'rollback-20261010-gatekeeper-metrics'
HASHES = {
    'conversation.py': (
        '5cfb9981b4f27c11da36dc996fd76a2f16131b9078e04a9f8ca82252abfa1df6',
        '8bfc06a4dec0306cd0d513364ecdd117f1ae937331688a3eb720e0e2fca17868'),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_atomic(path, data):
    temp = path.with_name(path.name + '.gatekeeper-metrics.tmp')
    created = False
    try:
        with temp.open('xb') as stream:
            created = True
            os.chmod(temp, 0o600)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if created:
            temp.unlink(missing_ok=True)


def restart():
    subprocess.run(['systemctl', '--user', 'restart', 'faceclaw-hermes.service'], check=True)
    subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'faceclaw-hermes.service'], check=True)


def apply(candidate=None, rollback=False):
    source_dir = BACKUP if rollback else Path(candidate)
    if any(path.is_symlink() for path in (ROOT, BACKUP, source_dir)):
        raise ValueError('Refusing symlink directory')
    if any((directory / name).is_symlink() for directory in (ROOT, source_dir) for name in HASHES):
        raise ValueError('Refusing symlink source')
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
        for name, (_, desired) in expected.items():
            if digest((ROOT / name).read_bytes()) != desired:
                raise RuntimeError('Installed hash differs: ' + name)
    except BaseException:
        for name, data in current.items():
            write_atomic(ROOT / name, data)
        restart()
        raise
    print('Rolled back' if rollback else 'Applied')
    for name in HASHES:
        print(name + ' ' + digest((ROOT / name).read_bytes()))


if __name__ == '__main__':
    if sys.argv[1:] == ['--rollback']:
        apply(rollback=True)
    elif len(sys.argv) == 2:
        apply(sys.argv[1])
    else:
        raise SystemExit('Usage: deploy-hermes-gatekeeper-metrics.py CANDIDATE_DIRECTORY | --rollback')
