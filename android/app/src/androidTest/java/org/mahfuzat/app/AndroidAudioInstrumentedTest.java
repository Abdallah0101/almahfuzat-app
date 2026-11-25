package org.mahfuzat.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.MediaRecorder;
import android.os.Build;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidAudioInstrumentedTest {
    private Context context;
    private UiDevice device;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        if (Build.VERSION.SDK_INT >= 28) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.RECORD_AUDIO);
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
    }

    @After
    public void tearDown() throws Exception {
        context.startService(new Intent(context, PlaybackService.class).setAction(PlaybackService.ACTION_STOP));
        device.wakeUp();
    }

    @Test
    public void recordsFiveVersesPlaysRepeatsInBackgroundAndExportsWav() throws Exception {
        JSONArray items = new JSONArray();
        for (int number = 1; number <= 5; number++) {
            String path = "recordings/instrumented-" + number + ".m4a";
            record(NativeFiles.inAppFiles(context, path), 1000);
            JSONObject item = new JSONObject();
            item.put("poemId", "instrumented-poem");
            item.put("verseId", "stable-" + number);
            item.put("poemTitle", "اختبار صوتي");
            item.put("verseNumber", number);
            item.put("relativePath", path);
            items.put(item);
        }

        startQueue(items, 3, 0);
        assertTrue(waitForPlaying());
        device.pressHome();
        Thread.sleep(1200);
        assertTrue("Playback stopped after Home: " + PlaybackService.latestState(), PlaybackService.latestState().getBoolean("playing"));
        device.pressKeyCode(android.view.KeyEvent.KEYCODE_POWER);
        Thread.sleep(1200);
        assertTrue("Playback stopped after screen off: " + PlaybackService.latestState(), PlaybackService.latestState().getBoolean("playing"));
        device.wakeUp();

        JSONArray thirdAndFourth = new JSONArray();
        thirdAndFourth.put(items.getJSONObject(2));
        thirdAndFourth.put(items.getJSONObject(3));
        startQueue(thirdAndFourth, 5, 0);
        assertTrue(waitForLogicalItem(1, 20_000));

        File wav = new File(context.getCacheDir(), "instrumented-export.wav");
        JSONObject request = new JSONObject();
        request.put("items", items);
        request.put("verseRepeats", 2);
        request.put("groupRepeats", 1);
        request.put("gapSeconds", 1);
        WavExporter.Result result = new WavExporter(context).export(request, wav, (percent, processed, total) -> {});
        assertTrue("WAV contains decoded audio", wav.length() > 44);
        assertTrue(result.durationMs >= 5000);
        try (RandomAccessFile input = new RandomAccessFile(wav, "r")) {
            byte[] header = new byte[44];
            input.readFully(header);
            assertEquals("RIFF", new String(header, 0, 4));
            assertEquals("WAVE", new String(header, 8, 4));
            assertEquals(1, header[22]);
            assertEquals(44100, littleEndianInt(header, 24));
            assertEquals(wav.length() - 44, littleEndianInt(header, 40));
        }
    }

    @Test
    public void publishesWavToDownloadsAndBuildsShareIntent() throws Exception {
        if (Build.VERSION.SDK_INT < 29) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.WRITE_EXTERNAL_STORAGE);
        }
        File source = new File(context.getCacheDir(), "public-export-source.wav");
        byte[] content = "RIFF-test-WAVE-public-download".getBytes();
        try (FileOutputStream output = new FileOutputStream(source)) { output.write(content); }
        String outputName = "instrumented-public-" + System.currentTimeMillis() + ".wav";
        PublicAudioExport.Publication publication = null;
        try {
            publication = PublicAudioExport.publish(context, source, outputName);
            assertEquals("Download/AlMahfuzat/" + outputName, publication.displayPath);
            assertEquals("content", publication.uri.getScheme());
            try (InputStream input = context.getContentResolver().openInputStream(publication.uri)) {
                byte[] restored = new byte[content.length];
                assertEquals(content.length, input.read(restored));
                assertEquals(new String(content), new String(restored));
            }
            Intent share = AudioPlugin.createShareIntent(context, publication.uri, "WAV test");
            assertEquals(Intent.ACTION_SEND, share.getAction());
            assertEquals("audio/wav", share.getType());
            assertEquals(publication.uri, share.getParcelableExtra(Intent.EXTRA_STREAM));
            assertTrue((share.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
            Intent chooser = Intent.createChooser(share, "Share WAV test");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);
            assertTrue("Android share sheet did not open", waitForShareSheet());
            device.pressBack();
        } finally {
            if (publication != null) {
                if (Build.VERSION.SDK_INT >= 29) context.getContentResolver().delete(publication.uri, null, null);
                else new File(publication.path).delete();
            }
            source.delete();
        }
    }

    private boolean waitForShareSheet() throws Exception {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            String windows = device.executeShellCommand("dumpsys window");
            if (windows.matches("(?s).*mCurrentFocus=.*com\\.android\\.intentresolver/\\.ChooserActivity.*")) return true;
            Thread.sleep(200);
        }
        return false;
    }

    private void record(File file, long durationMs) throws Exception {
        File parent = file.getParentFile();
        if (parent != null) parent.mkdirs();
        MediaRecorder recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(context) : new MediaRecorder();
        try {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioSamplingRate(44100);
            recorder.setAudioChannels(1);
            recorder.setAudioEncodingBitRate(96000);
            recorder.setOutputFile(file.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            Thread.sleep(durationMs);
            recorder.stop();
        } finally {
            recorder.release();
        }
        assertTrue("AAC/M4A file is non-empty", file.length() > 500);
    }

    private void startQueue(JSONArray items, int verseRepeats, int gapSeconds) throws Exception {
        JSONObject request = new JSONObject();
        request.put("items", items);
        request.put("verseRepeats", verseRepeats);
        request.put("groupRepeats", 1);
        request.put("gapSeconds", gapSeconds);
        request.put("speed", 1.0);
        context.startService(new Intent(context, PlaybackService.class)
            .setAction(PlaybackService.ACTION_PLAY_QUEUE)
            .putExtra("payload", request.toString()));
    }

    private boolean waitForPlaying() throws Exception {
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            if (PlaybackService.latestState().optBoolean("playing")) return true;
            Thread.sleep(100);
        }
        return false;
    }

    private boolean waitForLogicalItem(int expected, long timeout) throws Exception {
        long deadline = System.currentTimeMillis() + timeout;
        while (System.currentTimeMillis() < deadline) {
            JSONObject state = PlaybackService.latestState();
            if (state.optInt("currentIndex") == expected && state.optBoolean("playing")) return true;
            if (state.has("error")) throw new AssertionError(state.getString("error"));
            Thread.sleep(100);
        }
        return false;
    }

    private static int littleEndianInt(byte[] bytes, int offset) {
        return (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8)
            | ((bytes[offset + 2] & 0xff) << 16) | ((bytes[offset + 3] & 0xff) << 24);
    }
}
