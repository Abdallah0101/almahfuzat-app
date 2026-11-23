package org.mahfuzat.app;

import android.content.Context;
import java.io.File;
import java.io.IOException;

final class NativeFiles {
    private NativeFiles() {}

    static File inAppFiles(Context context, String relativePath) throws IOException {
        if (relativePath == null || relativePath.isBlank() || relativePath.startsWith("/")) {
            throw new IOException("Invalid relative path");
        }
        File base = context.getFilesDir().getCanonicalFile();
        File result = new File(base, relativePath).getCanonicalFile();
        if (!result.getPath().startsWith(base.getPath() + File.separator)) {
            throw new IOException("Path escapes application storage");
        }
        return result;
    }
}
