package org.mahfuzat.app;

import android.net.Uri;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "MahfuzatBackup")
public class BackupPlugin extends Plugin {
    private static final int MAX_JSON_BYTES = 100 * 1024 * 1024;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void createBackup(PluginCall call) {
        executor.execute(() -> {
            File temporary = null;
            try {
                JSONObject snapshot = call.getData().getJSONObject("snapshot");
                validateSnapshot(snapshot);
                String outputName = call.getData().optString("outputName", "mahfuzat-backup.zip");
                if (!outputName.endsWith(".zip") || outputName.contains("/") || outputName.contains("\\")) {
                    throw new IllegalArgumentException("Invalid backup file name");
                }
                File directory = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "backups");
                if (!directory.mkdirs() && !directory.isDirectory()) throw new IOException("Cannot create backup directory");
                File output = new File(directory, outputName);
                int suffix = 2;
                while (output.exists()) {
                    output = new File(directory, outputName.replace(".zip", "-" + suffix + ".zip"));
                    suffix++;
                }
                temporary = new File(directory, output.getName() + ".tmp");
                JSONArray fileMetadata = new JSONArray();
                Set<String> entries = new HashSet<>();
                try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(temporary), 65536))) {
                    writeJson(zip, "data.json", snapshot);
                    JSONArray recordings = snapshot.getJSONArray("recordings");
                    for (int index = 0; index < recordings.length(); index++) {
                        JSONObject recording = recordings.getJSONObject(index);
                        String relativePath = recording.getString("file_path");
                        File audio = NativeFiles.inAppFiles(getContext(), relativePath);
                        if (!audio.isFile()) throw new IOException("Missing recording: " + relativePath);
                        String entryName = "files/" + relativePath;
                        if (!entries.add(entryName)) throw new IOException("Duplicate backup entry: " + entryName);
                        zip.putNextEntry(new ZipEntry(entryName));
                        MessageDigest digest = MessageDigest.getInstance("SHA-256");
                        long size;
                        try (InputStream input = new BufferedInputStream(new FileInputStream(audio))) {
                            size = copy(input, zip, digest, Long.MAX_VALUE);
                        }
                        zip.closeEntry();
                        JSONObject metadata = new JSONObject();
                        metadata.put("file_path", relativePath);
                        metadata.put("entry", entryName);
                        metadata.put("size", size);
                        metadata.put("sha256", hex(digest.digest()));
                        fileMetadata.put(metadata);
                    }
                    JSONObject manifest = new JSONObject();
                    manifest.put("backup_schema_version", 1);
                    manifest.put("backup_id", snapshot.getString("device_id") + "-" + snapshot.getString("created_at"));
                    manifest.put("app_schema_version", snapshot.getInt("app_schema_version"));
                    manifest.put("created_at", snapshot.getString("created_at"));
                    manifest.put("files", fileMetadata);
                    writeJson(zip, "backup.json", manifest);
                }
                if (!temporary.renameTo(output)) throw new IOException("Cannot finalize backup");
                JSObject result = new JSObject();
                result.put("path", output.getAbsolutePath());
                result.put("url", FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", output).toString());
                result.put("sizeBytes", output.length());
                call.resolve(result);
            } catch (Exception error) {
                if (temporary != null) temporary.delete();
                call.reject("Backup failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void restoreBackup(PluginCall call) {
        executor.execute(() -> {
            File copied = null;
            File staging = null;
            try {
                String uriValue = call.getString("uri");
                Uri uri = uriValue.startsWith("/") ? Uri.fromFile(new File(uriValue)) : Uri.parse(uriValue);
                copied = new File(getContext().getCacheDir(), "restore-" + UUID.randomUUID() + ".zip");
                try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
                    if (input == null) throw new IOException("Cannot open selected backup");
                    try (OutputStream output = new FileOutputStream(copied)) {
                        copy(input, output, null, Long.MAX_VALUE);
                    }
                }
                staging = NativeFiles.inAppFiles(getContext(), "restored/" + UUID.randomUUID());
                if (!staging.mkdirs()) throw new IOException("Cannot create restore directory");
                JSONObject snapshot;
                JSONObject manifest;
                JSONArray restoredFiles = new JSONArray();
                try (ZipFile zip = new ZipFile(copied)) {
                    manifest = readJson(zip, "backup.json");
                    snapshot = readJson(zip, "data.json");
                    validateSnapshot(snapshot);
                    if (manifest.getInt("backup_schema_version") != 1) throw new IOException("Unsupported backup version");
                    JSONArray files = manifest.getJSONArray("files");
                    if (files.length() > 100000) throw new IOException("Too many backup files");
                    for (int index = 0; index < files.length(); index++) {
                        JSONObject metadata = files.getJSONObject(index);
                        String relativePath = metadata.getString("file_path");
                        NativeFiles.inAppFiles(getContext(), relativePath);
                        String entryName = metadata.getString("entry");
                        if (!entryName.equals("files/" + relativePath)) throw new IOException("Unsafe backup entry");
                        ZipEntry entry = zip.getEntry(entryName);
                        if (entry == null || entry.isDirectory()) throw new IOException("Missing backup entry: " + entryName);
                        File target = new File(staging, relativePath).getCanonicalFile();
                        if (!target.getPath().startsWith(staging.getCanonicalPath() + File.separator)) throw new IOException("Unsafe restore path");
                        File parent = target.getParentFile();
                        if (parent != null && !parent.mkdirs() && !parent.isDirectory()) throw new IOException("Cannot create restore folder");
                        MessageDigest digest = MessageDigest.getInstance("SHA-256");
                        long size;
                        try (InputStream input = new BufferedInputStream(zip.getInputStream(entry));
                             OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
                            size = copy(input, output, digest, 1024L * 1024 * 1024);
                        }
                        if (size != metadata.getLong("size") || !hex(digest.digest()).equals(metadata.getString("sha256"))) {
                            throw new IOException("Audio checksum mismatch: " + relativePath);
                        }
                        JSONObject restored = new JSONObject();
                        restored.put("originalPath", relativePath);
                        restored.put("restoredPath", getContext().getFilesDir().getCanonicalFile().toURI().relativize(target.toURI()).getPath());
                        restoredFiles.put(restored);
                    }
                }
                JSObject result = new JSObject();
                result.put("snapshot", snapshot);
                result.put("backupId", manifest.getString("backup_id"));
                result.put("files", restoredFiles);
                call.resolve(result);
            } catch (Exception error) {
                if (staging != null) deleteTree(staging);
                call.reject("Restore failed: " + error.getMessage(), error);
            } finally {
                if (copied != null) copied.delete();
            }
        });
    }

