"""Generate the customer reference from the regional FastAPI app, without services."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--backend', type=Path, required=True)
args = parser.parse_args()
sys.path.insert(0, str(args.backend.resolve()))
from oruel.service.regional_api import create_app

app = create_app(object(), origin='http://127.0.0.1:8780', secure_cookies=False)
schema = app.openapi()
schema['paths'] = {path: operations for path, operations in schema['paths'].items()
                   if path.startswith(('/workspace/', '/account/v1/', '/v1/'))
                   and not path.startswith(('/v1/worker/', '/v1/gateway/'))}
schema['x-kanook-source'] = {
    'repository': 'https://github.com/chajithsai/data-ingest', 'branch': 'kanook-0',
    'commit': subprocess.check_output(['git', '-C', str(args.backend), 'rev-parse', 'HEAD'], text=True).strip(),
    'local_changes': bool(subprocess.check_output(['git', '-C', str(args.backend), 'diff', '--name-only'], text=True).strip()),
}
out = Path(__file__).resolve().parents[1] / 'public/api/openapi.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes((json.dumps(schema, indent=2) + '\n').encode('utf-8'))
print(f'Generated {len(schema["paths"])} customer paths in {out}')
