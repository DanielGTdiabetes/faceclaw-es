#!/usr/bin/env python3
"""Static-shape probe: one Whisper-medium-shaped encoder block as .tflite in float32, fp16-weights and full int8.

Synthetic random weights; measures only whether a backend (NNAPI google-edgetpu, GPU) accepts and how fast it runs
this operator mix with static shapes. It is NOT Whisper, has no accuracy meaning and is not a converted model.
Shapes follow Whisper medium: d_model 1024, 16 heads, FFN 4096, 1500 encoder positions (30 s), pre-LayerNorm, GELU.
Also emits the front conv stem (2x Conv1D, GELU) as a separate model.

Usage: python -I make_encoder_block.py <outdir>
"""
import os
import sys

import numpy as np
import tensorflow as tf

D, H, FFN, T, MEL = 1024, 16, 4096, 1500, 80


def block():
    x = tf.keras.Input(shape=(T, D), batch_size=1, name="hidden")
    h = tf.keras.layers.LayerNormalization(epsilon=1e-5)(x)
    att = tf.keras.layers.MultiHeadAttention(num_heads=H, key_dim=D // H)(h, h)
    x2 = tf.keras.layers.Add()([x, att])
    h2 = tf.keras.layers.LayerNormalization(epsilon=1e-5)(x2)
    f = tf.keras.layers.Dense(FFN)(h2)
    f = tf.keras.layers.Activation(lambda v: tf.nn.gelu(v, approximate=False))(f)
    f = tf.keras.layers.Dense(D)(f)
    out = tf.keras.layers.Add()([x2, f])
    return tf.keras.Model(x, out, name="whisper_medium_encoder_block")


def stem():
    x = tf.keras.Input(shape=(2 * T, MEL), batch_size=1, name="mel")  # NWC: 3000 frames x 80 mel
    h = tf.keras.layers.Conv1D(D, 3, padding="same")(x)
    h = tf.keras.layers.Activation(lambda v: tf.nn.gelu(v, approximate=False))(h)
    h = tf.keras.layers.Conv1D(D, 3, strides=2, padding="same")(h)
    h = tf.keras.layers.Activation(lambda v: tf.nn.gelu(v, approximate=False))(h)
    return tf.keras.Model(x, h, name="whisper_medium_conv_stem")


def convert(model, shape, out, mode):
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    if mode == "fp16":
        conv.optimizations = [tf.lite.Optimize.DEFAULT]
        conv.target_spec.supported_types = [tf.float16]
    elif mode == "int8":
        rng = np.random.default_rng(0)

        def rep():
            for _ in range(8):
                yield [rng.standard_normal(shape).astype(np.float32)]

        conv.optimizations = [tf.lite.Optimize.DEFAULT]
        conv.representative_dataset = rep
        conv.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        conv.inference_input_type = tf.int8
        conv.inference_output_type = tf.int8
    data = conv.convert()
    with open(out, "wb") as f:
        f.write(data)
    print(out, len(data))


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    tf.keras.utils.set_random_seed(0)
    b, s = block(), stem()
    for mode in ("fp32", "fp16", "int8"):
        convert(b, (1, T, D), os.path.join(outdir, "enc-block-%s.tflite" % mode), mode)
        convert(s, (1, 2 * T, MEL), os.path.join(outdir, "enc-stem-%s.tflite" % mode), mode)


if __name__ == "__main__":
    main()
