package org.mahfuzat.app;

import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.exoplayer.source.SilenceMediaSource;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONObject;

public class PlaybackService extends MediaSessionService {
    static final String ACTION_PLAY_QUEUE = "org.mahfuzat.app.PLAY_QUEUE";
    static final String ACTION_PAUSE = "org.mahfuzat.app.PAUSE";
    static final String ACTION_RESUME = "org.mahfuzat.app.RESUME";
    static final String ACTION_STOP = "org.mahfuzat.app.STOP";
    static final String ACTION_NEXT = "org.mahfuzat.app.NEXT";
    static final String ACTION_PREVIOUS = "org.mahfuzat.app.PREVIOUS";
    static final String ACTION_SEEK = "org.mahfuzat.app.SEEK";
    static final String ACTION_SPEED = "org.mahfuzat.app.SPEED";
    static volatile Consumer<JSONObject> eventSink;
    private static volatile JSONObject lastState = emptyState();

    private ExoPlayer player;
    private MediaSession session;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Item> logicalItems = new ArrayList<>();
    private final List<Integer> sourceLogicalIndexes = new ArrayList<>();
    private float speed = 1f;
    private boolean ended;
    private String error;

    private static final class Item {
        String poemId;
        String verseId;
        String title;
        int number;
        String path;
    }

