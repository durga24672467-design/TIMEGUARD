import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Alert, ScrollView, Platform, PermissionsAndroid, NativeModules, NativeEventEmitter,
} from 'react-native';
import { 
  insertCallLog, 
  logFieldLocation, 
  getFieldSites, 
  getEmployeeSettings, 
  updateEmployeeSettings,
  startAutoVisit,
  endAutoVisit,
  getTodayCallLogs
} from '../lib/supabase';
import { SyncQueue } from '../lib/SyncQueue';
import { backgroundTracking } from '../lib/BackgroundTracking';
import { getDistance } from '../lib/utils';

// Native modules - bridges to Java
const { LocationModule, CallModule } = NativeModules;
let callListener: any = null;
let locationEmitter: any = null;
try {
  if (CallModule) {
    callListener = new NativeEventEmitter(CallModule);
  }
  if (LocationModule) {
    locationEmitter = new NativeEventEmitter(LocationModule);
  }
} catch (_) {}

interface Props {
  session: { employee_id: string; name: string; token: string };
  onLogout: () => void;
}

interface CallRecord {
  id: string;
  type: string;
  contact: string;
  number: string;
  duration: number;
  time: Date;
  synced: boolean;
}

export default function HomeScreen({ session, onLogout }: Props) {
  const [status, setStatus] = useState<'idle' | 'ringing' | 'on_call'>('idle');
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [isTracking] = useState(true);
  const [isCallTracking] = useState(true);
  const [isAtHome, setIsAtHome] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('Locating...');
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [homeLoc, setHomeLoc] = useState<{lat: number, lng: number} | null>(null);
  const [shiftTimes, setShiftTimes] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [isWithinShift, setIsWithinShift] = useState(true);

  const [permissionsGranted, setPermissionsGranted] = useState(false);

  const callStartRef = useRef<Date | null>(null);
  const callTypeRef = useRef<'incoming' | 'outgoing' | 'missed'>('incoming');
  const callNumberRef = useRef<string>('');
  const callContactRef = useRef<string>('');

  async function loadCallLogs() {
    try {
      const logs = await getTodayCallLogs(session.employee_id, session.token);
      if (logs && logs.length > 0) {
        setCallRecords(logs.map((l: any) => ({
          id: l.id,
          type: l.call_type,
          contact: l.contact_name,
          number: l.phone_number,
          duration: l.duration_seconds,
          time: new Date(l.call_start),
          synced: true
        })));
      }
    } catch (e) {
      console.warn('Failed to load call logs', e);
    }
  }

  useEffect(() => {
    requestPermissions();
    loadSettings();
    loadSites();
    loadCallLogs();
  }, []);

  async function loadSettings() {
    try {
      const settings = await getEmployeeSettings(session.employee_id, session.token);
      if (settings) {
        if (settings.home_lat && settings.home_lng) {
          setHomeLoc({ lat: Number(settings.home_lat), lng: Number(settings.home_lng) });
        }
        if (settings.shift_start || settings.shift_end) {
          setShiftTimes({ start: settings.shift_start, end: settings.shift_end });
        }
      }
    } catch (e) {
      console.warn('Failed to load settings', e);
    }
  }

  async function loadSites() {
    try {
      const data = await getFieldSites(session.token);
      setSites(data || []);
    } catch (e) {
      console.warn('Failed to load sites', e);
    }
  }

  useEffect(() => {
    const checkShift = () => {
      if (!shiftTimes.start || !shiftTimes.end) {
        setIsWithinShift(true);
        return;
      }
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      const parseTime = (timeStr: string) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
      };
      
      const startMins = parseTime(shiftTimes.start);
      const endMins = parseTime(shiftTimes.end);
      
      if (startMins <= endMins) {
        setIsWithinShift(currentMinutes >= startMins && currentMinutes <= endMins);
      } else {
        // Cross-midnight shift
        setIsWithinShift(currentMinutes >= startMins || currentMinutes <= endMins);
      }
    };
    
    checkShift();
    const interval = setInterval(checkShift, 60000);
    return () => clearInterval(interval);
  }, [shiftTimes]);

  useEffect(() => {
    if (isWithinShift && isTracking) {
      backgroundTracking.start();
    } else {
      backgroundTracking.stop();
    }
  }, [isWithinShift, isTracking]);

  // Location Tracking Effect - Uses native Java LocationModule (FusedLocationProviderClient)
  useEffect(() => {
    if (!isTracking || !isWithinShift || !permissionsGranted || !LocationModule) {
      console.log('[TimeGuard] Location tracking skipped:', { isTracking, isWithinShift, permissionsGranted, hasModule: !!LocationModule });
      return;
    }

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    // Handle location updates from native module
    const handleLocationUpdate = async (event: any) => {
      if (!isMounted) return;
      
      const { latitude, longitude, speed, accuracy, address } = event;
      console.log('[TimeGuard] Location update:', { latitude, longitude, accuracy });
      setCurrentLocation({ lat: latitude, lng: longitude });

      // Set address from native Geocoder
      if (address && address.length > 0) {
        setCurrentAddress(address);
      } else {
        setCurrentAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      }

      // Check if at home
      if (homeLoc) {
        const distToHome = getDistance(latitude, longitude, homeLoc.lat, homeLoc.lng);
        const currentlyAtHome = distToHome < 50;
        if (currentlyAtHome !== isAtHome) {
          setIsAtHome(currentlyAtHome);
        }
      }

      // Log location to database (via SyncQueue for offline support)
      try {
        await SyncQueue.add('location', {
          employee_id: session.employee_id,
          lat: latitude,
          lng: longitude,
          accuracy,
          speed: speed || 0,
          timestamp: new Date().toISOString()
        }, session.token);
        console.log('[TimeGuard] Location queued');
      } catch (e) {
        console.warn('[TimeGuard] Location queue failed', e);
      }

      // Geofencing / Auto Visits
      let inSite: any = null;
      for (const site of sites) {
        const dist = getDistance(latitude, longitude, site.lat, site.lng);
        if (dist <= (site.radius_meters || 100)) {
          inSite = site;
          break;
        }
      }

      if (inSite && !activeVisitId) {
        console.log('[Geofence] Entering site:', inSite.name);
        const visit = await startAutoVisit({
          employee_id: session.employee_id,
          attendance_id: null,
          client_name: inSite.name,
          start_lat: latitude,
          start_lng: longitude,
          status: 'ongoing'
        }, session.token);
        if (visit && visit.length) setActiveVisitId(visit[0].id);
      } else if (!inSite && activeVisitId) {
        console.log('[Geofence] Leaving site');
        await endAutoVisit(activeVisitId, {
          end_time: new Date().toISOString(),
          end_lat: latitude,
          end_lng: longitude,
          status: 'completed'
        }, session.token);
        setActiveVisitId(null);
      }
    };

    // Subscribe to native location updates
    let sub: any = null;
    if (locationEmitter) {
      sub = locationEmitter.addListener('LocationUpdate', handleLocationUpdate);
    }

    // Start watching from native module (every 10 seconds)
    console.log('[TimeGuard] Starting location watch...');
    LocationModule.startWatching(10000);

    // Get initial location with timeout
    const getInitialLocation = async () => {
      try {
        console.log('[TimeGuard] Requesting initial location...');
        setCurrentAddress('🔄 Getting GPS location...');
        
        // Create a promise that rejects after 15 seconds
        const locationPromise = LocationModule.getCurrentLocation();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Location request timeout - GPS not responding')), 15000)
        );

        const loc = await Promise.race([locationPromise, timeoutPromise]);
        
        if (!isMounted) return;
        
        console.log('[TimeGuard] Got initial location:', loc);
        setCurrentLocation({ lat: loc.latitude, lng: loc.longitude });
        if (loc.address && loc.address.length > 0) {
          setCurrentAddress(loc.address);
        } else {
          setCurrentAddress(`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
        }
        
        // Log initial location via SyncQueue
        SyncQueue.add('location', {
          employee_id: session.employee_id,
          lat: loc.latitude,
          lng: loc.longitude,
          accuracy: loc.accuracy,
          speed: loc.speed || 0,
          timestamp: new Date().toISOString()
        }, session.token).catch(console.warn);
      } catch (err: any) {
        if (!isMounted) return;
        
        console.error('[TimeGuard] Initial location error:', err);
        const errorMsg = err.message || err.toString();
        setCurrentAddress(`❌ ${errorMsg}`);
        
        // Only show alert once
        if (!timeoutId) {
          Alert.alert(
            'Location Access Problem',
            `${errorMsg}\n\nPlease:\n1. Enable GPS on your device\n2. Grant location permission\n3. Tap Refresh to retry`,
            [{ text: 'OK' }]
          );
        }
      }
    };

    // Request initial location
    getInitialLocation();

    return () => {
      isMounted = false;
      if (sub) sub.remove();
      if (timeoutId) clearTimeout(timeoutId);
      LocationModule.stopWatching();
    };
  }, [isTracking, sites, homeLoc, activeVisitId, isAtHome, isWithinShift, permissionsGranted]);

  useEffect(() => {
    if (!callListener || !isCallTracking || isAtHome || !isWithinShift) return;

    // Listen to call state changes from native Android module
    const sub = callListener.addListener('CallStateChanged', async (event: any) => {
      const { state, number, contactName } = event;

      if (state === 'RINGING') {
        callNumberRef.current = number || '';
        callContactRef.current = contactName || '';
        callTypeRef.current = 'incoming';
        setStatus('ringing');
      } else if (state === 'OFFHOOK') {
        callStartRef.current = new Date();
        if (status === 'idle') callTypeRef.current = 'outgoing'; // outgoing call
        setStatus('on_call');
      } else if (state === 'IDLE') {
        if (callStartRef.current) {
          const callEnd = new Date();
          const durationSecs = Math.round(
            (callEnd.getTime() - callStartRef.current.getTime()) / 1000
          );
          
          setStatus('idle');
          callStartRef.current = null;

          // Fetch exact details from system call log after a short delay
          // to allow the system to write the entry.
          setTimeout(async () => {
            try {
              const { NativeModules } = require('react-native');
              const log = await NativeModules.CallModule.getLastCallDetails();
              
              const record: CallRecord = {
                id: Date.now().toString(),
                type: durationSecs < 2 ? 'missed' : (log.type === 2 ? 'outgoing' : 'incoming'),
                contact: log.name,
                number: log.number,
                duration: durationSecs,
                time: new Date(),
                synced: false,
              };

              setCallRecords(prev => [record, ...prev.slice(0, 49)]);

              await SyncQueue.add('call', {
                employee_id: session.employee_id,
                call_start: record.time.toISOString(),
                call_end: callEnd.toISOString(),
                duration_seconds: durationSecs,
                call_type: record.type as any,
                contact_name: record.contact || null,
                phone_number: record.number || null,
              }, session.token);

              setCallRecords(prev =>
                prev.map(r => r.id === record.id ? { ...r, synced: true } : r)
              );
            } catch (e: any) {
              console.warn('[TimeGuard] Log lookup failed:', e.message);
              Alert.alert('Sync Error', 'Failed to save call log to database: ' + e.message);
            }
          }, 1000);
        } else {
          setStatus('idle');
        }
      }
    });

    return () => sub.remove();
  }, [isCallTracking, isAtHome, isWithinShift]);

  async function requestPermissions() {
    if (Platform.OS !== 'android') return;
    try {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        PermissionsAndroid.PERMISSIONS.READ_CALL_LOG,
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      
      // Check if location permissions were granted
      const locationGranted =
        results[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
        results[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

      if (!locationGranted) {
        Alert.alert(
          'Location Permission Required',
          'TimeGuard needs location permission to track your GPS.\n\nPlease enable location permission in Settings.',
          [{ text: 'OK' }]
        );
        console.warn('[TimeGuard] Location permissions not granted:', results);
        return;
      }

      console.log('[TimeGuard] All permissions granted:', results);
      setPermissionsGranted(true);
    } catch (e) {
      console.error('[TimeGuard] Permission error:', e);
      Alert.alert('Permission Error', 'Failed to request permissions. GPS tracking may not work.');
    }
  }

  function formatDuration(secs: number) {
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  async function refreshLocation() {
    setCurrentAddress('🔄 Fetching location...');
    try {
      if (!LocationModule) {
        setCurrentAddress('❌ Location module not available');
        Alert.alert('Error', 'Location module not initialized');
        return;
      }

      if (!permissionsGranted) {
        setCurrentAddress('❌ Location permission not granted');
        Alert.alert('Permission Denied', 'Please grant location permission in app settings');
        await requestPermissions();
        return;
      }

      // Wrap in Promise.race with 20 second timeout
      const locationPromise = LocationModule.getCurrentLocation();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('GPS request timed out - try outdoors with clear sky')), 20000)
      );

      const loc = await Promise.race([locationPromise, timeoutPromise]) as any;
      
      setCurrentLocation({ lat: loc.latitude, lng: loc.longitude });
      if (loc.address && loc.address.length > 0) {
        setCurrentAddress(loc.address);
      } else {
        setCurrentAddress(`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
      }
      console.log('[TimeGuard] Location refreshed:', loc);
    } catch (e: any) {
      console.error('[TimeGuard] Refresh location error:', e);
      const errorMsg = e.message || e.toString();
      setCurrentAddress(`❌ ${errorMsg}`);
      Alert.alert(
        'Location Failed',
        `${errorMsg}\n\nTroubleshooting:\n• Go outdoors (GPS needs clear sky)\n• Restart the app\n• Check GPS is enabled`,
        [{ text: 'OK' }, { text: 'Try Again', onPress: refreshLocation }]
      );
    }
  }

  const statusColor = status === 'on_call' ? '#10B981' : status === 'ringing' ? '#F59E0B' : '#7C3AED';
  const statusText = status === 'on_call' ? '📞 On Call' : status === 'ringing' ? '📲 Ringing...' : '✅ Monitoring Active';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f0f1a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>⏱ TimeGuard</Text>
          <Text style={styles.name}>{session.name}</Text>
        </View>
        <TouchableOpacity onPress={() => Alert.alert('Sign Out', 'Sign out from this device?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: onLogout },
        ])}>
          <Text style={styles.logoutBtn}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Status Card */}
      <View style={[styles.statusCard, { borderColor: !isWithinShift ? '#64748b' : isAtHome ? '#64748b' : statusColor }]}>
        <Text style={[styles.statusDot, { color: !isWithinShift ? '#64748b' : isAtHome ? '#64748b' : statusColor }]}>●</Text>
        <Text style={[styles.statusText, { color: !isWithinShift ? '#64748b' : isAtHome ? '#64748b' : statusColor }]}>
          {!isWithinShift ? '🌙 Off Shift (Tracking Paused)' : isAtHome ? '🏠 At Home (Tracking Paused)' : statusText}
        </Text>
        {isWithinShift && !isAtHome && status !== 'idle' && (
          <Text style={styles.statusNumber}>{callContactRef.current || callNumberRef.current}</Text>
        )}
      </View>

      {/* Current Location Card */}
      <View style={styles.locationCard}>
        <View style={styles.locationHeader}>
          <Text style={styles.locationTitle}>📍 GPS location</Text>
          <TouchableOpacity onPress={() => currentLocation && fetchAddress(currentLocation.lat, currentLocation.lng)}>
            <Text style={styles.refreshBtn}>Refresh</Text>
          </TouchableOpacity>
        </View>
        {currentLocation ? (
          <View>
            <Text style={styles.coordinates}>
              {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            </Text>
            <Text style={styles.address}>{currentAddress}</Text>
          </View>
        ) : (
          <Text style={styles.address}>Locating...</Text>
        )}
      </View>


      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          📡 All calls are automatically synced to your TimeGuard dashboard. Keep this app running in the background.
        </Text>
      </View>

      {/* Call Log */}
      <Text style={styles.sectionTitle}>Today's Call Log</Text>
      <ScrollView style={styles.logList} showsVerticalScrollIndicator={false}>
        {callRecords.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📵</Text>
            <Text style={styles.emptyText}>No calls yet today</Text>
          </View>
        ) : (
          callRecords.map(r => (
            <View key={r.id} style={styles.logItem}>
              <Text style={styles.callIcon}>
                {r.type === 'outgoing' ? '↗' : r.type === 'incoming' ? '↙' : '✕'}
              </Text>
              <View style={styles.logInfo}>
                <Text style={styles.logContact}>{r.contact || r.number || 'Unknown'}</Text>
                <Text style={styles.logMeta}>
                  {r.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {r.duration > 0 ? `  ·  ${formatDuration(r.duration)}` : '  · Missed'}
                </Text>
              </View>
              <Text style={[styles.syncBadge, r.synced && styles.syncedBadge]}>
                {r.synced ? '✓ Synced' : '⏳'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', paddingTop: 48 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 20,
  },
  logo: { fontSize: 20, fontWeight: '800', color: '#A78BFA' },
  name: { fontSize: 12, color: '#64748b', marginTop: 2 },
  logoutBtn: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  statusCard: {
    marginHorizontal: 20, borderRadius: 16,
    backgroundColor: '#1a1a2e', borderWidth: 1.5,
    padding: 20, alignItems: 'center', marginBottom: 16,
  },
  statusDot: { fontSize: 24, marginBottom: 6 },
  statusText: { fontSize: 18, fontWeight: '700' },
  statusNumber: { color: '#94a3b8', fontSize: 13, marginTop: 4 },
  infoBox: {
    marginHorizontal: 20, backgroundColor: '#1e293b',
    borderRadius: 12, padding: 14, marginBottom: 20,
  },
  infoText: { color: '#94a3b8', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: '#e2e8f0',
    paddingHorizontal: 20, marginBottom: 10,
  },
  logList: { flex: 1, paddingHorizontal: 20 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: '#475569', fontSize: 14 },
  logItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2e', borderRadius: 12,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#2d2d50',
  },
  callIcon: { fontSize: 20, width: 32, textAlign: 'center' },
  logInfo: { flex: 1, marginLeft: 8 },
  logContact: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  logMeta: { color: '#64748b', fontSize: 11, marginTop: 2 },
  syncBadge: { fontSize: 10, color: '#64748b', backgroundColor: '#252540', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  syncedBadge: { color: '#10B981', backgroundColor: '#052e16' },
  locationCard: {
    marginHorizontal: 20, backgroundColor: '#1a1a2e',
    borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#2d2d50',
  },
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  locationTitle: { color: '#10B981', fontSize: 13, fontWeight: '700' },
  refreshBtn: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  coordinates: { color: '#e2e8f0', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  address: { color: '#94a3b8', fontSize: 11, lineHeight: 16 },
});
