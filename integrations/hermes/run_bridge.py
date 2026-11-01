"""Start bridge.py inside Hermes' managed runtime (Hermes >= 0.21 has no plain venv).

Run with the interpreter printed by `hermes --print-runtime-command`; hermes_bootstrap
puts Hermes' installed dependency environment on sys.path before the bridge imports it.
"""
import os
import runpy
import sys

root = os.environ.get("HERMES_ROOT", "/home/dani/.hermes/hermes-agent")
here = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("HERMES_HOME", "/home/dani/.hermes")
sys.path.insert(0, root)
import hermes_bootstrap  # noqa: E402,F401

sys.path.insert(0, here)
sys.argv = [os.path.join(here, "bridge.py")] + sys.argv[1:]
runpy.run_path(sys.argv[0], run_name="__main__")
