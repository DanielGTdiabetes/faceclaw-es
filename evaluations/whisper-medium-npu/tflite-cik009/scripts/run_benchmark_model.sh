#!/system/bin/sh
# Same whisper-medium.tflite + same real log-mel input (es-fleurs-00) on each backend, with the official
# TFLite benchmark_model. Run from adb shell:  sh /data/local/tmp/fc-tflite-medium/run_benchmark_model.sh
# Every log keeps the delegate lines ("Replacing N out of M node(s)...") that prove what was delegated.
# Output tensors (token ids) are written per backend so the PC can decode and compare the transcript.
D=/data/local/tmp/fc-tflite-medium
BM=$D/android_aarch64_benchmark_model
M=$D/whisper-medium.tflite
IN=$D/es-fleurs-00.mel.f32
OUT=$D/out
mkdir -p $OUT
COMMON="--graph=$M --signature_to_run_for=serving_default --input_layer=input_features --input_layer_shape=1,80,3000 \
 --input_layer_value_files=input_features:$IN --min_secs=0 --max_secs=900 --report_peak_memory_footprint=true"

snap() { # thermal/battery before/after each block, aggregate only
  echo "## $1 $(date +%T) thermal=$(dumpsys thermalservice | grep -m1 'Thermal Status' | tr -d ' ') \
battery=$(dumpsys battery | grep -m1 temperature | tr -d ' ')"
}

run() { # name, extra flags...
  name=$1; shift
  snap "before-$name" > $OUT/$name.log
  timeout 1800 $BM $COMMON --output_filepath=$OUT/$name.tokens.bin "$@" >> $OUT/$name.log 2>&1
  echo "## exit $? $(date +%T)" >> $OUT/$name.log
  snap "after-$name" >> $OUT/$name.log
  sleep 60
}

echo running > $OUT/status.txt
run cpu-t4 --num_threads=4 --use_xnnpack=true --num_runs=3 --warmup_runs=1
run cpu-t1 --num_threads=1 --use_xnnpack=true --num_runs=3 --warmup_runs=1
run nnapi-edgetpu --use_nnapi=true --nnapi_accelerator_name=google-edgetpu --disable_nnapi_cpu=true \
  --num_threads=4 --use_xnnpack=false --num_runs=2 --warmup_runs=1 --enable_op_profiling=true
run nnapi-edgetpu-fp16 --use_nnapi=true --nnapi_accelerator_name=google-edgetpu --disable_nnapi_cpu=true \
  --nnapi_allow_fp16=true --num_threads=4 --use_xnnpack=false --num_runs=2 --warmup_runs=1 --enable_op_profiling=true
run gpu --use_gpu=true --gpu_precision_loss_allowed=true --num_threads=4 --use_xnnpack=false \
  --num_runs=2 --warmup_runs=1 --enable_op_profiling=true
echo done > $OUT/status.txt
