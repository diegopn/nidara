import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class CoreBehaviorTests(unittest.TestCase):
    def run_node_test(self, filename):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node.js is needed for JavaScript behavior tests")
        result = subprocess.run(
            [node, str(ROOT / "tests" / filename)],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_result_counts_survive_view_switches(self):
        self.run_node_test("view-counts.test.mjs")

    def test_unicode_titles_use_translations_and_reject_garbled_text(self):
        self.run_node_test("titles.test.mjs")

    def test_publication_periods_calculate_relative_and_custom_dates(self):
        self.run_node_test("periods.test.mjs")
