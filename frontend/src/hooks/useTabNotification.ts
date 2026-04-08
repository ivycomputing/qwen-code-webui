/**
 * Hook for multi-session tab notification mechanism
 * 
 * This hook manages the waiting-for-user state and communicates with parent window
 * (open-ace Workspace) to show notification badges on inactive tabs.
 * 
 * Features:
 * - Detects when session is waiting for user input (permission requests, plan approval, etc.)
 * - Sends notification to parent window via postMessage
 * - Clears notification when tab becomes active or user interacts
 */

import { useEffect, useCallback, useRef } from 'react';

export interface TabNotificationState {
  waitingType: 'permission' | 'plan' | 'input' | null;
  isWaiting: boolean;
}

const CHANNEL_NAME = 'qwen-code-tab-notification';

export function useTabNotification() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const stateRef = useRef<TabNotificationState>({ waitingType: null, isWaiting: false });

  // Initialize BroadcastChannel for cross-tab communication
  useEffect(() => {
    // Only initialize in browser environment
    if (typeof window === 'undefined') return;

    // Try BroadcastChannel first (for same-origin tabs)
    try {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
      
      channelRef.current.onmessage = (event) => {
        const { type, tabId } = event.data;
        if (type === 'clear-notification' && tabId) {
          // Clear notification when user switches to this tab
          if (stateRef.current.isWaiting) {
            updateWaitingState(false, null);
          }
        }
      };
    } catch (error) {
      console.warn('BroadcastChannel not supported, falling back to postMessage');
    }

    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);

  // Update waiting state and notify parent
  const updateWaitingState = useCallback((isWaiting: boolean, waitingType: 'permission' | 'plan' | 'input' | null) => {
    stateRef.current = { isWaiting, waitingType };

    // Notify parent window (open-ace Workspace)
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'qwen-code-tab-notification',
          isWaiting,
          waitingType,
          timestamp: Date.now(),
        },
        '*'
      );
    }

    // Also broadcast to other tabs via BroadcastChannel
    if (channelRef.current) {
      channelRef.current.postMessage({
        type: isWaiting ? 'notification' : 'clear-notification',
        isWaiting,
        waitingType,
        timestamp: Date.now(),
      });
    }
  }, []);

  // Show permission request notification
  const showPermissionNotification = useCallback(() => {
    updateWaitingState(true, 'permission');
  }, [updateWaitingState]);

  // Show plan approval notification
  const showPlanNotification = useCallback(() => {
    updateWaitingState(true, 'plan');
  }, [updateWaitingState]);

  // Show input waiting notification (when AI is waiting for user input)
  const showInputNotification = useCallback(() => {
    updateWaitingState(true, 'input');
  }, [updateWaitingState]);

  // Clear all notifications
  const clearNotification = useCallback(() => {
    updateWaitingState(false, null);
  }, [updateWaitingState]);

  // Listen for focus events from parent window
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'openace-focus-input' || event.data?.type === 'openace-tab-activated') {
        // Tab is now active, clear notification
        clearNotification();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clearNotification]);

  return {
    showPermissionNotification,
    showPlanNotification,
    showInputNotification,
    clearNotification,
  };
}
