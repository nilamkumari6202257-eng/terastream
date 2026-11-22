import { useSyncExternalStore } from 'react';
import { storageService } from '@/services/storageService';
export function useStoreVersion(): number { return useSyncExternalStore((fn) => storageService.subscribe(fn), () => storageService.getVersion(), () => 0); }
