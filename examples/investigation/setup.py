#!/usr/bin/env python3
"""Deliver one stage of fictional evidence; never copy the answer guide."""
import argparse
import shutil
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--stage', type=int, choices=(1, 2), required=True)
parser.add_argument('--dest', type=Path, required=True)
args = parser.parse_args()
source = Path(__file__).resolve().parent / 'fixtures' / f'stage{args.stage}'
dest = args.dest.resolve()
if args.stage == 1 and dest.exists():
    parser.error('Stage 1 requires a new directory; use a new --dest to preserve previous runs.')
if args.stage == 2 and not (dest / 'request.md').is_file():
    parser.error('Deliver stage 1 first, to the same --dest.')
files = sorted(source.iterdir())
if any((dest / p.name).exists() for p in files):
    parser.error('Stage files already exist; refusing to overwrite evidence.')
dest.mkdir(parents=True, exist_ok=True)
for path in files:
    shutil.copyfile(path, dest / path.name)
print(f'Delivered stage {args.stage}: {len(files)} files to {dest}')
print('No model was called. Start or resume Pi in this directory.')
