package org.mahfuzat.app;

import android.Manifest;
import android.media.MediaMetadataRetriever;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "MahfuzatAudio",
    permissions = {
        @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO}),
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
    }
)
public class AudioPlugin extends Plugin {
    private final ExecutorService exportExecutor = Executors.newSingleThreadExecutor();
    private MediaRecorder recorder;
    private File pendingRecording;
    private long recordingStartedAt;

    @Override
    public void load() {
        PlaybackService.eventSink = state -> {
            try {
                notifyListeners("playbackState", JSObject.fromJSONObject(state));
            } catch (JSONException ignored) {}
        };
    }

    @PluginMethod
    public void startRecording(PluginCall call) {
        String relativePath = call.getString("relativePath");
        if (recorder != null) {
            call.reject("Another recording is active");
            return;
        }
        try {
            pendingRecording = NativeFiles.inAppFiles(getContext(), relativePath);
            File parent = pendingRecording.getParentFile();
            if (parent != null && !parent.mkdirs() && !parent.isDirectory()) throw new IllegalStateException("Cannot create recording directory");
            recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(getContext()) : new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioSamplingRate(44100);
            recorder.setAudioChannels(1);
            recorder.setAudioEncodingBitRate(96000);
            recorder.setOutputFile(pendingRecording.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            recordingStartedAt = System.currentTimeMillis();
            call.resolve();
        } catch (Exception error) {
            releaseRecorder();
            call.reject("Could not start AAC recording", error);
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (recorder == null || pendingRecording == null) {
            call.reject("No active recording");
            return;
        }
        File file = pendingRecording;
        try {
            recorder.stop();
            releaseRecorder();
            MediaMetadataRetriever metadata = new MediaMetadataRetriever();
            metadata.setDataSource(file.getAbsolutePath());
            String duration = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            metadata.release();
            long durationMs = duration == null ? System.currentTimeMillis() - recordingStartedAt : Long.parseLong(duration);
            JSObject result = new JSObject();
            result.put("relativePath", relativePath(file));
            result.put("mimeType", "audio/mp4");
            result.put("codec", "AAC");
            result.put("sizeBytes", file.length());
            result.put("durationMs", durationMs);
            pendingRecording = null;
            call.resolve(result);
        } catch (Exception error) {
            releaseRecorder();
            pendingRecording = null;
            file.delete();
            call.reject("Recording was too short or could not be finalized", error);
        }
    }

    @PluginMethod
    public void cancelRecording(PluginCall call) {
        try {
            releaseRecorder();
            String relativePath = call.getString("relativePath");
            File file = pendingRecording != null ? pendingRecording : NativeFiles.inAppFiles(getContext(), relativePath);
            if (file.exists() && !file.delete()) throw new IllegalStateException("Could not delete pending recording");
            pendingRecording = null;
            call.resolve();
        } catch (Exception error) {
            pendingRecording = null;
            call.reject("Could not cancel recording", error);
        }
    }

    private void releaseRecorder() {
        if (recorder != null) {
            try { recorder.reset(); } catch (Exception ignored) {}
            try { recorder.release(); } catch (Exception ignored) {}
            recorder = null;
        }
    }

    private String relativePath(File file) throws java.io.IOException {
        return getContext().getFilesDir().getCanonicalFile().toURI().relativize(file.getCanonicalFile().toURI()).getPath();
    }

    @PluginMethod
    public void playQueue(PluginCall call) {
        sendService(PlaybackService.ACTION_PLAY_QUEUE, call.getData().toString(), call);
    }

    @PluginMethod public void pause(PluginCall call) { sendService(PlaybackService.ACTION_PAUSE, null, call); }
    @PluginMethod public void resume(PluginCall call) { sendService(PlaybackService.ACTION_RESUME, null, call); }
    @PluginMethod public void stop(PluginCall call) { sendService(PlaybackService.ACTION_STOP, null, call); }
    @PluginMethod public void next(PluginCall call) { sendService(PlaybackService.ACTION_NEXT, null, call); }
    @PluginMethod public void previous(PluginCall call) { sendService(PlaybackService.ACTION_PREVIOUS, null, call); }

    @PluginMethod
    public void seekTo(PluginCall call) {
        JSONObject data = new JSONObject();
        try { data.put("positionMs", call.getLong("positionMs")); } catch (JSONException error) { call.reject(error.getMessage()); return; }
        sendService(PlaybackService.ACTION_SEEK, data.toString(), call);
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        Float speed = call.getFloat("speed");
        if (speed == null || speed < 0.5f || speed > 2.0f) { call.reject("Speed must be between 0.5 and 2"); return; }
        JSONObject data = new JSONObject();
        try { data.put("speed", speed); } catch (JSONException error) { call.reject(error.getMessage()); return; }
        sendService(PlaybackService.ACTION_SPEED, data.toString(), call);
    }

    private void sendService(String action, String payload, PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(getContext(), PlaybackService.class);
            intent.setAction(action);
            if (payload != null) intent.putExtra("payload", payload);
            getContext().startService(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not control playback service", error);
        }
    }

    @PluginMethod
    public void getPlaybackState(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(PlaybackService.latestState()));
        } catch (JSONException error) {
            call.reject("Could not read playback state", error);
        }
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void exportWav(PluginCall call) {
        exportExecutor.execute(() -> {
            File temporary = null;
            try {
                String outputName = call.getString("outputName", "mahfuzat-export.wav");
                if (!outputName.endsWith(".wav") || outputName.contains("/") || outputName.contains("\\")) {
                    throw new IllegalArgumentException("Invalid WAV file name");
                }
                File directory = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC), "exports");
                if (!directory.mkdirs() && !directory.isDirectory()) throw new IllegalStateException("Cannot create export directory");
                File output = new File(directory, outputName);
                int suffix = 2;
                while (output.exists()) {
                    output = new File(directory, outputName.replace(".wav", "-" + suffix + ".wav"));
                    suffix++;
                }
                temporary = new File(directory, output.getName() + ".tmp");
                WavExporter.Result exported = new WavExporter(getContext()).export(call.getData(), temporary,
                    (percent, processed, total) -> {
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        progress.put("processedItems", processed);
                        progress.put("totalItems", total);
                        notifyListeners("exportProgress", progress);
                    });
                if (!temporary.renameTo(output)) throw new IllegalStateException("Could not finalize WAV file");
                JSObject result = new JSObject();
                result.put("path", output.getAbsolutePath());
                result.put("url", FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", output).toString());
                result.put("sizeBytes", output.length());
                result.put("durationMs", exported.durationMs);
                call.resolve(result);
            } catch (Exception error) {
                if (temporary != null) temporary.delete();
                call.reject("WAV export failed: " + error.getMessage(), error);
            }
        });
    }
}
