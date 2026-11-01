"""Deploy the S2.12 measurement conversation.py (per-request tokens, effort, attempt outcomes) on Jarvis.

Run as dani, with the phone's conversation OFF:
    python3 deploy-hermes-measurement.py --check  CANDIDATE   # read-only: hashes and what would change
    python3 deploy-hermes-measurement.py          CANDIDATE   # apply
    python3 deploy-hermes-measurement.py --rollback           # restore the S2.11 STYLE source

Only conversation.py and faceclaw-hermes.service change. bridge.py, daily_context.py, private.json,
the provider, credentials and hermes-gateway.service are never touched. Behaviour is unchanged:
FACECLAW_CONV_REASONING_EFFORT is not set here, so the effort stays "low".
Success requires the service active, port 8791 accepting connections and, in this start's journal,
"listening" without "conversation unavailable". Any failure restores the previous source.
"""
import hashlib
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(os.environ.get("FACECLAW_BRIDGE_ROOT", "/home/dani/faceclaw-hermes-bridge"))
BACKUP = ROOT / "rollback-20261010-measurement"
OLD_HASH = "417dc5c98ceb617ee996adf8889935ec6bdfce33635dc04f0121a4fc6845e8dc"  # S2.11 STYLE (Codex)
NEW_HASH = "5b9020d050a2704e924a0ae6387e6da3ec2da1d75668ff26ed80938da2a6db1a"  # S2.12 measurement
FIXED = {"bridge.py": "e285abf63f838be762c4bee221289947e04ab9a517705c0a7ec7e115961adbb5",
         "daily_context.py": "5702985aeed25058977a31addfd7b13f73cd8628c74a9aa5ded6838becf56bf7"}
SERVICE, GATEWAY, PORT, READY_SECONDS = "faceclaw-hermes.service", "hermes-gateway.service", 8791, 45


def digest(data):
    return hashlib.sha256(data).hexdigest()


def systemctl(*args, check=True):
    return subprocess.run(["systemctl", "--user", *args], check=check, timeout=45,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)


def journal_since(epoch):
    """Only this start's lines; counts markers, never prints conversation content or secrets."""
    result = subprocess.run(["journalctl", "--user", "-u", SERVICE, "--since", f"@{int(epoch)}", "-o", "cat",
                             "--no-pager"], check=True, timeout=30, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True)
    return result.stdout


def port_open():
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=1):
            return True
    except OSError:
        return False


def restart_and_check():
    started = time.time() - 1
    systemctl("restart", SERVICE)
    deadline = time.monotonic() + READY_SECONDS
    while time.monotonic() < deadline:
        log = journal_since(started)
        if "conversation unavailable" in log:
            raise RuntimeError("Conversation channel failed to start")
        if "listening port=" in log and port_open():
            systemctl("is-active", SERVICE, GATEWAY)
            return round(time.time() - started, 1)
        if systemctl("is-active", SERVICE, check=False).stdout.strip() == "failed":
            raise RuntimeError("Bridge service failed")
        time.sleep(0.5)
    raise RuntimeError("Bridge not ready in time")


def replace(target, data):
    incoming = target.with_name(target.name + ".incoming-measurement")
    if incoming.exists() or incoming.is_symlink():
        raise SystemExit("Temporary deployment path already exists; nothing changed")
    with incoming.open("xb") as output:
        os.chmod(incoming, 0o600)
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.replace(incoming, target)


def preflight():
    target = ROOT / "conversation.py"
    for path in [target, *(ROOT / name for name in FIXED)]:
        if path.is_symlink():
            raise SystemExit(f"Unexpected symlink {path.name}; nothing changed")
    for name, expected in FIXED.items():
        if digest((ROOT / name).read_bytes()) != expected:
            raise SystemExit(f"{name} differs from the reviewed S2.11 bridge; nothing changed")
    return target


def apply(candidate=None, rollback=False, check=False):
    target = preflight()
    original = target.read_bytes()
    current = digest(original)
    if rollback:
        replacement = (BACKUP / "conversation.py").read_bytes()
        if digest(replacement) != OLD_HASH or current != NEW_HASH:
            raise SystemExit("Rollback hashes differ; nothing changed")
    else:
        replacement = Path(candidate).read_bytes()
        if digest(replacement) != NEW_HASH:
            raise SystemExit("Candidate differs from the reviewed S2.12 source; nothing changed")
        if current == NEW_HASH:
            print("ALREADY_APPLIED=TRUE")
            return
        if current != OLD_HASH:
            raise SystemExit("Live conversation.py differs from S2.11 STYLE; nothing changed")
        if BACKUP.exists():
            raise SystemExit("Backup already exists; nothing changed")
    compile(replacement, str(target), "exec")
    if check:
        print(f"CHECK_OK live={current[:12]} -> {digest(replacement)[:12]} backup={BACKUP}")
        return
    if not rollback:
        BACKUP.mkdir(mode=0o700)
        with (BACKUP / "conversation.py").open("xb") as output:
            os.chmod(output.name, 0o600)
            output.write(original)
        if digest((BACKUP / "conversation.py").read_bytes()) != OLD_HASH:
            raise SystemExit("Backup verification failed; live source unchanged")
    replace(target, replacement)
    try:
        seconds = restart_and_check()
        if digest(target.read_bytes()) != digest(replacement):
            raise RuntimeError("Installed source differs")
    except Exception as error:
        replace(target, original)
        try:
            restart_and_check()
        except Exception:
            raise SystemExit(f"{type(error).__name__}: {error}. Previous source restored; service needs attention")
        raise SystemExit(f"{type(error).__name__}: {error}. Previous source and services restored")
    print(("ROLLED_BACK=TRUE" if rollback else "MEASUREMENT_APPLIED=TRUE") + f" ready_in={seconds}s")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--rollback"]:
        apply(rollback=True)
    elif len(args) == 2 and args[0] == "--check":
        apply(args[1], check=True)
    elif len(args) == 1 and not args[0].startswith("--"):
        apply(args[0])
    else:
        raise SystemExit("Usage: deploy-hermes-measurement.py [--check] CANDIDATE | --rollback")
