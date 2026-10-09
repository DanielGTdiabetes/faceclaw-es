#!/usr/bin/env python3
"""Presentation checks for summarize_pixel.py. Run: python -I evaluations/whisper-tensor/test_summarize_pixel.py"""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results", "pixel")
_spec = importlib.util.spec_from_file_location("summarize_pixel", os.path.join(HERE, "summarize_pixel.py"))
summarize = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(summarize)


def render(root):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        summarize.main(root)
    return out.getvalue()


def digest(path):
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def section(text, name):
    start = text.index("## " + name)
    end = text.find("\n## ", start + 1)
    return text[start:] if end < 0 else text[start:end]


class HistoricalResults(unittest.TestCase):
    def test_old_sustained_wer_is_kept_in_json_but_never_shown_as_valid(self):
        path = os.path.join(RESULTS, "sustained-base-t1-t4", "run.json")
        with open(path, encoding="utf-8") as handle:
            stored = [c["wer"] for c in json.load(handle)["cases"]]
        self.assertTrue(all(abs(w - 1.3090024330900243) < 1e-12 for w in stored))  # Evidence untouched.
        before = digest(path)
        text = render(RESULTS)
        self.assertEqual(before, digest(path))
        sustained = section(text, "sustained-base-t1-t4")
        self.assertNotIn("1.309", text)
        self.assertEqual(4, sustained.count("| n/v¹ |"))
        self.assertIn("¹ WER no válido", sustained)
        # Base p95 that support the 1 -> 4 thread promotion stay visible (timingsComplete true).
        for p95 in ("| 1726 |", "| 831 |", "| 828 |", "| 1388 |"):
            self.assertIn(p95, sustained)

    def test_old_coverage_is_labelled_as_attempted_windows(self):
        text = render(RESULTS)
        for name in ("realtime-small-t4", "sustained-base-t1-t4"):
            part = section(text, name)
            self.assertIn("100²", part)
            self.assertIn("² Cobertura con la semántica anterior", part)
        self.assertIn("| 0.310 |", section(text, "realtime-small-t4"))  # Non-loop WER still shown.


class NewFormat(unittest.TestCase):
    def _run_with(self, mutate):
        with open(os.path.join(RESULTS, "sustained-base-t1-t4", "run.json"), encoding="utf-8") as handle:
            run = json.load(handle)
        run = copy.deepcopy(run)
        for case in run["cases"]:
            case["coverageSemantics"] = "decoded-ok-v2"
            case["decodeErrors"] = 0
            case["wer"] = None
            mutate(case)
        with tempfile.TemporaryDirectory() as root:
            os.makedirs(os.path.join(root, "synthetic"))
            with open(os.path.join(root, "synthetic", "run.json"), "w", encoding="utf-8") as handle:
                json.dump(run, handle)
            return render(root)

    def test_incomplete_timings_withhold_percentiles_and_speech_coverage_with_reason(self):
        reason = "timing ring truncated: collected 256 of 380 decoder attempts"

        def truncate(case):
            case.update(timingsComplete=False, timingsInvalidReason=reason, decodeP50Ms=None, decodeP95Ms=None,
                        speechCoveragePct=None)
        text = self._run_with(truncate)
        self.assertEqual(4, text.count("| n/v³ | 0 | n/v³ | n/v³ |"))
        self.assertIn("³ Percentiles y voz cubierta retenidos", text)
        self.assertIn(reason, text)
        self.assertNotIn("²", text)

    def test_complete_new_runs_show_decoded_coverage_and_errors(self):
        text = self._run_with(lambda case: case.update(timingsComplete=True, decodeErrors=1))
        self.assertIn("| 100 | 100 | 1 |", text)
        self.assertIn("Cobertura sin marca", text)
        self.assertNotIn("³", text)


if __name__ == "__main__":
    unittest.main()
