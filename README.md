# تطبيق المحفوظات Android

تطبيق عربي RTL مبني بـ Ionic 9 وAngular 22 وCapacitor 8. يستخدم SQLite للنصوص والحفظ ومسارات الملفات، ومساحة التطبيق للتسجيلات. المكوّنات الأصلية في `android/app/src/main/java/org/mahfuzat/app/`:

- `AudioPlugin.java`: تسجيل AAC/M4A فعلي وصلاحيات الميكروفون والإشعارات.
- `PlaybackService.java`: Media3 / ExoPlayer وMediaSessionService، وقائمة تشغيل ديناميكية، وتكرار وفواصل صامتة، وAudio Focus وأزرار الوسائط.
- `WavExporter.java`: فك MediaCodec تدريجي، وتحويل PCM إلى 44.1kHz/mono/16-bit، وتجميع WAV دون دمج ثنائي خاطئ.
- `BackupPlugin.java`: ZIP تدريجي، وSHA-256 لكل ملف، واستعادة إلى مسارات جديدة دون استبدال التسجيلات.

## التطوير

يلزم Node 24.15+ (أو 22.22.3+) وJDK 21 وAndroid SDK 36.

```sh
npm ci
npm test
npm run build
npx cap sync android
```

للتطوير في المتصفح: `npm start`. تُستخدم `jeep-sqlite` و`sql.js` للتخزين في الويب، لكن التسجيل وMedia3 والتصدير والنسخ الاحتياطي الأصلي مخصصة لـ Android.

## بناء APK وتثبيته

على Windows، اجعل `ANDROID_HOME` يشير إلى SDK و`JAVA_HOME` إلى JDK 21، ثم:

```sh
npm run android:apk
```

أو نفّذ الخطوات يدويًا:

```sh
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

الملف الناتج:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

للتثبيت على هاتف موصل مع تصحيح USB:

```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

نسخة Debug للاختبار. للنشر أنشئ keystore خاصًا ووقّع Release، ولا تحفظ كلماته في المشروع.

## المزامنة والعمل دون إنترنت

اضبط رابط GitHub Pages من الإعدادات. يفحص التطبيق الفهرس عند البدء والعودة وكل 15 دقيقة في الواجهة. إذا تغير `catalog_version` ينزّل الملفات المتغيرة فقط، ويتحقق من المخطط والبصمة والمراجعة، ثم يطبقها في Transaction. الفشل لا يحذف البيانات القديمة.

تغيّر نص بيت يضع `text_changed` على تسجيله. حذف بيت يؤرشف تسجيله بدل حذفه. تُربط جميع البيانات الشخصية بـ `(poem_id, verse_id)` الثابتين، لا برقم البيت.

## الاختبارات

- `npm test`: مخططات المحتوى، البحث العربي، SQLite والمزامنة، التدرج والإدخال في المنتصف وفشل البصمة والاستعادة والتعارضات.
- `cd android && ./gradlew assembleDebugAndroidTest`: بناء اختبارات الجهاز.
- مع جهاز/محاكي: `./gradlew connectedDebugAndroidTest` لاختبار الميكروفون والتشغيل والخلفية والشاشة والتصدير وZIP.

راجع `TESTING.md` لمصفوفة السيناريوهات وما يحتاج حسابات خارجية.
