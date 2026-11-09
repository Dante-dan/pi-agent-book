#!/usr/bin/env python3
"""Check book structure, relative links, and optionally pinned Pi source targets."""
import argparse
import re
import subprocess
import html
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PIN = 'f07218c4d4bbc12bef056a7058c3dd49dfe41abe'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pi-source', type=Path)
args = parser.parse_args()
errors = []
source_links = set()
local_links = 0
mermaid_count = 0
chinese_chapters = sorted((ROOT / 'book').glob('*.md'))
english_chapters = sorted((ROOT / 'en' / 'book').glob('*.md'))
chapters = chinese_chapters + english_chapters
for language, edition in [('Chinese', chinese_chapters), ('English', english_chapters)]:
    if len(edition) != 8:
        errors.append(f'Expected 8 {language} chapters, found {len(edition)}')
if {p.name for p in chinese_chapters} != {p.name for p in english_chapters}:
    errors.append('Chinese and English chapter filenames must match')
if args.pi_source:
    actual = subprocess.run(['git', '-C', str(args.pi_source), 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
    if actual != PIN:
        errors.append(f'Pi source HEAD must be {PIN}, got {actual}')

def markdown_anchors(path):
    """Recognize explicit IDs and the simple GitHub-style headings used by this book."""
    visible = []
    fence = None
    for line in path.read_text().splitlines():
        match = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line)
        if match:
            marker, suffix = match.groups()
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence) and not suffix.strip():
                fence = None
            continue
        if fence is None:
            visible.append(line)
    body = '\n'.join(visible)
    anchors = set(re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)["\']', body))
    seen = set()
    for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', body, re.M):
        heading = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', heading)
        heading = html.unescape(re.sub(r'<[^>]+>', '', heading)).lower()
        slug = ''.join(c for c in heading if c in '_- ' or unicodedata.category(c)[0] not in 'PS').replace(' ', '-')
        candidate, suffix = slug, 0
        while candidate in seen:
            suffix += 1
            candidate = f'{slug}-{suffix}'
        seen.add(candidate)
        anchors.add(candidate)
    return anchors

# Exclude generated practice copies and dependencies from the publication check.
chinese_notes = sorted((ROOT / 'book' / 'notes').glob('*.md'))
english_notes = sorted((ROOT / 'en' / 'book' / 'notes').glob('*.md'))
files = sorted(ROOT.glob('*.md')) + chinese_chapters + chinese_notes + sorted(p for p in (ROOT / 'examples').rglob('README.md') if 'node_modules' not in p.parts) + sorted((ROOT / 'en').rglob('*.md'))
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
        if parsed.scheme:
            continue
        dest = (file.parent / unquote(parsed.path)).resolve() if parsed.path else file.resolve()
        local_links += 1
        if not dest.is_relative_to(ROOT) or not dest.exists():
            errors.append(f'{file.relative_to(ROOT)}: broken relative link {target}')
        elif parsed.fragment and dest.suffix == '.md':
            if unquote(parsed.fragment) not in markdown_anchors(dest):
                errors.append(f'{file.relative_to(ROOT)}: missing section anchor {target}')
    navigation = '[Back to contents](../README.md)' if file in english_chapters else '[返回目录](../README.md)'
    if file in chapters and navigation not in body:
        errors.append(f'{file.name}: missing navigation')
    if file in english_chapters and re.search(r'\{\{[^}]+\}\}', text):
        errors.append(f'{file.name}: unresolved translation reference')

def note_links(text, base):
    """Resolve relative Markdown links in text to (file, fragment) pairs."""
    pairs = set()
    for target in re.findall(r'\[[^\]\n]+\]\(([^\s)]+)\)', text):
        parsed = urlsplit(target)
        if not parsed.scheme and parsed.path:
            pairs.add(((base / unquote(parsed.path)).resolve(), unquote(parsed.fragment)))
    return pairs

# Further-reading notes form a knowledge network: registered, bilingual, and linked both ways.
if {p.name for p in chinese_notes} != {p.name for p in english_notes}:
    errors.append('Chinese and English note filenames must match')
for notes, chapter_list, branch_label, callout, back in [
    (chinese_notes, chinese_chapters, '从哪里分叉出来', '> **延伸阅读**', '[返回延伸阅读](README.md)'),
    (english_notes, english_chapters, 'Branches from', '> **Further reading**', '[Back to further reading](README.md)'),
]:
    if not notes:
        continue
    index = notes[0].parent / 'README.md'
    index_targets = {f for f, _ in note_links(index.read_text(), index.parent)} if index.exists() else set()
    for note in (n for n in notes if n.name != 'README.md'):
        rel = note.relative_to(ROOT)
        text = note.read_text()
        if note.resolve() not in index_targets:
            errors.append(f'{rel}: not listed in {index.relative_to(ROOT)}')
        if back not in text:
            errors.append(f'{rel}: missing link back to the notes index')
        header = next((l for l in text.splitlines() if l.startswith(f'> **{branch_label}**')), None)
        if header is None:
            errors.append(f'{rel}: missing "{branch_label}" header line')
            continue
        declared = {f for f, _ in note_links(header, note.parent) if f in {c.resolve() for c in chapter_list}}
        if not declared:
            errors.append(f'{rel}: "{branch_label}" must link at least one chapter')
        linking = set()
        for chapter in chapter_list:
            for line in chapter.read_text().splitlines():
                if line.startswith(callout) and any(f == note.resolve() for f, _ in note_links(line, chapter.parent)):
                    linking.add(chapter.resolve())
        for missing in sorted(declared - linking):
            errors.append(f'{rel}: {missing.relative_to(ROOT)} has no "{callout}" link back to this note')
        for extra in sorted(linking - declared):
            errors.append(f'{rel}: {extra.relative_to(ROOT)} links here but is not listed under "{branch_label}"')

if errors:
    print('\n'.join(f'ERROR: {error}' for error in errors))
    raise SystemExit(1)
characters = sum(len(re.findall(r'[\u3400-\u9fff]', p.read_text())) for p in chapters)
print(f'PASS: {len(chinese_chapters)} Chinese + {len(english_chapters)} English chapters; {len([n for n in chinese_notes if n.name != "README.md"])} further-reading notes; {characters} Chinese characters; {local_links} relative links; {len(source_links)} pinned source links; {mermaid_count} Mermaid diagrams')
if args.pi_source:
    print('PASS: pinned source revision, paths and line anchors')
else:
    print('Source paths/line anchors not checked; supply --pi-source for that check.')
