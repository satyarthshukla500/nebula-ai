/**
 * Push Notification Provider
 *
 * Web Push notification delivery using the Web Push API.
 * Falls back gracefully when no push subscription exists for the user.
 *
 * In a Next.js app without a native mobile app, push notifications are
 * delivered via the browser's Push API (RFC 8030) using VAPID authentication.
 *
 * TODO: Integrate with a real push subscription store (e.g. push_subscriptions table)
 *       and install the `web-push` npm package for production use.
 */

import {
  NotificationProvider,
  NotificationRequest,
  NotificationResult,
} from '../types';

/**
 * Minimal shape of a Web Push subscription object (matches PushSubscription JSON).
 */
export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Lookup a stored push subscription for a given user.
 *
 * Stub implementation — returns undefined (no subscription found).
 * Replace with a real database lookup when a `push_subscriptions` table exists.
 */
async function getPushSubscription(
  userId: string
): Promise<PushSubscription | undefined> {
  // TODO: query push_subscriptions table, e.g.:
  // const { data } = await supabase
  //   .from('push_subscriptions')
  //   .select('endpoint, keys')
  //   .eq('user_id', userId)
  //   .single();
  // return data ?? undefined;

  void userId; // suppress unused-variable warning until real impl lands
  return undefined;
}

/**
 * Send a Web Push notification to a subscription endpoint.
 *
 * Stub implementation — logs the payload and returns success.
 * Replace with a real `web-push` call when VAPID keys are configured:
 *
 *   import webpush from 'web-push';
 *   webpush.setVapidDetails(subject, publicKey, privateKey);
 *   await webpush.sendNotification(subscription, JSON.stringify(payload));
 */
async function sendWebPush(
  subscription: PushSubscription,
  payload: Record<string, unknown>
): Promise<void> {
  console.log('🔔 [PushProvider STUB] Would send Web Push', {
    endpoint: subscription.endpoint.slice(0, 40) + '…',
    payload,
  });

  // TODO: Replace with real web-push call, e.g.:
  // import webpush from 'web-push';
  // webpush.setVapidDetails(
  //   'mailto:' + process.env.VAPID_SUBJECT,
  //   process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  //   process.env.VAPID_PRIVATE_KEY!
  // );
  // await webpush.sendNotification(subscription, JSON.stringify(payload));
}

/**
 * PushProvider — delivers Web Push notifications to subscribed browsers.
 *
 * Behaviour:
 * - Looks up the user's stored push subscription.
 * - If no subscription exists, returns success=false with a descriptive error
 *   so the NotificationService can fall back to another provider.
 * - If a subscription exists, sends the push payload (stub logs it).
 */
export class PushProvider implements NotificationProvider {
  readonly name = 'PushProvider';

  /**
   * Send a push notification.
   * Returns success=false (no error thrown) when no subscription is found,
   * allowing the NotificationService fallback chain to continue.
   */
  async send(request: NotificationRequest): Promise<NotificationResult> {
    const timestamp = new Date().toISOString();
    const userId = request.recipient.userId ?? request.payload.userId;

    if (!userId) {
      return {
        success: false,
        provider: this.name,
        timestamp,
        error: 'No userId provided for push delivery',
      };
    }

    // Look up stored push subscription for this user
    const subscription = await getPushSubscription(userId);

    if (!subscription) {
      console.log('🔔 [PushProvider] No push subscription found for user', {
        userId,
        type: request.payload.type,
      });

      return {
        success: false,
        provider: this.name,
        timestamp,
        error: 'No push subscription found for user',
      };
    }

    try {
      const pushPayload = {
        title: 'Nebula AI Guardian',
        body: request.payload.message,
        type: request.payload.type,
        metadata: request.payload.metadata ?? {},
        timestamp,
      };

      await sendWebPush(subscription, pushPayload);

      console.log('✅ [PushProvider] Push notification sent', {
        userId,
        type: request.payload.type,
      });

      return {
        success: true,
        provider: this.name,
        timestamp,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown push error';

      console.error('❌ [PushProvider] Push delivery failed', {
        userId,
        type: request.payload.type,
        error: errorMessage,
      });

      return {
        success: false,
        provider: this.name,
        timestamp,
        error: errorMessage,
      };
    }
  }

  /**
   * Push provider is available when VAPID keys are configured.
   * Stub always returns true; update when integrating real web-push.
   */
  isAvailable(): boolean {
    // TODO: return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    return true;
  }
}
