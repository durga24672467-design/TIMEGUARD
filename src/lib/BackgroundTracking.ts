import BackgroundService from 'react-native-background-actions';
import { SyncQueue } from './SyncQueue';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));

class BackgroundTracking {
  private isRunning = false;

  async start() {
    if (this.isRunning) return;
    
    const options = {
      taskName: 'TimeGuardBackground',
      taskTitle: 'TimeGuard Tracking is Active',
      taskDesc: 'Monitoring calls and location during shift.',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#7C3AED',
      linkingURI: 'timeguard://home',
      parameters: {
        delay: 30000,
      },
    };

    try {
      console.log('[BackgroundTracking] Starting foreground service...');
      await BackgroundService.start(this.taskRandom.bind(this), options);
      this.isRunning = true;
    } catch (e) {
      console.error('[BackgroundTracking] Failed to start service:', e);
    }
  }

  async stop() {
    console.log('[BackgroundTracking] Stopping foreground service...');
    await BackgroundService.stop();
    this.isRunning = false;
  }

  private async taskRandom(taskDataArguments: any) {
    const { delay } = taskDataArguments;
    
    console.log('[BackgroundTracking] Background task started!');
    
    while (BackgroundService.isRunning()) {
      // Flush offline queue periodically
      await SyncQueue.flush();
      
      // Wait before next flush
      await sleep(delay);
    }
  }
}

export const backgroundTracking = new BackgroundTracking();
