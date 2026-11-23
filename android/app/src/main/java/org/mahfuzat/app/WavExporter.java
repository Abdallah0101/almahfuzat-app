package org.mahfuzat.app;

import android.content.Context;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.json.JSONArray;
import org.json.JSONObject;

final class WavExporter {
    interface ProgressListener {
        void progress(int percent, int processedItems, int totalItems);
    }

    static final class Result {
        final long durationMs;
        Result(long durationMs) { this.durationMs = durationMs; }
    }

    private static final int SAMPLE_RATE = 44100;
    private final Context context;

    WavExporter(Context context) { this.context = context; }

    Result export(JSONObject request, File destination, ProgressListener listener) throws Exception {
        JSONArray items = request.getJSONArray("items");
        int verseRepeats = Math.max(1, request.optInt("verseRepeats", 1));
        int groupRepeats = Math.max(1, request.optInt("groupRepeats", 1));
        int gapSeconds = request.optInt("gapSeconds", 0);
        if (items.length() == 0) throw new IllegalArgumentException("No recordings selected");
        if (verseRepeats > 100 || groupRepeats > 100) throw new IllegalArgumentException("Repeat count exceeds 100");
        if (gapSeconds < 0 || gapSeconds > 60) throw new IllegalArgumentException("Invalid silence duration");
        int totalItems = items.length() * groupRepeats;
        int processed = 0;
        listener.progress(0, 0, totalItems);
        WavWriter writer = new WavWriter(destination);
        try {
            for (int group = 0; group < groupRepeats; group++) {
                for (int index = 0; index < items.length(); index++) {
                    JSONObject item = items.getJSONObject(index);
                    File file = NativeFiles.inAppFiles(context, item.getString("relativePath"));
                    if (!file.isFile()) throw new IOException("Missing recording: " + item.optInt("verseNumber"));
                    for (int repeat = 0; repeat < verseRepeats; repeat++) {
                        decodeInto(file, writer);
                        if (gapSeconds > 0) writer.writeSilence(gapSeconds);
                    }
                    processed++;
                    listener.progress(processed * 100 / totalItems, processed, totalItems);
                }
            }
            writer.close();
            return new Result(writer.dataBytes * 1000L / (SAMPLE_RATE * 2));
        } catch (Exception error) {
            writer.abort();
            throw error;
        }
    }

