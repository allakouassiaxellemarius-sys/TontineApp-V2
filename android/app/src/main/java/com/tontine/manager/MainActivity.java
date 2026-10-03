package com.tontine.manager;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Empêche la WebView de suivre la taille de police / le zoom système
        // (qui peut agrandir toute l'interface sur un grand écran) :
        // le rendu reste toujours à l'échelle 1:1 du CSS.
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setTextZoom(100);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
        // Capacitor n'ouvre l'inspection Chrome que si android:debuggable est vrai,
        // donc une release signée reste muette. WEB_DEBUG vient de
        // `assembleRelease -PwebDebug=true` et n'est jamais vrai par défaut.
        if (BuildConfig.WEB_DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
    }
}
