"""Compatibility entrypoint; use the reference-aware hosting deployer."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
subprocess.run([os.environ.get('NODE_BIN', 'node'), str(root / 'scripts/deploy-staging-hosting.mjs')], cwd=root, check=True)
