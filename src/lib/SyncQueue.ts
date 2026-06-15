import AsyncStorage from '@react-native-async-storage/async-storage';
import { insertCallLog, logFieldLocation } from './supabase';

const QUEUE_KEY = 'tg_offline_queue';

interface QueueItem {
  id: string;
  type: 'call' | 'location';
  payload: any;
  token: string;
  timestamp: number;
}

export const SyncQueue = {
  async add(type: 'call' | 'location', payload: any, token: string) {
    try {
      const existingStr = await AsyncStorage.getItem(QUEUE_KEY);
      const queue: QueueItem[] = existingStr ? JSON.parse(existingStr) : [];
      
      queue.push({
        id: Math.random().toString(36).substring(7) + Date.now(),
        type,
        payload,
        token,
        timestamp: Date.now()
      });
      
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log(`[SyncQueue] Added ${type} to offline queue. Total items: ${queue.length}`);
    } catch (e) {
      console.error('[SyncQueue] Failed to add to queue', e);
    }
  },

  async flush() {
    try {
      const existingStr = await AsyncStorage.getItem(QUEUE_KEY);
      if (!existingStr) return;
      
      let queue: QueueItem[] = JSON.parse(existingStr);
      if (queue.length === 0) return;

      console.log(`[SyncQueue] Flushing ${queue.length} items...`);
      
      const failedItems: QueueItem[] = [];
      let syncedCount = 0;

      for (const item of queue) {
        try {
          if (item.type === 'call') {
            await insertCallLog(item.payload, item.token);
          } else if (item.type === 'location') {
            await logFieldLocation(item.payload, item.token);
          }
          syncedCount++;
        } catch (e: any) {
          // If network error, keep in queue
          if (e.message && (e.message.includes('Network request failed') || e.message.includes('Failed to fetch'))) {
            failedItems.push(item);
          } else {
            // Other error (e.g. invalid data, auth error), log and drop to avoid infinite loop
            console.error(`[SyncQueue] Item ${item.id} failed permanently:`, e);
          }
        }
      }

      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedItems));
      if (syncedCount > 0) {
        console.log(`[SyncQueue] Successfully synced ${syncedCount} items. ${failedItems.length} remaining.`);
      }
    } catch (e) {
      console.error('[SyncQueue] Flush failed', e);
    }
  },

  async getQueue() {
    try {
      const str = await AsyncStorage.getItem(QUEUE_KEY);
      return str ? JSON.parse(str) : [];
    } catch (e) {
      return [];
    }
  }
};
