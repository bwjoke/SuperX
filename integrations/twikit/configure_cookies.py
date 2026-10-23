"""Save X browser cookies locally, using hidden terminal prompts."""
import argparse
import getpass
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", default=str(Path.home() / ".config/superx/x.cookies.json"))
args = parser.parse_args()
path = Path(args.output).expanduser()
if path.exists():
    parser.error(f"File already exists: {path}. Choose another --output or remove it yourself.")
cookies = {name: getpass.getpass(f"X {name} (hidden): ").strip() for name in ("auth_token", "ct0")}
if not all(cookies.values()):
    parser.error("Both values are required.")
path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w") as out:
    json.dump(cookies, out)
print(f"Saved local cookie file: {path}")
