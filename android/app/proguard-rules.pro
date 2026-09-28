# ProGuard rules for Tontine Manager

# Keep Capacitor and plugins
-keep class com.getcapacitor.** { *; }
-keep class com.tontine.manager.** { *; }
-keep class com.codetrixstudio.capacitor.** { *; }
-keep class com.googlesamplesolutions.** { *; }

# Keep WebView JS interface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep plugin classes
-keep class com.capacitor.plugins.** { *; }
-keep class capacitor.plugins.** { *; }

# Don't warn about missing annotations
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Keep enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelable
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep R class references
-keepclassmembers class **.R$* {
    public static <fields>;
}