    private final Runnable positionUpdater = new Runnable() {
        @Override public void run() {
            emitState();
            if (player != null && player.isPlaying()) handler.postDelayed(this, 500);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.setWakeMode(C.WAKE_MODE_LOCAL);
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean isPlaying) {
                handler.removeCallbacks(positionUpdater);
                if (isPlaying) handler.post(positionUpdater);
                emitState();
            }
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) ended = true;
                emitState();
            }
            @Override public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
                ended = false;
                error = null;
                emitState();
            }
            @Override public void onPlayerError(PlaybackException playbackError) {
                error = playbackError.getMessage();
                emitState();
            }
        });
        session = new MediaSession.Builder(this, player).setId(getPackageName()).build();
        setMediaNotificationProvider(new DefaultMediaNotificationProvider(this));
        emitState();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);
        if (intent != null && intent.getAction() != null) {
            try {
                handle(intent.getAction(), intent.getStringExtra("payload"));
            } catch (Exception exception) {
                error = exception.getMessage();
                emitState();
            }
        }
        return START_NOT_STICKY;
    }

    private void handle(String action, String payload) throws Exception {
        switch (action) {
            case ACTION_PLAY_QUEUE:
                JSONObject request = new JSONObject(payload);
                setQueue(request);
                break;
            case ACTION_PAUSE: player.pause(); break;
            case ACTION_RESUME: if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare(); player.play(); break;
            case ACTION_STOP:
                player.stop();
                player.setMediaSources(java.util.Collections.emptyList());
                logicalItems.clear();
                sourceLogicalIndexes.clear();
                ended = false;
                stopSelf();
                emitState();
                break;
            case ACTION_NEXT: seekLogical(1); break;
            case ACTION_PREVIOUS: seekLogical(-1); break;
            case ACTION_SEEK: player.seekTo(new JSONObject(payload).getLong("positionMs")); break;
            case ACTION_SPEED:
                speed = (float) new JSONObject(payload).getDouble("speed");
                player.setPlaybackSpeed(speed);
                emitState();
                break;
            default: break;
        }
    }

    private void setQueue(JSONObject request) throws Exception {
        JSONArray items = request.getJSONArray("items");
        int verseRepeats = Math.max(1, request.optInt("verseRepeats", 1));
        int groupRepeats = Math.max(1, request.optInt("groupRepeats", 1));
        int gapSeconds = request.optInt("gapSeconds", 0);
        speed = (float) request.optDouble("speed", 1.0);
        int startIndex = Math.max(0, request.optInt("startIndex", 0));
        if (items.length() == 0) throw new IllegalArgumentException("Empty playlist");
        if (verseRepeats > 100 || groupRepeats > 100) throw new IllegalArgumentException("Repeat count exceeds 100");

        logicalItems.clear();
        for (int index = 0; index < items.length(); index++) {
            JSONObject value = items.getJSONObject(index);
            Item item = new Item();
            item.poemId = value.getString("poemId");
            item.verseId = value.getString("verseId");
            item.title = value.getString("poemTitle");
            item.number = value.getInt("verseNumber");
            item.path = value.getString("relativePath");
            logicalItems.add(item);
        }

        List<MediaSource> sources = new ArrayList<>();
        sourceLogicalIndexes.clear();
        ProgressiveMediaSource.Factory audioFactory = new ProgressiveMediaSource.Factory(new DefaultDataSource.Factory(this));
        for (int group = 0; group < groupRepeats; group++) {
            for (int logical = 0; logical < logicalItems.size(); logical++) {
                Item item = logicalItems.get(logical);
                File audioFile = NativeFiles.inAppFiles(this, item.path);
                if (!audioFile.isFile()) throw new IllegalArgumentException("Missing audio file for verse " + item.number);
                MediaItem mediaItem = new MediaItem.Builder()
                    .setUri(android.net.Uri.fromFile(audioFile))
                    .setMediaId(item.verseId)
                    .setMediaMetadata(new MediaMetadata.Builder()
                        .setTitle("البيت " + item.number)
                        .setArtist(item.title)
                        .setAlbumTitle("المحفوظات")
                        .build())
                    .build();
                for (int repeat = 0; repeat < verseRepeats; repeat++) {
                    sources.add(audioFactory.createMediaSource(mediaItem));
                    sourceLogicalIndexes.add(logical);
                    if (gapSeconds > 0) {
                        sources.add(new SilenceMediaSource(gapSeconds * 1_000_000L));
                        sourceLogicalIndexes.add(logical);
                    }
                }
            }
        }
        ended = false;
        error = null;
        player.setMediaSources(sources);
        player.setPlaybackSpeed(speed);
        player.prepare();
        int expandedStart = 0;
        for (int index = 0; index < sourceLogicalIndexes.size(); index++) {
            if (sourceLogicalIndexes.get(index) >= startIndex) { expandedStart = index; break; }
        }
        player.seekTo(expandedStart, 0);
        player.play();
    }

    private void seekLogical(int direction) {
        if (player == null || sourceLogicalIndexes.isEmpty()) return;
        int currentSource = player.getCurrentMediaItemIndex();
        int currentLogical = sourceLogicalIndexes.get(Math.max(0, currentSource));
        if (direction < 0 && player.getCurrentPosition() > 3000) {
            player.seekTo(currentSource, 0);
            return;
        }
        int target = currentLogical + direction;
        for (int index = 0; index < sourceLogicalIndexes.size(); index++) {
            if (sourceLogicalIndexes.get(index) == target) {
                player.seekTo(index, 0);
                ended = false;
                return;
            }
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(positionUpdater);
        if (session != null) session.release();
        if (player != null) player.release();
        super.onDestroy();
    }

    private void emitState() {
        if (player == null) return;
        int currentSource = Math.max(0, player.getCurrentMediaItemIndex());
        int logical = sourceLogicalIndexes.isEmpty() || currentSource >= sourceLogicalIndexes.size() ? 0 : sourceLogicalIndexes.get(currentSource);
        Item item = logicalItems.isEmpty() || logical >= logicalItems.size() ? null : logicalItems.get(logical);
        JSONObject state = new JSONObject();
        try {
            state.put("playing", player.isPlaying());
            state.put("ended", ended);
            state.put("poemId", item == null ? JSONObject.NULL : item.poemId);
            state.put("verseId", item == null ? JSONObject.NULL : item.verseId);
            state.put("title", item == null ? JSONObject.NULL : item.title);
            state.put("verseNumber", item == null ? 0 : item.number);
            state.put("positionMs", Math.max(0, player.getCurrentPosition()));
            state.put("durationMs", Math.max(0, player.getDuration()));
            state.put("speed", speed);
            state.put("currentIndex", logical);
            state.put("itemCount", logicalItems.size());
            if (error != null) state.put("error", error);
        } catch (Exception ignored) {}
        lastState = state;
        Consumer<JSONObject> sink = eventSink;
        if (sink != null) sink.accept(state);
    }

    static JSONObject latestState() {
        return lastState;
    }

    private static JSONObject emptyState() {
        JSONObject state = new JSONObject();
        try {
            state.put("playing", false);
            state.put("ended", false);
            state.put("positionMs", 0);
            state.put("durationMs", 0);
            state.put("speed", 1.0);
            state.put("currentIndex", 0);
            state.put("itemCount", 0);
        } catch (Exception ignored) {}
        return state;
    }
}
