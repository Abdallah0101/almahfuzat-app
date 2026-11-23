package org.mahfuzat.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginResult;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class BackupInstrumentedTest {
    @Test
    public void createsZipAndRestoresAudioWithVerifiedChecksum() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File audio = NativeFiles.inAppFiles(context, "recordings/backup-test.m4a");
        File parent = audio.getParentFile();
        if (parent != null) parent.mkdirs();
        byte[] content = "test-audio-content-that-is-never-uploaded".getBytes();
        try (FileOutputStream output = new FileOutputStream(audio)) { output.write(content); }

        JSONObject snapshot = new JSONObject();
        snapshot.put("backup_schema_version", 1);
        snapshot.put("app_schema_version", 1);
        snapshot.put("created_at", "2026-01-01T00:00:00.000Z");
        snapshot.put("device_id", "instrumented-device");
        for (String table : new String[]{"poems", "chapters", "verses", "progress", "playlists", "review_events", "settings", "playback_positions"}) {
            snapshot.put(table, new org.json.JSONArray());
        }
        JSONObject recording = new JSONObject();
        recording.put("file_path", "recordings/backup-test.m4a");
        snapshot.put("recordings", new org.json.JSONArray().put(recording));

        BackupPlugin plugin = new BackupPlugin() {
            @Override public Context getContext() { return context; }
        };
        JSONObject request = new JSONObject();
        request.put("snapshot", snapshot);
        request.put("outputName", "instrumented-backup.zip");
        JSONObject created = invoke(plugin, "createBackup", request);
        File zip = new File(created.getString("path"));
        assertTrue(zip.length() > content.length);

        JSONObject restoreRequest = new JSONObject();
        restoreRequest.put("uri", android.net.Uri.fromFile(zip).toString());
        JSONObject restored = invoke(plugin, "restoreBackup", restoreRequest);
        String restoredPath = restored.getJSONArray("files").getJSONObject(0).getString("restoredPath");
        assertNotEquals("recordings/backup-test.m4a", restoredPath);
        File restoredAudio = NativeFiles.inAppFiles(context, restoredPath);
        byte[] restoredBytes = new byte[(int) restoredAudio.length()];
        try (FileInputStream input = new FileInputStream(restoredAudio)) { input.read(restoredBytes); }
        assertEquals(new String(content), new String(restoredBytes));
        assertEquals(snapshot.getString("created_at"), restored.getJSONObject("snapshot").getString("created_at"));
    }

    private JSONObject invoke(BackupPlugin plugin, String method, JSONObject data) throws Exception {
        CompletableFuture<JSONObject> response = new CompletableFuture<>();
        MessageHandler handler = mock(MessageHandler.class);
        doAnswer(invocation -> {
            PluginResult success = invocation.getArgument(1);
            PluginResult error = invocation.getArgument(2);
            if (error != null) response.completeExceptionally(new AssertionError(error.toString()));
            else response.complete(new JSONObject(success.toString()));
            return null;
        }).when(handler).sendResponseMessage(any(), any(), any());
        PluginCall call = new PluginCall(handler, "MahfuzatBackup", "callback", method, new JSObject(data.toString()));
        if (method.equals("createBackup")) plugin.createBackup(call); else plugin.restoreBackup(call);
        return response.get(30, TimeUnit.SECONDS);
    }
}
