package org.mahfuzat.app;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

import android.Manifest;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.MessageHandler;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginResult;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class RecordingPermissionInstrumentedTest {
    @Test
    public void microphoneRequestSucceedsWithoutLegacyStoragePermission() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.RECORD_AUDIO);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            CompletableFuture<JSONObject> response = new CompletableFuture<>();
            scenario.onActivity(activity -> {
                AudioPlugin plugin = (AudioPlugin) activity.getBridge().getPlugin("MahfuzatAudio").getInstance();
                MessageHandler handler = mock(MessageHandler.class);
                doAnswer(invocation -> {
                    PluginResult success = invocation.getArgument(1);
                    PluginResult error = invocation.getArgument(2);
                    if (error != null) response.completeExceptionally(new AssertionError(error.toString()));
                    else response.complete(new JSONObject(success.toString()));
                    return null;
                }).when(handler).sendResponseMessage(any(), any(), any());
                JSArray permissions = new JSArray();
                permissions.put("microphone");
                JSObject data = new JSObject();
                data.put("permissions", permissions);
                PluginCall call = new PluginCall(handler, "MahfuzatAudio", "callback", "requestPermissions", data);
                plugin.requestPermissions(call);
            });
            JSONObject result = response.get(15, TimeUnit.SECONDS);
            assertEquals("granted", result.getString("microphone"));
        }
    }
}
