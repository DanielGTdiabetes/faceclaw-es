"""Reversible conv/2 deployment for Jarvis. Run there as dani, only after Codex review.

Usage:
  python3 deploy-hermes-conv2.py            # deploy staged candidate, rollback on failure
  python3 deploy-hermes-conv2.py --rollback # restore the conv/1 files saved by a previous deploy
  python3 deploy-hermes-conv2.py --probe    # also authenticate once on loopback to read hello-ack

Never prints private configuration. Touches only bridge.py and conversation.py of the
phone bridge and restarts only faceclaw-hermes.service. The existing drop-in
40-conversation.conf (FACECLAW_CONVERSATION=1), private.json, token, model and
hermes-gateway.service are not modified. --probe opens an authenticated loopback
connection and may displace the phone connection: use it only with the phone disconnected.
"""
import asyncio
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path('/home/dani/faceclaw-hermes-bridge')
STAGE = ROOT / 'conversation-candidate-conv2-20261005'
BACKUP = ROOT / 'rollback-20261005-conv2'
DROP = Path('/home/dani/.config/systemd/user/faceclaw-hermes.service.d/40-conversation.conf')
LIVE_CONV1 = {
    'bridge.py': '2563695d3166ef7206d7553f92c1fe189bcfe0cfd0a76510206faeb9aa91676e',
    'conversation.py': '3b6809182c87018cabb27f3258e6d30d9a1e1bcbaf1c08f04a3a801934ab0d2f',
}
CANDIDATE_CONV2 = {
    'bridge.py': 'be530122853c7126cea0edabdb800a023acc0697194120c3db590bd1e14e689d',
    'conversation.py': '0fd16f252391956d8b0658a56194edaef97dd67dd78b0ae57fc3228a18f19078',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def systemctl(*args):
    subprocess.run(['systemctl', '--user', *args], check=True, timeout=45,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def replace(target, data):
    incoming = target.with_name(target.name + '.incoming-conv2')
    incoming.write_bytes(data)
    incoming.chmod(0o600)
    os.replace(incoming, target)


def restart_and_check():
    systemctl('restart', 'faceclaw-hermes.service')
    time.sleep(3)
    systemctl('is-active', 'faceclaw-hermes.service')
    systemctl('is-active', 'hermes-gateway.service')


async def capabilities():
    from websockets.asyncio.client import connect
    token = json.loads((ROOT / 'private.json').read_text())['token']
    async with connect('ws://127.0.0.1:8791', open_timeout=10) as ws:
        await ws.send(json.dumps({'v': 1, 'chan': 'ctl', 'type': 'hello', 'token': token}))
        reply = json.loads(await asyncio.wait_for(ws.recv(), 10))
        return reply.get('type'), reply.get('capabilities', [])


def rollback():
    for name, expected in LIVE_CONV1.items():
        data = (BACKUP / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise SystemExit('Backup differs from conv/1; manual review required')
        replace(ROOT / name, data)
    restart_and_check()
    print('ROLLED_BACK_TO_CONV1=TRUE')


def deploy(probe):
    for name, expected in LIVE_CONV1.items():
        if sha(ROOT / name) != expected:
            raise SystemExit(f'Live {name} is not the reviewed conv/1 version; nothing changed')
    for name, expected in CANDIDATE_CONV2.items():
        data = (STAGE / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise SystemExit(f'Staged {name} differs from the reviewed candidate; nothing changed')
        compile(data, name, 'exec')
    if not DROP.exists():
        raise SystemExit('Conversation drop-in missing; nothing changed')
    if BACKUP.exists():
        raise SystemExit('Backup folder already exists; review a previous attempt first')
    BACKUP.mkdir(mode=0o700)
    for name in LIVE_CONV1:
        shutil.copy2(ROOT / name, BACKUP / name)
        (BACKUP / name).chmod(0o600)
    try:
        for name in CANDIDATE_CONV2:
            replace(ROOT / name, (STAGE / name).read_bytes())
        restart_and_check()
        if probe:
            for attempt in range(12):
                try:
                    kind, caps = asyncio.run(capabilities())
                    assert kind == 'hello-ack' and {'conv/1', 'conv/2'} <= set(caps)
                    break
                except Exception:
                    if attempt == 11:
                        raise
                    time.sleep(1)
            print('HELLO_ACK_CONV1_CONV2=TRUE')
        for name, expected in CANDIDATE_CONV2.items():
            assert sha(ROOT / name) == expected
        print('DEPLOYED_CONV2=TRUE')
        print('BACKUP=' + str(BACKUP))
    except Exception:
        rollback()
        print('DEPLOYMENT_ROLLED_BACK=TRUE')
        raise SystemExit(1)


if __name__ == '__main__':
    if '--rollback' in sys.argv:
        rollback()
    else:
        deploy('--probe' in sys.argv)
