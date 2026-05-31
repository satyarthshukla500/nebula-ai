/**
 * Notification System - Main Export
 * 
 * Provides a singleton NotificationService instance with environment-based provider selection.
 */

import { NotificationService } from './NotificationService';
import { ConsoleProvider } from './providers/ConsoleProvider';
import { EmailProvider } from './providers/EmailProvider';
import { SMSProvider } from './providers/SMSProvider';
import {
  NotificationProvider,
  NotificationServiceConfig,
} from './types';

/**
 * Get notification provider based on environment
 */
function getDefaultProvider(): NotificationProvider {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'development' || env === 'test') {
    console.log('🔧 Using ConsoleProvider (development mode)');
    return new ConsoleProvider();
  }

  // In production, try to use EmailProvider
  // If not configured, fall back to ConsoleProvider
  const emailProvider = new EmailProvider();
  if (emailProvider.isAvailable()) {
    console.log('📧 Using EmailProvider (production mode)');
    return emailProvider;
  }

  console.warn('⚠️  EmailProvider not configured, falling back to ConsoleProvider');
  return new ConsoleProvider();
}

/**
 * Get fallback provider
 */
function getFallbackProvider(): NotificationProvider | undefined {
  // Always use ConsoleProvider as fallback
  return new ConsoleProvider();
}

/**
 * Create notification service configuration
 */
function createNotificationServiceConfig(): NotificationServiceConfig {
  return {
    provider: getDefaultProvider(),
    fallbackProvider: getFallbackProvider(),
    retryAttempts: 3,
    retryDelayMs: 1000,
  };
}

/**
 * Singleton NotificationService instance
 */
let notificationServiceInstance: NotificationService | null = null;

/**
 * Get or create NotificationService singleton
 */
export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    const config = createNotificationServiceConfig();
    notificationServiceInstance = new NotificationService(config);
  }
  return notificationServiceInstance;
}

/**
 * Reset notification service (for testing)
 */
export function resetNotificationService(): void {
  notificationServiceInstance = null;
}

/**
 * Create custom notification service with specific provider
 * Useful for testing or custom configurations
 */
export function createNotificationService(
  provider: NotificationProvider,
  fallbackProvider?: NotificationProvider
): NotificationService {
  return new NotificationService({
    provider,
    fallbackProvider,
    retryAttempts: 3,
    retryDelayMs: 1000,
  });
}

/**
 * Get a NotificationService backed by SMSProvider (with ConsoleProvider fallback)
 */
export function getSMSNotificationService(): NotificationService {
  return new NotificationService({
    provider: new SMSProvider(),
    fallbackProvider: new ConsoleProvider(),
    retryAttempts: 3,
    retryDelayMs: 1000,
  });
}

/**
 * Get a NotificationService backed by EmailProvider (with ConsoleProvider fallback)
 */
export function getEmailNotificationService(): NotificationService {
  return new NotificationService({
    provider: new EmailProvider(),
    fallbackProvider: new ConsoleProvider(),
    retryAttempts: 3,
    retryDelayMs: 1000,
  });
}

// Export all types and classes
export * from './types';
export { NotificationService } from './NotificationService';
export { ConsoleProvider } from './providers/ConsoleProvider';
export { EmailProvider } from './providers/EmailProvider';
export { SMSProvider } from './providers/SMSProvider';
export { PushProvider } from './providers/PushProvider';
