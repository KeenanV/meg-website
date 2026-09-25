"""Paste a provider key privately into Secret Manager; never save it to disk."""
import argparse
import getpass
import os
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("secret", choices=["resend-api-key", "github-workflow-token"])
args = parser.parse_args()
if not sys.stdin.isatty():
    sys.exit("Run this in an interactive terminal so the key can be entered without echoing.")
gcloud = shutil.which("gcloud")
if not gcloud:
    sys.exit("gcloud is required. Use the authenticated terminal on your Mac.")
value = getpass.getpass(f"Paste {args.secret} (input is hidden): ").strip()
prefix = "re_" if args.secret == "resend-api-key" else "github_pat_"
if not value.startswith(prefix) or any(c.isspace() for c in value):
    sys.exit("Unexpected key format. Nothing was uploaded.")
environment = dict(os.environ)
environment["CLOUDSDK_PYTHON"] = sys.executable
result = subprocess.run([
    gcloud, "secrets", "versions", "add", args.secret, "--data-file=-",
    "--project=megvandeusen-website", "--account=keenanvandeusen@gmail.com",
    "--format=value(name)",
], input=value.encode(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
if result.returncode:
    # Avoid logging provider key material even if a command error echoes its input.
    sys.exit("Upload failed. Check gcloud authentication and Secret Manager permissions; no key was printed.")
print(f"Stored a new version of {args.secret} in Meg's Google Cloud project. No local file was created.")
