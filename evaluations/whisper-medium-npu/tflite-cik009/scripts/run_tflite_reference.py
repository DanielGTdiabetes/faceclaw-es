#!/usr/bin/env python3
"""PC CPU reference for the public whisper.tflite medium artifact (cik009/whisper@08cc7cd).

Functional check only: does the single-graph model (log-mel [1,80,3000] -> greedy token ids [1,449])
load, run and produce sensible Spanish/Catalan text with its own frontend contract? Timings are a
x86 WSL2 CPU reference, never Pixel/Tensor or NPU evidence.

Usage (inside a venv with ai-edge-litert + numpy):
  python -I run_tflite_reference.py --model whisper-medium.tflite --vocab filters_vocab_multilingual.bin \
      --corpus <corpus/out> --out result.json [--threads 4] [--ids es-fleurs-00,...]
"""
import argparse
import json
import platform
import struct
import time

import numpy as np

SAMPLE_RATE = 16000
N_FFT = 400
HOP = 160
N_FRAMES = 3000
EOT = 50257  # multilingual vocabulary: first special token


def read_filters_vocab(path):
    """whisper.tflite container: 'tflt' magic, mel filters (n_mel x n_fft floats), then vocabulary."""
    with open(path, "rb") as f:
        data = f.read()
    off = 0
    (magic,) = struct.unpack_from("<I", data, off); off += 4
    if magic != 0x74666C74:
        raise ValueError("unexpected magic 0x%08x" % magic)
    n_mel, n_fft = struct.unpack_from("<ii", data, off); off += 8
    filters = np.frombuffer(data, dtype="<f4", count=n_mel * n_fft, offset=off).reshape(n_mel, n_fft)
    off += 4 * n_mel * n_fft
    (n_vocab,) = struct.unpack_from("<i", data, off); off += 4
    vocab = []
    for _ in range(n_vocab):
        (n,) = struct.unpack_from("<i", data, off); off += 4
        vocab.append(data[off:off + n]); off += n
    return filters, vocab, off == len(data)


def log_mel(pcm, filters):
    """OpenAI Whisper frontend: Hann 400/160, |STFT|^2, mel, log10, clamp(max-8), (x+4)/4, padded to 30 s."""
    audio = np.zeros(N_FRAMES * HOP, dtype=np.float32)
    n = min(len(pcm), len(audio))
    audio[:n] = pcm[:n]
    padded = np.pad(audio, (N_FFT // 2, N_FFT // 2), mode="reflect")
    window = np.hanning(N_FFT + 1)[:-1].astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(padded, N_FFT)[::HOP][:N_FRAMES]
    power = np.abs(np.fft.rfft(frames * window, axis=-1)) ** 2  # [3000, 201]
    mel = filters @ power.T  # [80, 3000]
    logspec = np.log10(np.maximum(mel, 1e-10))
    logspec = np.maximum(logspec, logspec.max() - 8.0)
    return ((logspec + 4.0) / 4.0).astype(np.float32)[None]


def decode(tokens, vocab):
    text = b"".join(vocab[t] for t in tokens if 0 <= t < EOT and t < len(vocab))
    return text.decode("utf-8", errors="replace").strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--vocab", required=True)
    ap.add_argument("--corpus", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--signature", default="serving_default")
    ap.add_argument("--ids", default="")
    args = ap.parse_args()
    from ai_edge_litert.interpreter import Interpreter  # only the runner needs LiteRT; decode_tokens.py does not

    filters, vocab, consumed = read_filters_vocab(args.vocab)
    t0 = time.perf_counter()
    interp = Interpreter(model_path=args.model, num_threads=args.threads)
    runner = interp.get_signature_runner(args.signature)
    load_ms = (time.perf_counter() - t0) * 1000

    manifest = json.load(open(args.corpus + "/manifest.json", encoding="utf-8"))
    wanted = set(filter(None, args.ids.split(",")))
    rows = []
    for fx in manifest["fixtures"]:
        if wanted and fx["id"] not in wanted:
            continue
        if fx["kind"] != "speech" and not wanted:
            continue
        pcm = np.fromfile(args.corpus + "/" + fx["file"], dtype="<i2").astype(np.float32) / 32768.0
        t1 = time.perf_counter()
        mel = log_mel(pcm, filters)
        mel_ms = (time.perf_counter() - t1) * 1000
        t2 = time.perf_counter()
        out = runner(input_features=mel)
        infer_ms = (time.perf_counter() - t2) * 1000
        seq = next(iter(out.values()))[0].tolist()
        rows.append({"id": fx["id"], "language": fx.get("language"), "durationMs": fx.get("durationMs"),
                     "melMs": round(mel_ms, 1), "inferMs": round(infer_ms, 1),
                     "tokens": seq[:seq.index(EOT) + 1] if EOT in seq else seq,
                     "specialTokens": [t for t in seq if t >= EOT][:8],
                     "hypothesis": decode(seq, vocab), "reference": fx.get("reference")})
        print("%-16s mel %6.0f ms  infer %7.0f ms  %s" % (fx["id"], mel_ms, infer_ms, rows[-1]["hypothesis"][:90]),
              flush=True)

    result = {"kind": "pc-cpu-reference (not Pixel, not NPU)", "machine": platform.platform(),
              "processor": platform.processor() or platform.machine(), "threads": args.threads,
              "signature": args.signature, "loadMs": round(load_ms, 1), "vocabSize": len(vocab),
              "filtersShape": list(filters.shape), "vocabFileFullyConsumed": consumed, "rows": rows}
    json.dump(result, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
