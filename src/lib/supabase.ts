// Supabase client for TimeGuard Android App

const SUPABASE_URL = 'https://ogqmojvzeyasqoqhkpuz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ncW1vanZ6ZXlhc3FvcWhrcHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNTM1NTQsImV4cCI6MjA5NjgyOTU1NH0.kWuDdRb2bb8IAOMot5BnIvQzWefOAkYfIRmJxFqT4v8';

const headers = (token?: string) => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

export async function signIn(email: string, password: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || 'Login failed');
  return json; // { access_token, ... }
}

export async function getEmployeeId(email: string, token: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/employees?email=eq.${encodeURIComponent(email)}&select=id,first_name,last_name`,
    { headers: headers(token) }
  );
  const json = await res.json();
  if (!res.ok || !json.length) throw new Error('Employee not found');
  return json[0]; // { id, first_name, last_name }
}

export async function insertCallLog(payload: {
  employee_id: string;
  call_start: string;
  call_end: string;
  duration_seconds: number;
  call_type: 'incoming' | 'outgoing' | 'missed';
  contact_name: string | null;
  phone_number: string | null;
}, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/call_logs`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[TimeGuard] Call log error:', err);
    throw new Error(`Failed to log call: ${err}`);
  }
  return true;
}

export async function getTodayCallLogs(employeeId: string, token: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/call_logs?employee_id=eq.${employeeId}&call_start=gte.${startOfDay.toISOString()}&order=call_start.desc`,
    { headers: headers(token) }
  );
  
  if (!res.ok) {
    console.warn('[TimeGuard] Failed to fetch call logs');
    return [];
  }
  return await res.json();
}

export async function logFieldLocation(payload: {
  employee_id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  timestamp: string;
}, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/field_locations`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function getFieldSites(token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/field_sites?select=*`, {
    headers: headers(token)
  });
  return res.json();
}

export async function getEmployeeSettings(employeeId: string, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${employeeId}&select=tracking_enabled,call_tracking_enabled,auto_field_work,home_lat,home_lng,shift_start,shift_end`, {
    headers: headers(token)
  });
  const json = await res.json();
  return json[0];
}

export async function updateEmployeeSettings(employeeId: string, payload: any, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/employees?id=eq.${employeeId}`, {
    method: 'PATCH',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function startAutoVisit(payload: any, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/field_visits`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function endAutoVisit(visitId: string, payload: any, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/field_visits?id=eq.${visitId}`, {
    method: 'PATCH',
    headers: { ...headers(token), Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}
