"""Deploy the reviewed daily-context candidate on Jarvis while phone audio is OFF.

python3 deploy-hermes-daily-context.py CANDIDATE_DIRECTORY
python3 deploy-hermes-daily-context.py --rollback
Only this bridge's sources and one dedicated systemd drop-in are changed.
No credentials, provider configuration, gateway or real conversations are read.
"""
from pathlib import Path
import hashlib
import os
import subprocess
import sys

ROOT = Path.home() / 'faceclaw-hermes-bridge'
BACKUP = ROOT / 'rollback-20261009-daily-context'
DROPIN = Path.home() / '.config/systemd/user/faceclaw-hermes.service.d/60-daily-context.conf'
STORE = Path.home() / '.cache/faceclaw-daily-context/topics.sqlite3'
HASHES = {
    'bridge.py': ('ae97e5acf9f4283a6a257193bec8db041323c0e5affebf3cf9540b2bd7c88886',
                  'e285abf63f838be762c4bee221289947e04ab9a517705c0a7ec7e115961adbb5'),
    'conversation.py': ('4a2e23e8b60416948b3c1ac122efc99cf94d8ed7ac6ed77c8d09813f4ee37246',
                        '5cfb9981b4f27c11da36dc996fd76a2f16131b9078e04a9f8ca82252abfa1df6'),
    'daily_context.py': (None,
                         '5702985aeed25058977a31addfd7b13f73cd8628c74a9aa5ded6838becf56bf7'),
}


def digest(data):
    return None if data is None else hashlib.sha256(data).hexdigest()


def read_optional(path):
    if path.is_symlink():
        raise ValueError('Refusing symlink: ' + path.name)
    return path.read_bytes() if path.exists() else None


def config_bytes():
    return ('[Service]\nEnvironment=FACECLAW_DAILY_CONTEXT=24h\n'
            'Environment=FACECLAW_DAILY_CONTEXT_DB=' + str(STORE) + '\n').encode()


def write_atomic(path, data):
    if data is None:
        path.unlink(missing_ok=True)
        return
    temp = path.with_name(path.name + '.daily-context.tmp')
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
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'restart', 'faceclaw-hermes.service'], check=True)
    subprocess.run(['systemctl', '--user', 'is-active', '--quiet', 'faceclaw-hermes.service'], check=True)


def apply(candidate=None, rollback=False):
    source_dir = BACKUP if rollback else Path(candidate)
    current = {name: read_optional(ROOT / name) for name in HASHES}
    source = {name: read_optional(source_dir / name) for name in HASHES}
    expected = {name: hashes[::-1] if rollback else hashes for name, hashes in HASHES.items()}
    current_config = read_optional(DROPIN)
    previous_config, desired_config = (config_bytes(), None) if rollback else (None, config_bytes())
    for name, (_, desired) in expected.items():
        if digest(source[name]) != desired:
            raise ValueError('Candidate hash differs: ' + name)
        if source[name] is not None:
            compile(source[name], name, 'exec')
    if all(digest(current[name]) == desired for name, (_, desired) in expected.items()) and current_config == desired_config:
        print('Already applied; no restart')
        return
    for name, (previous, _) in expected.items():
        if digest(current[name]) != previous:
            raise ValueError('Production changed since review: ' + name)
    if current_config != previous_config:
        raise ValueError('Daily-context service configuration changed since review')
    if rollback and STORE.exists():
        # The old bridge has no TTL worker. Clear this feature's summaries before
        # removing it, so rollback cannot leave expired personal context behind.
        sys.path.insert(0, str(ROOT))
        from daily_context import DailyContext
        memory = DailyContext(STORE)
        try:
            memory.forget()
        finally:
            memory.close()
    if not rollback:
        if STORE.parent.is_symlink():
            raise ValueError('Refusing symlink memory directory')
        STORE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(STORE.parent, 0o700)
        DROPIN.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        BACKUP.mkdir(mode=0o700)
        for name, data in current.items():
            if data is not None:
                write_atomic(BACKUP / name, data)
    try:
        for name, data in source.items():
            write_atomic(ROOT / name, data)
        write_atomic(DROPIN, desired_config)
        restart()
        for name, (_, desired) in expected.items():
            if digest(read_optional(ROOT / name)) != desired:
                raise RuntimeError('Installed hash differs: ' + name)
        if read_optional(DROPIN) != desired_config:
            raise RuntimeError('Installed configuration differs')
    except BaseException:
        for name, data in current.items():
            write_atomic(ROOT / name, data)
        write_atomic(DROPIN, current_config)
        restart()
        raise
    print('Rolled back' if rollback else 'Applied')
    for name in HASHES:
        print(name + ' ' + str(digest(read_optional(ROOT / name))))
    # No credentials, other drop-ins or gateway are changed.


if __name__ == '__main__':
    if sys.argv[1:] == ['--rollback']:
        apply(rollback=True)
    elif len(sys.argv) == 2:
        apply(sys.argv[1])
    else:
        raise SystemExit('Usage: deploy-hermes-daily-context.py CANDIDATE_DIRECTORY | --rollback')
