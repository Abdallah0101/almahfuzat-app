package org.mahfuzat.app;

import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.capacitorjs.plugins.clipboard.Clipboard;
import com.capacitorjs.plugins.clipboard.ClipboardWriteResponse;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ClipboardInstrumentedTest {
    @Test
    public void writesCompleteArabicVerseToNativeClipboard() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String text = "الشطر الأول\nالشطر الثاني";
        Clipboard clipboard = new Clipboard(context);
        ClipboardWriteResponse response = clipboard.write("AlMahfuzat verse", text);
        assertTrue(response.getErrorMessage(), response.isSuccess());
    }
}
