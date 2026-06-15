package com.timeguardagent;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.telephony.TelephonyManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

/**
 * BroadcastReceiver that listens for phone call state changes.
 * Bridges events to React Native via CallModule.
 */
public class PhoneStateReceiver extends BroadcastReceiver {

    private static ReactApplicationContext reactContext;
    private static String lastState = TelephonyManager.EXTRA_STATE_IDLE;
    private static String savedNumber = "";

    public static void setReactContext(ReactApplicationContext ctx) {
        reactContext = ctx;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        if (action.equals(Intent.ACTION_NEW_OUTGOING_CALL)) {
            savedNumber = intent.getStringExtra(Intent.EXTRA_PHONE_NUMBER);
            return;
        }

        if (!action.equals("android.intent.action.PHONE_STATE")) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        String incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);

        if (incomingNumber != null && !incomingNumber.isEmpty()) {
            savedNumber = incomingNumber;
        }

        if (state == null || state.equals(lastState)) return;
        lastState = state;

        String mappedState;
        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            mappedState = "RINGING";
        } else if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            mappedState = "OFFHOOK";
        } else {
            mappedState = "IDLE";
        }

        // Resolve contact name
        String contactName = resolveContactName(context, savedNumber);

        sendEvent(mappedState, savedNumber, contactName);

        if (mappedState.equals("IDLE")) {
            savedNumber = "";
        }
    }

    private String resolveContactName(Context context, String number) {
        if (number == null || number.isEmpty()) return "";
        try {
            Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number)
            );
            Cursor cursor = context.getContentResolver().query(
                uri,
                new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                null, null, null
            );
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                cursor.close();
                return name != null ? name : "";
            }
            if (cursor != null) cursor.close();
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "";
    }

    private void sendEvent(String state, String number, String contactName) {
        if (reactContext == null) return;
        try {
            WritableMap params = Arguments.createMap();
            params.putString("state", state);
            params.putString("number", number);
            params.putString("contactName", contactName);
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("CallStateChanged", params);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
