package com.faceclaw.speechprobe;

import android.app.Activity;
import android.content.Intent;
import android.media.AudioFormat;
import android.os.Bundle;
import android.os.Handler;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.speech.*;
import android.speech.tts.TextToSpeech;
import android.widget.TextView;
import java.io.*;
import java.nio.*;
import java.util.*;

/** Temporary diagnostic, not a production engine. Only public APIs and known synthetic audio. */
public final class ProbeActivity extends Activity implements RecognitionListener {
    private final Handler handler = new Handler();
    private final StringBuilder report = new StringBuilder();
    private TextView view;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private ParcelFileDescriptor source;
    private ParcelFileDescriptor writer;
    private boolean finished;
    private long started;
    private Object production;
    private java.lang.reflect.Method productionStop;
    private static final String PHRASE = "El lunes iremos al mercado para comprar tomates y preparar la cena.";

    private void line(String value) {
        report.append(value).append('\n'); view.setText(report.toString());
        try (FileOutputStream output = openFileOutput("report.txt", MODE_PRIVATE)) {
            output.write(report.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (IOException ignored) {}
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); view = new TextView(this); view.setTextSize(17); view.setPadding(24, 48, 24, 24); setContentView(view);
        line("Prueba local con una frase sintética. Sin permiso de micrófono ni Internet.");
        line("SDK=" + android.os.Build.VERSION.SDK_INT);
        if (getIntent().getBooleanExtra("production", false)) {
            handler.postDelayed(() -> done("production-timeout"), 25000); synthesize(); return;
        }
        line("onDeviceAvailable=" + SpeechRecognizer.isOnDeviceRecognitionAvailable(this));
        if (!SpeechRecognizer.isOnDeviceRecognitionAvailable(this)) { done("not-available"); return; }
        try {
            recognizer = SpeechRecognizer.createOnDeviceSpeechRecognizer(this);
            recognizer.setRecognitionListener(this);
            check("es-ES", false, () -> check("ca-ES", false, () -> check("es-ES", true, this::synthesize)));
        } catch (Exception error) { done("factory-error=" + error.getClass().getSimpleName()); }
        handler.postDelayed(() -> done("timeout"), 45000);
    }
    private Intent intent(String language) {
        return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
    }
    private void check(String language, boolean external, Runnable next) {
        Intent request = intent(language);
        ParcelFileDescriptor probe = null;
        try {
            if (external) {
                File empty = new File(getCacheDir(), "check.pcm"); new FileOutputStream(empty).close();
                probe = ParcelFileDescriptor.open(empty, ParcelFileDescriptor.MODE_READ_ONLY);
                audioExtras(request, probe);
            }
            final ParcelFileDescriptor close = probe;
            final boolean[] completed = {false};
            Runnable follow = () -> {
                if (completed[0]) return; completed[0] = true;
                if (close != null) try { close.close(); } catch (IOException ignored) {}
                if (!finished) next.run();
            };
            recognizer.checkRecognitionSupport(request, getMainExecutor(), new RecognitionSupportCallback() {
                public void onSupportResult(RecognitionSupport result) {
                    if (completed[0] || finished) return;
                    line("support " + language + " external=" + external + " installed=" + result.getInstalledOnDeviceLanguages()
                        + " pending=" + result.getPendingOnDeviceLanguages() + " supported=" + result.getSupportedOnDeviceLanguages());
                    follow.run();
                }
                public void onError(int error) {
                    if (completed[0] || finished) return;
                    line("support " + language + " external=" + external + " error=" + error); follow.run();
                }
            });
            handler.postDelayed(() -> { if (!completed[0] && !finished) line("support-query-timeout"); follow.run(); }, 7000);
        } catch (Exception error) { line("support-exception=" + error.getClass().getSimpleName()); if (!finished) next.run(); }
    }
    private static void audioExtras(Intent request, ParcelFileDescriptor descriptor) {
        request.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, descriptor);
        request.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1);
        request.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
        request.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, 16000);
        request.putExtra(RecognizerIntent.EXTRA_SEGMENTED_SESSION, RecognizerIntent.EXTRA_AUDIO_SOURCE);
    }
    private void synthesize() {
        // An offline Spanish SAPI voice on the PC produces this known fixture; never human audio.
        try (InputStream input = getAssets().open("phrase.wav");
             FileOutputStream output = new FileOutputStream(new File(getCacheDir(), "phrase.wav"))) {
            byte[] block = new byte[4096]; int read;
            while ((read = input.read(block)) >= 0) output.write(block, 0, read);
            line("syntheticSource=Microsoft-Helena-Desktop-offline"); recognizeFile();
        } catch (IOException error) { done("synthetic-fixture-missing"); }
    }
    private void recognizeFile() {
        if (finished) return;
        try {
            // Parse RIFF chunks; convert mono PCM16 to the same 16 kHz format supplied by G2.
            byte[] wav = java.nio.file.Files.readAllBytes(new File(getCacheDir(), "phrase.wav").toPath());
            ByteBuffer input = ByteBuffer.wrap(wav).order(ByteOrder.LITTLE_ENDIAN);
            if (input.getInt(0) != 0x46464952 || input.getInt(8) != 0x45564157) throw new IOException("not-riff");
            int rate = 0, channels = 0, bits = 0, encoding = 0, dataOffset = 0, dataSize = 0;
            for (int offset = 12; offset + 8 <= wav.length;) {
                int size = input.getInt(offset + 4); if (size < 0 || size > wav.length - offset - 8) throw new IOException("size");
                int tag = input.getInt(offset);
                if (tag == 0x20746d66 && size >= 16) {
                    encoding = input.getShort(offset + 8); channels = input.getShort(offset + 10);
                    rate = input.getInt(offset + 12); bits = input.getShort(offset + 22);
                }
                if (tag == 0x61746164) { dataOffset = offset + 8; dataSize = size; }
                offset += 8 + size + (size & 1);
            }
            if (encoding != 1 || channels != 1 || bits != 16 || rate <= 0 || dataSize <= 0) throw new IOException("format");
            int samples = dataSize / 2, count = (int)((long)samples * 16000 / rate);
            ByteBuffer pcm = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN);
            for (int i = 0; i < count; i++) {
                double position = (double)i * rate / 16000; int index = (int)position;
                short a = input.getShort(dataOffset + Math.min(index, samples - 1) * 2);
                short b = input.getShort(dataOffset + Math.min(index + 1, samples - 1) * 2);
                pcm.putShort((short)Math.round(a + (b - a) * (position - index)));
            }
            File file = new File(getCacheDir(), "phrase.pcm");
            try (FileOutputStream output = new FileOutputStream(file)) { output.write(pcm.array()); }
            line("syntheticInputMs=" + count / 16 + " format=PCM16-mono-16000");
            if (getIntent().getBooleanExtra("production", false)) { productionAdapter(pcm.array()); return; }
            ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe(); source = pipe[0]; writer = pipe[1];
            Intent request = intent("es-ES"); audioExtras(request, source);
            line("transport=pipe-realtime-50ms segmented=true");
            line("expected=" + PHRASE); started = SystemClock.elapsedRealtime(); recognizer.startListening(request);
            final ParcelFileDescriptor outputDescriptor = writer;
            new Thread(() -> {
                try (FileInputStream bytes = new FileInputStream(file);
                     ParcelFileDescriptor.AutoCloseOutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(outputDescriptor)) {
                    byte[] block = new byte[1600]; int read;
                    while ((read = bytes.read(block)) >= 0) { output.write(block, 0, read); Thread.sleep(50); }
                    Arrays.fill(block, (byte)0);
                    for (int i = 0; i < 20; i++) { output.write(block); Thread.sleep(50); }
                } catch (Exception ignored) {}
            }, "SyntheticAudioPipe").start();
        } catch (Exception error) { done("input-error=" + error.getClass().getSimpleName()); }
    }
    private void result(Bundle bundle) {
        if (finished) return;
        ArrayList<String> text = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        line("resultKeys=" + bundle.keySet());
        line("recognized=" + text); line("elapsedMs=" + (SystemClock.elapsedRealtime() - started)); done("recognition-result");
    }
    private void productionAdapter(byte[] pcm) throws Exception {
        // Same signed Faceclaw package; public Context class loader, no hidden API/reflection into ASI.
        android.content.Context packageContext = createPackageContext("com.faceclaw.app", CONTEXT_INCLUDE_CODE | CONTEXT_IGNORE_SECURITY);
        ClassLoader loader = packageContext.getClassLoader();
        Class<?> adapter = loader.loadClass("com.faceclaw.app.FaceclawSystemTranscriber");
        Class<?> listener = loader.loadClass("com.faceclaw.app.FaceclawLocalTranscriptListener");
        production = adapter.getConstructor(android.content.Context.class).newInstance(this);
        productionStop = adapter.getMethod("stop");
        Object callback = java.lang.reflect.Proxy.newProxyInstance(loader, new Class<?>[] { listener }, (object, method, args) -> {
            if (method.getName().equals("onSegment")) {
                line("productionRecognized=" + args[0]); line("productionWindowMs=" + args[2] + ".." + args[3]);
                line("productionElapsedMs=" + (SystemClock.elapsedRealtime() - started));
                done("production-result");
            }
            if (method.getName().equals("hashCode")) return System.identityHashCode(object);
            if (method.getName().equals("equals")) return object == args[0];
            if (method.getName().equals("toString")) return "SyntheticListener";
            return null;
        });
        adapter.getMethod("setListener", listener).invoke(production, callback);
        boolean accepted = (Boolean)adapter.getMethod("start", String.class, String.class, long.class).invoke(production, "es", "android-system", 15000L);
        line("productionStart=" + accepted + " source=installed-Faceclaw-native-adapter");
        if (!accepted) { done("production-refused"); return; }
        java.lang.reflect.Method accept = adapter.getMethod("acceptPcm", byte[].class, String.class);
        java.lang.reflect.Method diagnostics = adapter.getMethod("diagnostics");
        started = SystemClock.elapsedRealtime();
        Runnable feed = new Runnable() {
            int offset = 0, silence = 0;
            public void run() {
                if (finished) return;
                try {
                    String state = String.valueOf(diagnostics.invoke(production));
                    if (state.contains("\"status\":\"error\"")) { line(state); done("production-error"); return; }
                    if (state.contains("\"status\":\"listo\"")) {
                        byte[] block = new byte[1600];
                        if (offset < pcm.length) { int size = Math.min(1600, pcm.length - offset); System.arraycopy(pcm, offset, block, 0, size); offset += size; }
                        else if (silence++ > 120) { line(state); done("production-empty"); return; }
                        accept.invoke(production, block, "sin actividad");
                    }
                    handler.postDelayed(this, 50);
                } catch (Exception error) { done("production-feed-error=" + error.getClass().getSimpleName()); }
            }
        };
        handler.post(feed);
    }
    private void done(String reason) {
        if (finished) return; finished = true; line("finished=" + reason);
        handler.removeCallbacksAndMessages(null);
        if (productionStop != null) try { productionStop.invoke(production); } catch (Exception ignored) {}
        if (production != null) handler.postDelayed(() -> {
            try { line("productionAfterStop=" + production.getClass().getMethod("diagnostics").invoke(production)); }
            catch (Exception ignored) {}
        }, 500);
        if (recognizer != null) { recognizer.cancel(); recognizer.destroy(); recognizer = null; }
        if (tts != null) { tts.stop(); tts.shutdown(); tts = null; }
        if (source != null) try { source.close(); } catch (IOException ignored) {}
        if (writer != null) try { writer.close(); } catch (IOException ignored) {}
        for (String name : new String[] {"phrase.wav", "phrase.pcm", "check.pcm"}) new File(getCacheDir(), name).delete();
    }
    @Override public void onDestroy() { done("activity-closed"); super.onDestroy(); }
    public void onReadyForSpeech(Bundle b) { line("ready-for-synthetic-audio"); }
    public void onBeginningOfSpeech() {}
    public void onRmsChanged(float value) {}
    public void onBufferReceived(byte[] b) {}
    public void onEndOfSpeech() {}
    public void onError(int error) { if (!finished) done("recognition-error=" + error); }
    public void onResults(Bundle b) { result(b); }
    public void onPartialResults(Bundle b) { if (!finished) line("partial=" + b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)); }
    public void onEvent(int type, Bundle b) {}
    public void onSegmentResults(Bundle b) { result(b); }
    public void onEndOfSegmentedSession() { done("end-segmented"); }
}
