package com.venubrushwood.citythief;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;
import java.util.Locale;
import java.util.Set;

/**
 * City Thief for Android.
 * The whole game (HTML + JavaScript + 3D models) is inside the app, so it works without internet.
 * The game is loaded from https://appassets.androidplatform.net/ and every file comes from the app.
 * Voices: the phone's own text-to-speech in Indian English (window.AndroidTTS for the game).
 * The back button pauses the game; on the main menu it closes the app.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private Voice maleVoice, femaleVoice;
    private String voiceNames = "[]";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(0xff07080a);
        setContentView(web);
        hideBars();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " CityThiefApp/8 Android");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                try {
                    InputStream in = getAssets().open("game" + path);
                    String mime = mime(path);
                    return new WebResourceResponse(mime, mime.startsWith("text/") ? "utf-8" : null, in);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri u = Uri.parse(url);
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no browser */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new TtsBridge(), "AndroidTTS");

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status != TextToSpeech.SUCCESS) return;
                int r = tts.setLanguage(new Locale("en", "IN"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.UK);
                pickVoices();
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) { }
                    @Override public void onDone(String id) { done(id); }
                    @Override public void onError(String id) { done(id); }
                });
                ttsReady = true;
            }
        });

        web.loadUrl("https://" + HOST + "/index.html");
    }

    // Indian English voices of the phone: one for men (Vikram), one for women.
    private void pickVoices() {
        try {
            Set<Voice> all = tts.getVoices();
            if (all == null) return;
            StringBuilder names = new StringBuilder("[");
            Voice any = null;
            for (Voice v : all) {
                Locale l = v.getLocale();
                if (l == null || !"en".equals(l.getLanguage()) || !"IN".equalsIgnoreCase(l.getCountry())) continue;
                if (v.getFeatures() != null && v.getFeatures().contains("notInstalled")) continue;
                String n = v.getName().toLowerCase(Locale.ROOT);
                if (names.length() > 1) names.append(',');
                names.append('"').append(n.replace("\"", "")).append('"');
                if (any == null || (!v.isNetworkConnectionRequired() && any.isNetworkConnectionRequired())) any = v;
                if (maleVoice == null && (n.contains("male") && !n.contains("female") || n.contains("-end") || n.contains("-cxx"))) maleVoice = v;
                if (femaleVoice == null && (n.contains("female") || n.contains("-ena") || n.contains("-ahp") || n.contains("-ene"))) femaleVoice = v;
            }
            names.append(']');
            voiceNames = names.toString();
            if (maleVoice == null) maleVoice = any;
            if (femaleVoice == null) femaleVoice = any;
        } catch (Exception e) { /* old engine: default voice */ }
    }

    private void done(final String id) {
        if (id == null || !id.startsWith("u")) return;
        final String n = id.substring(1);
        runOnUiThread(new Runnable() {
            @Override public void run() { web.evaluateJavascript("window.__ttsDone && window.__ttsDone(" + n + ")", null); }
        });
    }

    /** The game calls this to speak: window.AndroidTTS.speak(text, pitch, rate, id, female). */
    public class TtsBridge {
        @JavascriptInterface
        public void speak(String text, float pitch, float rate, int id, int female) {
            if (!ttsReady || tts == null) { done("u" + id); return; }
            try {
                Voice v = female == 1 ? femaleVoice : maleVoice;
                if (v != null) tts.setVoice(v);
                tts.setPitch(Math.max(0.5f, Math.min(2f, pitch)));
                tts.setSpeechRate(Math.max(0.5f, Math.min(2f, rate)));
                tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "u" + id);
            } catch (Exception e) { done("u" + id); }
        }
        @JavascriptInterface
        public void stop() { if (tts != null) tts.stop(); }
        @JavascriptInterface
        public String voices() { return voiceNames; }
    }

    private static String mime(String p) {
        String f = p.toLowerCase(Locale.ROOT);
        if (f.endsWith(".html")) return "text/html";
        if (f.endsWith(".js") || f.endsWith(".mjs")) return "text/javascript";
        if (f.endsWith(".css")) return "text/css";
        if (f.endsWith(".json")) return "application/json";
        if (f.endsWith(".webmanifest")) return "application/manifest+json";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
        if (f.endsWith(".webp")) return "image/webp";
        if (f.endsWith(".svg")) return "image/svg+xml";
        if (f.endsWith(".glb")) return "model/gltf-binary";
        if (f.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    // Full screen: hide the status bar and the navigation buttons (swipe from the edge to see them).
    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    // Back button: pause the game (on the menu: close the app).
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){var g=window.__cityThief;if(g&&g.mode==='play'){g.pause();return 'paused';}if(g&&g.mode==='paused'){document.getElementById('btn-resume').click();return 'resumed';}return 'menu';})()",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String v) { if (v != null && v.contains("menu")) finish(); }
            });
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("(function(){var g=window.__cityThief;if(g&&g.mode==='play')g.pause();})()", null);
        if (tts != null) tts.stop();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideBars();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) { tts.stop(); tts.shutdown(); }
        web.destroy();
        super.onDestroy();
    }
}
