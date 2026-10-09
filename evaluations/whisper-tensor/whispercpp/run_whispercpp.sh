#!/system/bin/sh
# Runs whisper-cli over every WAV of a corpus directory. Works with Android's /system/bin/sh (toybox)
# and with a Linux shell for the host validation build. Writes, per run, the text (<name>.<r>.txt) and
# the full stderr log (<name>.<r>.log) whose backend lines and timings analyze.py parses.
#
# usage: run_whispercpp.sh <whisper-cli> <model.bin> <wav dir> <out dir> <threads> <language auto|es>
#                          <repeat> <backend cpu|vulkan> [prefix whole|seg6]
CLI=$1; MODEL=$2; WAVS=$3; OUT=$4; THREADS=$5; LANG=$6; REPEAT=$7; BACKEND=$8; PREFIX=${9:-seg6}
mkdir -p "$OUT"
case "$BACKEND" in
  cpu) GPU="-ng" ;;      # explicit: never touch the GPU
  vulkan) GPU="" ;;      # analyze.py rejects the run unless the log proves the Vulkan backend was used
  *) echo "unknown backend $BACKEND" >&2; exit 2 ;;
esac
{
  echo "cli=$CLI"; echo "model=$MODEL"; echo "threads=$THREADS"; echo "language=$LANG"; echo "backend=$BACKEND"
  echo "repeat=$REPEAT"; echo "prefix=$PREFIX"; echo "date=$(date +%s)"
} > "$OUT/run.txt"
# Warm-up (excluded from analysis): first file once.
FIRST=$(ls "$WAVS"/"$PREFIX"-*.wav | head -1)
"$CLI" -m "$MODEL" -f "$FIRST" -t "$THREADS" -l "$LANG" -nt $GPU > "$OUT/warmup.txt" 2> "$OUT/warmup.log"
for wav in "$WAVS"/"$PREFIX"-*.wav; do
  name=$(basename "$wav" .wav)
  r=1
  while [ "$r" -le "$REPEAT" ]; do
    "$CLI" -m "$MODEL" -f "$wav" -t "$THREADS" -l "$LANG" -nt $GPU > "$OUT/$name.$r.txt" 2> "$OUT/$name.$r.log"
    echo "$?" > "$OUT/$name.$r.exit"
    r=$((r + 1))
  done
done
echo done > "$OUT/status.txt"
