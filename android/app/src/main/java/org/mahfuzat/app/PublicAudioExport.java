package org.mahfuzat.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

final class PublicAudioExport {
    static final String DISPLAY_DIRECTORY = Environment.DIRECTORY_DOWNLOADS + "/AlMahfuzat";

    static final class Publication {
        final Uri uri;
        final String path;
        final String displayPath;

        Publication(Uri uri, String path, String displayPath) {
            this.uri = uri;
            this.path = path;
            this.displayPath = displayPath;
        }
    }

    private PublicAudioExport() {}

    static Publication publish(Context context, File source, String outputName) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return publishMediaStore(context, source, outputName);
        return publishLegacy(context, source, outputName);
    }

    @android.annotation.TargetApi(Build.VERSION_CODES.Q)
    private static Publication publishMediaStore(Context context, File source, String outputName) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        String relativePath = DISPLAY_DIRECTORY + "/";
        String displayName = availableMediaStoreName(resolver, relativePath, outputName);
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, displayName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "audio/wav");
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Could not create public WAV entry");
        boolean completed = false;
        try {
            OutputStream destination = resolver.openOutputStream(uri, "w");
            if (destination == null) throw new IOException("Could not open public WAV destination");
            try (InputStream input = new FileInputStream(source); OutputStream output = destination) {
                copy(input, output);
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, ready, null, null);
            completed = true;
            return new Publication(uri, uri.toString(), DISPLAY_DIRECTORY + "/" + displayName);
        } finally {
            if (!completed) resolver.delete(uri, null, null);
        }
    }

    @android.annotation.TargetApi(Build.VERSION_CODES.Q)
    private static String availableMediaStoreName(ContentResolver resolver, String relativePath, String outputName) {
        String candidate = outputName;
        int suffix = 2;
        while (mediaStoreEntryExists(resolver, relativePath, candidate)) {
            candidate = numberedName(outputName, suffix++);
        }
        return candidate;
    }

    @android.annotation.TargetApi(Build.VERSION_CODES.Q)
    private static boolean mediaStoreEntryExists(ContentResolver resolver, String relativePath, String displayName) {
        String[] projection = {MediaStore.MediaColumns._ID};
        String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
        String[] arguments = {relativePath, displayName};
        try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection, selection, arguments, null)) {
            return cursor != null && cursor.moveToFirst();
        }
    }

    @SuppressWarnings("deprecation")
    private static Publication publishLegacy(Context context, File source, String outputName) throws Exception {
        File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "AlMahfuzat");
        if (!directory.mkdirs() && !directory.isDirectory()) throw new IOException("Could not create public WAV directory");
        File outputFile = new File(directory, outputName);
        int suffix = 2;
        while (outputFile.exists()) outputFile = new File(directory, numberedName(outputName, suffix++));
        boolean completed = false;
        try {
            try (InputStream input = new FileInputStream(source); OutputStream output = new FileOutputStream(outputFile)) {
                copy(input, output);
            }
            completed = true;
        } finally {
            if (!completed) outputFile.delete();
        }
        MediaScannerConnection.scanFile(context, new String[]{outputFile.getAbsolutePath()}, new String[]{"audio/wav"}, null);
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", outputFile);
        return new Publication(uri, outputFile.getAbsolutePath(), DISPLAY_DIRECTORY + "/" + outputFile.getName());
    }

    private static String numberedName(String outputName, int suffix) {
        return outputName.substring(0, outputName.length() - 4) + "-" + suffix + ".wav";
    }

    private static void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) >= 0) output.write(buffer, 0, read);
    }
}
