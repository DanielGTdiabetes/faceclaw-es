"""Apply the reviewed question/participation prompt to existing conv/2 on Jarvis.

Run as dani: python3 deploy-hermes-participation.py /path/to/conversation.py
Rollback: python3 deploy-hermes-participation.py --rollback
Only conversation.py and faceclaw-hermes.service are changed. Use with phone OFF.
No provider calls or authenticated probes; private configuration is never read.
"""
import hashlib
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/dani/faceclaw-hermes-bridge')
BACKUP = ROOT / 'rollback-20261005-participation'
OLD_HASH = '0fd16f252391956d8b0658a56194edaef97dd67dd78b0ae57fc3228a18f19078'
NEW_HASH = 'a095e84eddb6040ba14a81805068b37ade85bec80b11e9eee35fae694263ad50'
BRIDGE_HASH = 'be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def restart_and_check():
    for args in [('restart', 'faceclaw-hermes.service'),
                 ('is-active', 'faceclaw-hermes.service', 'hermes-gateway.service'),
                 ('is-enabled', 'faceclaw-hermes.service', 'hermes-gateway.service')]:
        subprocess.run(['systemctl', '--user', *args], check=True, timeout=45,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def replace(target, data):
    incoming = target.with_name(target.name + '.incoming-participation')
    if incoming.exists() or incoming.is_symlink():
        raise SystemExit('Temporary deployment path already exists; nothing changed')
    with incoming.open('xb') as output:
        os.chmod(incoming, 0o600)
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.replace(incoming, target)


def apply(candidate=None, rollback=False):
    target = ROOT / 'conversation.py'
    if target.is_symlink() or (ROOT / 'bridge.py').is_symlink():
        raise SystemExit('Unexpected source symlink; nothing changed')
    if digest((ROOT / 'bridge.py').read_bytes()) != BRIDGE_HASH:
        raise SystemExit('Bridge differs from reviewed conv/2; nothing changed')
    original = target.read_bytes()
    current_hash = digest(original)
    if rollback:
        replacement = (BACKUP / 'conversation.py').read_bytes()
        if digest(replacement) != OLD_HASH or current_hash != NEW_HASH:
            raise SystemExit('Rollback hashes differ; nothing changed')
    else:
        replacement = Path(candidate).read_bytes()
        if digest(replacement) != NEW_HASH:
            raise SystemExit('Candidate differs from reviewed prompt; nothing changed')
        if current_hash == NEW_HASH:
            print('ALREADY_APPLIED=TRUE')
            return
        if current_hash != OLD_HASH:
            raise SystemExit('Live conversation source differs; nothing changed')
        if BACKUP.exists():
            raise SystemExit('Backup already exists; nothing changed')
    compile(replacement, str(target), 'exec')
    if not rollback:
        BACKUP.mkdir(mode=0o700)
        with (BACKUP / 'conversation.py').open('xb') as output:
            os.chmod(output.name, 0o600)
            output.write(original)
        if digest((BACKUP / 'conversation.py').read_bytes()) != OLD_HASH:
            raise SystemExit('Backup verification failed; live source unchanged')
    replace(target, replacement)
    try:
        restart_and_check()
        if digest(target.read_bytes()) != digest(replacement):
            raise RuntimeError('Installed source differs')
    except Exception:
        replace(target, original)
        try:
            restart_and_check()
        except Exception:
            raise SystemExit('Previous source restored; service recovery needs attention')
        raise SystemExit('Deployment failed; previous source and services restored')
    print('ROLLED_BACK=TRUE' if rollback else 'PARTICIPATION_APPLIED=TRUE')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: deploy-hermes-participation.py CANDIDATE | --rollback')
    apply(rollback=True) if sys.argv[1] == '--rollback' else apply(sys.argv[1])
