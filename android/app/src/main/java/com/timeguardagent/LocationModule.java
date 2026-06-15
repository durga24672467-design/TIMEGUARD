package com.timeguardagent;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import androidx.core.app.ActivityCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.util.List;
import java.util.Locale;

import androidx.annotation.NonNull;

public class LocationModule extends ReactContextBaseJavaModule {

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private final ReactApplicationContext reactContext;

    public LocationModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.fusedLocationClient = LocationServices.getFusedLocationProviderClient(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "LocationModule";
    }

    @ReactMethod
    public void getCurrentLocation(Promise promise) {
        if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "ACCESS_FINE_LOCATION permission not granted");
            return;
        }

        if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            promise.reject("PERMISSION_DENIED", "ACCESS_COARSE_LOCATION permission not granted");
            return;
        }

        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener(location -> {
                if (location != null) {
                    WritableMap map = Arguments.createMap();
                    map.putDouble("latitude", location.getLatitude());
                    map.putDouble("longitude", location.getLongitude());
                    map.putDouble("accuracy", location.getAccuracy());
                    map.putDouble("speed", location.getSpeed());

                    // Try to get address
                    try {
                        Geocoder geocoder = new Geocoder(reactContext, Locale.getDefault());
                        List<Address> addresses = geocoder.getFromLocation(
                                location.getLatitude(), location.getLongitude(), 1);
                        if (addresses != null && !addresses.isEmpty()) {
                            Address addr = addresses.get(0);
                            map.putString("address", addr.getAddressLine(0));
                        } else {
                            map.putString("address", "");
                        }
                    } catch (Exception e) {
                        map.putString("address", "");
                        System.err.println("[LocationModule] Geocoder error: " + e.getMessage());
                    }

                    promise.resolve(map);
                } else {
                    promise.reject("NO_LOCATION", "Could not get current location - GPS signal not available or device location is off");
                }
            })
            .addOnFailureListener(e -> {
                System.err.println("[LocationModule] Location error: " + e.getMessage());
                promise.reject("LOCATION_ERROR", "Failed to get location: " + e.getMessage());
            });
    }

    @ReactMethod
    public void startWatching(int intervalMs) {
        if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            System.err.println("[LocationModule] startWatching: ACCESS_FINE_LOCATION permission not granted");
            return;
        }

        if (ActivityCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            System.err.println("[LocationModule] startWatching: ACCESS_COARSE_LOCATION permission not granted");
            return;
        }

        // Stop any existing watch
        stopWatching();

        LocationRequest locationRequest = new LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
                .setMinUpdateIntervalMillis(intervalMs / 2)
                .setMinUpdateDistanceMeters(0)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult locationResult) {
                if (locationResult.getLastLocation() != null) {
                    android.location.Location loc = locationResult.getLastLocation();

                    WritableMap map = Arguments.createMap();
                    map.putDouble("latitude", loc.getLatitude());
                    map.putDouble("longitude", loc.getLongitude());
                    map.putDouble("accuracy", loc.getAccuracy());
                    map.putDouble("speed", loc.getSpeed());

                    // Try to get address
                    try {
                        Geocoder geocoder = new Geocoder(reactContext, Locale.getDefault());
                        List<Address> addresses = geocoder.getFromLocation(
                                loc.getLatitude(), loc.getLongitude(), 1);
                        if (addresses != null && !addresses.isEmpty()) {
                            Address addr = addresses.get(0);
                            map.putString("address", addr.getAddressLine(0));
                        } else {
                            map.putString("address", "");
                        }
                    } catch (Exception e) {
                        map.putString("address", "");
                        System.err.println("[LocationModule] Geocoder error: " + e.getMessage());
                    }

                    System.out.println("[LocationModule] Location update: " + loc.getLatitude() + ", " + loc.getLongitude() + " (accuracy: " + loc.getAccuracy() + ")");
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("LocationUpdate", map);
                } else {
                    System.err.println("[LocationModule] Location result is null");
                }
            }
        };

        fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, null);
        System.out.println("[LocationModule] Started watching location updates every " + intervalMs + "ms");
    }

    @ReactMethod
    public void stopWatching() {
        if (locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
        }
    }

    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}
}
