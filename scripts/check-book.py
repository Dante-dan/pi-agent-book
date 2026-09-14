#!/usr/bin/env python3
"""Check book structure, relative links, and optionally pinned Pi source targets."""
import argparse
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PIN = '71dca871bc80b6bc97be37f0ca3189399d651fff'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pi-source', type=Path)
args = parser.parse_args()
errors = []
source_links = set()
local_links = 0
mermaid_count = 0
chapters = sorted((ROOT / 'book').glob('*.md'))
if len(chapters) != 8:
    errors.append(f'Expected 8 chapters, found {len(chapters)}')
if args.pi_source:
    actual = subprocess.run(['git', '-C', str(args.pi_source), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    if actual != PIN:
        errors.append(f'Pi source HEAD must be {PIN}, got {actual}')

# Exclude generated practice copies and dependencies from the publication check.
files = sorted(ROOT.glob('*.md')) + chapters + sorted(p for p in (ROOT / 'examples').rglob('README.md') if 'node_modules' not in p.parts)
for file in files:
    text = file.read_text()
    outside = []
    fence = None
    for line in text.splitlines():
        match = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line)
        if match:
            marker, suffix = match.groups()
            if fence is None:
                fence = marker
                if suffix.strip() == 'mermaid':
                    mermaid_count += 1
            elif marker[0] == fence[0] and len(marker) >= len(fence) and not suffix.strip():
                fence = None
            continue
        if fence is None:
            outside.append(line)
    if fence:
        errors.append(f'{file.relative_to(ROOT)}: unclosed code fence')
    body = '\n'.join(outside)
    if file in chapters and len(re.findall(r'^# ', body, re.M)) != 1:
        errors.append(f'{file.name}: expected one chapter title')
    for target in re.findall(r'\[[^\]\n]+\]\(([^\s)]+)\)', body):
        parsed = urlsplit(target)
        if parsed.scheme in ('https', 'http'):
            if parsed.netloc == 'github.com' and parsed.path.startswith('/earendil-works/pi/'):
                match = re.match(r'/earendil-works/pi/(blob|tree)/([^/]+)(?:/(.*))?$', parsed.path)
                if match:
                    kind, revision, source_path = match.groups()
                    if revision != PIN:
                        errors.append(f'{file.name}: unpinned Pi link {target}')
                    source_links.add(target)
                    if args.pi_source and source_path:
                        path = args.pi_source / unquote(source_path)
                        if not path.exists():
                            errors.append(f'{file.name}: missing source {source_path}')
                        elif parsed.fragment.startswith('L') and path.is_file():
                            anchor = re.fullmatch(r'L(\d+)(?:-L(\d+))?', parsed.fragment)
                            line_count = len(path.read_text().splitlines())
                            if not anchor or any(int(n) < 1 or int(n) > line_count for n in anchor.groups() if n):
                                errors.append(f'{file.name}: invalid line anchor {target}')
            continue
        if parsed.scheme or target.startswith('#'):
            continue
        dest = (file.parent / unquote(parsed.path)).resolve()
        local_links += 1
        if not dest.is_relative_to(ROOT) or not dest.exists():
            errors.append(f'{file.relative_to(ROOT)}: broken relative link {target}')
    if file in chapters and '[返回目录](../README.md)' not in body:
        errors.append(f'{file.name}: missing navigation')

if errors:
    print('\n'.join(f'ERROR: {error}' for error in errors))
    raise SystemExit(1)
characters = sum(len(re.findall(r'[\u3400-\u9fff]', p.read_text())) for p in chapters)
print(f'PASS: {len(chapters)} chapters; {characters} Chinese characters; {local_links} relative links; {len(source_links)} pinned source links; {mermaid_count} Mermaid diagrams')
if args.pi_source:
    print('PASS: pinned source revision, paths and line anchors')
else:
    print('Source paths/line anchors not checked; supply --pi-source for that check.')
