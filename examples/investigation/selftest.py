#!/usr/bin/env python3
"""Check staged delivery and reject file/symlink overwrites without model access."""
import subprocess
import sys
import tempfile
import unittest
import runpy
from pathlib import Path
from unittest.mock import patch

SETUP = Path(__file__).with_name('setup.py')
FIXTURES = SETUP.parent / 'fixtures'
ENGLISH = SETUP.parents[2] / 'en' / 'examples' / 'investigation' / 'fixtures'


def deliver(dest, stage, language):
    return subprocess.run(
        [sys.executable, str(SETUP), '--stage', str(stage), '--dest', str(dest),
         '--language', language], capture_output=True, text=True, timeout=10,
    )


class DeliveryTests(unittest.TestCase):
    def test_both_languages_and_repeated_delivery(self):
        for language in ('zh', 'en'):
            with self.subTest(language=language), tempfile.TemporaryDirectory() as temp:
                dest = Path(temp) / 'evidence'
                for stage in (1, 2):
                    result = deliver(dest, stage, language)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    for original in (FIXTURES / f'stage{stage}').iterdir():
                        expected = (ENGLISH / f'stage{stage}' / original.name
                                    if language == 'en' and original.suffix == '.md'
                                    else original)
                        self.assertEqual((dest / original.name).read_bytes(), expected.read_bytes())
                    before = {p.name: p.read_bytes() for p in dest.iterdir()}
                    self.assertNotEqual(deliver(dest, stage, language).returncode, 0)
                    self.assertEqual(before, {p.name: p.read_bytes() for p in dest.iterdir()})
                self.assertFalse((dest / 'README.md').exists(), 'Do not deliver the answer guide')

    def test_stage_two_requires_stage_one(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = Path(temp) / 'evidence'
            self.assertNotEqual(deliver(dest, 2, 'en').returncode, 0)
            self.assertFalse(dest.exists())

    def test_stage_two_rejects_existing_and_dangling_symlinks(self):
        for existing in (False, True):
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as temp:
                dest = Path(temp) / 'evidence'
                self.assertEqual(deliver(dest, 1, 'en').returncode, 0)
                outside = Path(temp) / 'outside.txt'
                if existing:
                    outside.write_text('Do not overwrite')
                link = dest / 'decision-update.md'
                link.symlink_to(outside)
                result = deliver(dest, 2, 'en')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('refusing to overwrite', result.stderr)
                self.assertTrue(link.is_symlink())
                if existing:
                    self.assertEqual(outside.read_text(), 'Do not overwrite')
                else:
                    self.assertFalse(outside.exists(), 'Must not write through a dangling link')
                self.assertFalse((dest / 'event-schema.md').exists())
                self.assertFalse((dest / 'refund-events.csv').exists())

    def test_symlink_introduced_after_preflight_is_not_followed(self):
        with tempfile.TemporaryDirectory() as temp:
            dest = (Path(temp) / 'evidence').resolve()
            self.assertEqual(deliver(dest, 1, 'en').returncode, 0)
            outside = Path(temp) / 'outside.txt'
            target = dest / 'decision-update.md'
            original_open = Path.open

            def introduce_link(path, mode='r', *args, **kwargs):
                if path == target and mode == 'xb':
                    path.symlink_to(outside)
                return original_open(path, mode, *args, **kwargs)

            argv = [str(SETUP), '--stage', '2', '--dest', str(dest), '--language', 'en']
            with patch.object(sys, 'argv', argv), patch.object(Path, 'open', introduce_link):
                with self.assertRaises(FileExistsError):
                    runpy.run_path(str(SETUP), run_name='__main__')
            self.assertTrue(target.is_symlink())
            self.assertFalse(outside.exists())


if __name__ == '__main__':
    unittest.main()
