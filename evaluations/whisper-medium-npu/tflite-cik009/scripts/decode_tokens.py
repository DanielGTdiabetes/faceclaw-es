#!/usr/bin/env python3
"""Decode benchmark_model --output_filepath dumps (int32 [1,449] token ids) with the multilingual vocabulary.
Usage: python -I decode_tokens.py --vocab filters_vocab_multilingual.bin <name.tokens.bin>...
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_tflite_reference import EOT, decode, read_filters_vocab  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vocab", required=True)
    ap.add_argument("files", nargs="+")
    args = ap.parse_args()
    _, vocab, _ = read_filters_vocab(args.vocab)
    for path in args.files:
        raw = np.fromfile(path, dtype="<i4")
        tokens = raw[:449].tolist()
        end = tokens.index(EOT) if EOT in tokens else len(tokens)
        print(json.dumps({"file": os.path.basename(path), "bytes": int(raw.nbytes), "tokensBeforeEot": end,
                          "hypothesis": decode(tokens, vocab)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