    private void decodeInto(File file, WavWriter writer) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        MediaCodec codec = null;
        PcmConverter converter = null;
        try {
            extractor.setDataSource(file.getAbsolutePath());
            int track = -1;
            MediaFormat inputFormat = null;
            for (int index = 0; index < extractor.getTrackCount(); index++) {
                MediaFormat format = extractor.getTrackFormat(index);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    track = index;
                    inputFormat = format;
                    break;
                }
            }
            if (track < 0 || inputFormat == null) throw new IOException("No audio track in " + file.getName());
            extractor.selectTrack(track);
            String mime = inputFormat.getString(MediaFormat.KEY_MIME);
            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(inputFormat, null, null, 0);
            codec.start();
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            boolean inputEnded = false;
            boolean outputEnded = false;
            boolean producedAudio = false;
            while (!outputEnded) {
                if (!inputEnded) {
                    int inputIndex = codec.dequeueInputBuffer(10_000);
                    if (inputIndex >= 0) {
                        ByteBuffer input = codec.getInputBuffer(inputIndex);
                        if (input == null) throw new IOException("Decoder input buffer unavailable");
                        int size = extractor.readSampleData(input, 0);
                        if (size < 0) {
                            codec.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                            inputEnded = true;
                        } else {
                            codec.queueInputBuffer(inputIndex, 0, size, extractor.getSampleTime(), 0);
                            extractor.advance();
                        }
                    }
                }
                int outputIndex = codec.dequeueOutputBuffer(info, 10_000);
                if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat changed = codec.getOutputFormat();
                    int newRate = sampleRate(changed);
                    int newChannels = channels(changed);
                    int newPcm = pcmEncoding(changed);
                    if (producedAudio && (newRate != converter.sourceRate || newChannels != converter.channels || newPcm != converter.pcmEncoding)) {
                        throw new IOException("Audio format changed during decoding");
                    }
                    converter = new PcmConverter(newRate, newChannels, newPcm);
                } else if (outputIndex >= 0) {
                    ByteBuffer output = codec.getOutputBuffer(outputIndex);
                    if (output != null && info.size > 0) {
                        if (converter == null) {
                            MediaFormat current = codec.getOutputFormat();
                            converter = new PcmConverter(sampleRate(current), channels(current), pcmEncoding(current));
                        }
                        output.position(info.offset);
                        output.limit(info.offset + info.size);
                        byte[] bytes = new byte[info.size];
                        output.get(bytes);
                        converter.convert(bytes, writer);
                        producedAudio = true;
                    }
                    codec.releaseOutputBuffer(outputIndex, false);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outputEnded = true;
                }
            }
            if (converter == null) throw new IOException("No decoded PCM audio");
            converter.finish(writer);
        } finally {
            if (codec != null) {
                try { codec.stop(); } catch (Exception ignored) {}
                codec.release();
            }
            extractor.release();
        }
    }

    private static int sampleRate(MediaFormat format) {
        int value = format.containsKey(MediaFormat.KEY_SAMPLE_RATE) ? format.getInteger(MediaFormat.KEY_SAMPLE_RATE) : SAMPLE_RATE;
        if (value < 8000 || value > 192000) throw new IllegalArgumentException("Unsupported sample rate: " + value);
        return value;
    }

    private static int channels(MediaFormat format) {
        int value = format.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 1;
        if (value < 1 || value > 8) throw new IllegalArgumentException("Unsupported channel count: " + value);
        return value;
    }

    private static int pcmEncoding(MediaFormat format) {
        return format.containsKey(MediaFormat.KEY_PCM_ENCODING) ? format.getInteger(MediaFormat.KEY_PCM_ENCODING) : AudioFormat.ENCODING_PCM_16BIT;
    }

    private static final class PcmConverter {
        final int sourceRate;
        final int channels;
        final int pcmEncoding;
        private final int bytesPerSample;
        private final int frameSize;
        private final double step;
        private byte[] pending = new byte[0];
        private final ByteBuffer output = ByteBuffer.allocate(16 * 1024).order(ByteOrder.LITTLE_ENDIAN);
        private long inputIndex = -1;
        private double previousSample;
        private double currentSample;
        private double nextOutputPosition;

        PcmConverter(int sourceRate, int channels, int pcmEncoding) {
            this.sourceRate = sourceRate;
            this.channels = channels;
            this.pcmEncoding = pcmEncoding;
            if (pcmEncoding == AudioFormat.ENCODING_PCM_16BIT) bytesPerSample = 2;
            else if (pcmEncoding == AudioFormat.ENCODING_PCM_FLOAT) bytesPerSample = 4;
            else throw new IllegalArgumentException("Unsupported decoder PCM encoding: " + pcmEncoding);
            frameSize = bytesPerSample * channels;
            step = (double) sourceRate / SAMPLE_RATE;
        }

        void convert(byte[] bytes, WavWriter writer) throws IOException {
            byte[] combined = new byte[pending.length + bytes.length];
            System.arraycopy(pending, 0, combined, 0, pending.length);
            System.arraycopy(bytes, 0, combined, pending.length, bytes.length);
            int complete = combined.length - combined.length % frameSize;
            for (int offset = 0; offset < complete; offset += frameSize) {
                double mixed = 0;
                for (int channel = 0; channel < channels; channel++) {
                    int position = offset + channel * bytesPerSample;
                    mixed += pcm16(combined, position);
                }
                addSample(mixed / channels, writer);
            }
            pending = new byte[combined.length - complete];
            System.arraycopy(combined, complete, pending, 0, pending.length);
        }

        private int pcm16(byte[] bytes, int offset) {
            if (pcmEncoding == AudioFormat.ENCODING_PCM_16BIT) {
                return (short) ((bytes[offset] & 0xff) | (bytes[offset + 1] << 8));
            }
            int bits = (bytes[offset] & 0xff) | ((bytes[offset + 1] & 0xff) << 8)
                | ((bytes[offset + 2] & 0xff) << 16) | (bytes[offset + 3] << 24);
            float value = Float.intBitsToFloat(bits);
            if (!Float.isFinite(value)) value = 0;
            return Math.round(Math.max(-1f, Math.min(1f, value)) * 32767);
        }

        private void addSample(double sample, WavWriter writer) throws IOException {
            previousSample = currentSample;
            currentSample = sample;
            inputIndex++;
            if (inputIndex == 0) {
                writeSample(sample, writer);
                nextOutputPosition = step;
                return;
            }
            while (nextOutputPosition <= inputIndex + 1e-9) {
                double fraction = nextOutputPosition - (inputIndex - 1);
                double interpolated = previousSample + (currentSample - previousSample) * fraction;
                writeSample(interpolated, writer);
                nextOutputPosition += step;
            }
        }

        private void writeSample(double sample, WavWriter writer) throws IOException {
            if (!output.hasRemaining()) {
                writer.writePcm(output.array(), output.position());
                output.clear();
            }
            output.putShort((short) Math.round(sample));
        }

        void finish(WavWriter writer) throws IOException {
            if (pending.length != 0) throw new IOException("Incomplete PCM frame");
            if (output.position() > 0) writer.writePcm(output.array(), output.position());
            output.clear();
        }
    }

    private static final class WavWriter {
        private final File file;
        private BufferedOutputStream output;
        long dataBytes;

        WavWriter(File file) throws IOException {
            this.file = file;
            output = new BufferedOutputStream(new FileOutputStream(file), 64 * 1024);
            output.write(new byte[44]);
        }

        void writePcm(byte[] bytes, int length) throws IOException {
            if (length <= 0) return;
            if (dataBytes + length > 0xffffffd8L) throw new IOException("WAV export exceeds 4 GiB RIFF limit");
            output.write(bytes, 0, length);
            dataBytes += length;
        }

        void writeSilence(int seconds) throws IOException {
            byte[] silence = new byte[8192];
            long remaining = (long) SAMPLE_RATE * seconds * 2;
            while (remaining > 0) {
                int chunk = (int) Math.min(silence.length, remaining);
                writePcm(silence, chunk);
                remaining -= chunk;
            }
        }

        void close() throws IOException {
            output.flush();
            output.close();
            output = null;
            try (RandomAccessFile wav = new RandomAccessFile(file, "rw")) {
                wav.seek(0);
                byte[] header = new byte[44];
                ByteBuffer buffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
                buffer.put(new byte[]{'R', 'I', 'F', 'F'});
                buffer.putInt((int) (36 + dataBytes));
                buffer.put(new byte[]{'W', 'A', 'V', 'E', 'f', 'm', 't', ' '});
                buffer.putInt(16).putShort((short) 1).putShort((short) 1);
                buffer.putInt(SAMPLE_RATE).putInt(SAMPLE_RATE * 2).putShort((short) 2).putShort((short) 16);
                buffer.put(new byte[]{'d', 'a', 't', 'a'}).putInt((int) dataBytes);
                wav.write(header);
            }
        }

        void abort() {
            if (output != null) {
                try { output.close(); } catch (Exception ignored) {}
                output = null;
            }
            file.delete();
        }
    }
}