    private static void validateSnapshot(JSONObject snapshot) throws Exception {
        if (snapshot.getInt("backup_schema_version") != 1 || snapshot.getInt("app_schema_version") != 1) {
            throw new IOException("Unsupported backup data version");
        }
        for (String table : new String[]{"poems", "chapters", "verses", "recordings", "progress", "playlists", "review_events", "settings", "playback_positions"}) {
            if (!snapshot.has(table) || !(snapshot.get(table) instanceof JSONArray)) throw new IOException("Missing table: " + table);
        }
    }

    private static void writeJson(ZipOutputStream zip, String name, JSONObject value) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(value.toString().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static JSONObject readJson(ZipFile zip, String name) throws Exception {
        ZipEntry entry = zip.getEntry(name);
        if (entry == null || entry.getSize() > MAX_JSON_BYTES) throw new IOException("Missing or oversized " + name);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (InputStream input = zip.getInputStream(entry)) {
            copy(input, output, null, MAX_JSON_BYTES);
        }
        return new JSONObject(output.toString(StandardCharsets.UTF_8));
    }

    private static long copy(InputStream input, OutputStream output, MessageDigest digest, long limit) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) >= 0) {
            total += read;
            if (total > limit) throw new IOException("File exceeds safety limit");
            output.write(buffer, 0, read);
            if (digest != null) digest.update(buffer, 0, read);
        }
        return total;
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value));
        return result.toString();
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }
}
