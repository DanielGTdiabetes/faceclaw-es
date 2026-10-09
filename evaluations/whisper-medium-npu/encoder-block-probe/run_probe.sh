#!/system/bin/sh
# Static encoder-block probe on the Pixel: CPU XNNPACK vs NNAPI google-edgetpu vs GPU, random inputs.
D=/data/local/tmp/fc-enc-probe
BM=$D/android_aarch64_benchmark_model
OUT=$D/out
mkdir -p $OUT
echo running > $OUT/status.txt
for m in enc-block-fp32 enc-block-fp16 enc-block-int8 enc-stem-fp32 enc-stem-fp16 enc-stem-int8; do
  for b in cpu nnapi gpu; do
    case $b in
      cpu) F="--num_threads=4 --use_xnnpack=true" ;;
      nnapi) F="--use_nnapi=true --nnapi_accelerator_name=google-edgetpu --disable_nnapi_cpu=true --use_xnnpack=false --num_threads=4" ;;
      gpu) F="--use_gpu=true --use_xnnpack=false --num_threads=4" ;;
    esac
    L=$OUT/$m.$b.log
    echo "## $(date +%T) thermal=$(dumpsys thermalservice | grep -m1 'Thermal Status' | tr -d ' ')" > $L
    timeout 600 $BM --graph=$D/$m.tflite $F --num_runs=10 --warmup_runs=2 --min_secs=0 --max_secs=120 \
      --report_peak_memory_footprint=true >> $L 2>&1
    echo "## exit $? $(date +%T)" >> $L
    sleep 10
  done
done
echo done > $OUT/status.txt
