package com.timeguardagent;

import android.database.Cursor;
import android.provider.CallLog;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactMethod;
import androidx.annotation.NonNull;

public class CallModule extends ReactContextBaseJavaModule {

    public CallModule(ReactApplicationContext reactContext) {
        super(reactContext);
        PhoneStateReceiver.setReactContext(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "CallModule";
    }

    @ReactMethod
    public void getLastCallDetails(Promise promise) {
        try {
            Cursor cursor = getReactApplicationContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                null, null, null,
                CallLog.Calls.DATE + " DESC"
            );

            if (cursor != null && cursor.moveToFirst()) {
                int numberIdx = cursor.getColumnIndex(CallLog.Calls.NUMBER);
                int nameIdx = cursor.getColumnIndex(CallLog.Calls.CACHED_NAME);
                int typeIdx = cursor.getColumnIndex(CallLog.Calls.TYPE);

                String number = cursor.getString(numberIdx);
                String name = cursor.getString(nameIdx);
                int type = cursor.getInt(typeIdx);

                WritableMap map = Arguments.createMap();
                map.putString("number", number);
                map.putString("name", name != null ? name : "");
                map.putInt("type", type);

                cursor.close();
                promise.resolve(map);
            } else {
                if (cursor != null) cursor.close();
                promise.reject("NO_CALLS", "No call logs found");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}
}
