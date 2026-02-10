/**
 * Error Codes and Error Handling Utility
 * 
 * Provides standardized error messages and handling for SecureShare.
 * Ensures consistent user experience and proper error logging.
 */

import { Platform } from 'react-native';
import { logAnalyticsEvent, logSecurityEvent } from '../lib/supabase';
import { getCurrentUserId } from '../lib/supabase';
import { queueAnalyticsEvent, queueSecurityEvent } from './analyticsQueue';

// Error code definitions
export const ERROR_CODES = {
  // Authentication errors (AUTH_xxx)
  AUTH_NOT_SIGNED_IN: {
    code: 'AUTH_001',
    message: 'Please sign in to continue',
    title: 'Not Signed In',
    action: 'Sign In',
    severity: 'info',
    recoverable: true,
  },
  AUTH_SESSION_EXPIRED: {
    code: 'AUTH_002',
    message: 'Your session has expired. Please sign in again.',
    title: 'Session Expired',
    action: 'Sign In',
    severity: 'warning',
    recoverable: true,
  },
  AUTH_INVALID_CREDENTIALS: {
    code: 'AUTH_003',
    message: 'Invalid email or password. Please try again.',
    title: 'Sign In Failed',
    action: 'Try Again',
    severity: 'warning',
    recoverable: true,
  },

  // Upload errors (UPLOAD_xxx)
  UPLOAD_FILE_TOO_LARGE: {
    code: 'UPLOAD_001',
    message: 'File is too large. Maximum size is 10MB.',
    title: 'File Too Large',
    action: 'Choose Smaller File',
    severity: 'info',
    recoverable: false,
  },
  UPLOAD_NETWORK_ERROR: {
    code: 'UPLOAD_002',
    message: 'Network error. Check your connection and try again.',
    title: 'Upload Failed',
    action: 'Retry',
    severity: 'warning',
    recoverable: true,
  },
  UPLOAD_SERVER_ERROR: {
    code: 'UPLOAD_003',
    message: 'Server error. Please try again in a few minutes.',
    title: 'Upload Failed',
    action: 'Retry Later',
    severity: 'error',
    recoverable: true,
  },
  UPLOAD_FILE_NOT_FOUND: {
    code: 'UPLOAD_004',
    message: 'File not found. It may have been moved or deleted.',
    title: 'File Not Found',
    action: 'Choose Again',
    severity: 'warning',
    recoverable: false,
  },
  UPLOAD_ENCRYPTION_FAILED: {
    code: 'UPLOAD_005',
    message: 'Failed to encrypt file. Please try again.',
    title: 'Encryption Error',
    action: 'Retry',
    severity: 'error',
    recoverable: true,
  },

  // Access errors (ACCESS_xxx)
  ACCESS_DENIED: {
    code: 'ACCESS_001',
    message: 'You do not have permission to view this document.',
    title: 'Access Denied',
    action: 'Contact Owner',
    severity: 'warning',
    recoverable: false,
  },
  ACCESS_DOCUMENT_NOT_FOUND: {
    code: 'ACCESS_002',
    message: 'Document not found or you don\'t have access.',
    title: 'Not Found',
    action: 'Check Link',
    severity: 'warning',
    recoverable: false,
  },
  ACCESS_EXPIRED: {
    code: 'ACCESS_003',
    message: 'This document has expired and is no longer available.',
    title: 'Expired',
    action: 'Request New Link',
    severity: 'info',
    recoverable: false,
  },
  ACCESS_REVOKED: {
    code: 'ACCESS_004',
    message: 'Access has been revoked by the document owner.',
    title: 'Access Revoked',
    action: 'Contact Owner',
    severity: 'info',
    recoverable: false,
  },
  ACCESS_KEY_MISSING: {
    code: 'ACCESS_005',
    message: 'Decryption key not found. You may need to request access again.',
    title: 'Key Missing',
    action: 'Request Access',
    severity: 'error',
    recoverable: true,
  },

  // Decryption errors (DECRYPT_xxx)
  DECRYPT_FAILED: {
    code: 'DECRYPT_001',
    message: 'Failed to decrypt document. The key may be invalid.',
    title: 'Decryption Error',
    action: 'Retry',
    severity: 'error',
    recoverable: true,
  },
  DECRYPT_CORRUPTED: {
    code: 'DECRYPT_002',
    message: 'Document appears to be corrupted.',
    title: 'Corrupted File',
    action: 'Contact Owner',
    severity: 'error',
    recoverable: false,
  },

  // Watermark errors (WATERMARK_xxx)
  WATERMARK_INVALID: {
    code: 'WATERMARK_001',
    message: 'Document security watermark is invalid. This may indicate tampering.',
    title: 'Security Warning',
    action: 'Report Issue',
    severity: 'warning',
    recoverable: false,
    security: true,
  },
  WATERMARK_MISSING: {
    code: 'WATERMARK_002',
    message: 'Document security watermark is missing.',
    title: 'Security Warning',
    action: 'Report Issue',
    severity: 'warning',
    recoverable: false,
    security: true,
  },

  // Security errors (SECURITY_xxx)
  SECURITY_ROOTED: {
    code: 'SECURITY_001',
    message: 'This app cannot run on rooted/jailbroken devices for security reasons.',
    title: 'Security Block',
    action: 'Close App',
    severity: 'error',
    recoverable: false,
  },
  SECURITY_SCREENSHOT_BLOCKED: {
    code: 'SECURITY_002',
    message: 'Screenshots are blocked while viewing secure documents.',
    title: 'Screenshot Blocked',
    action: 'OK',
    severity: 'info',
    recoverable: true,
  },

  // General errors (GENERAL_xxx)
  GENERAL_UNKNOWN: {
    code: 'GENERAL_001',
    message: 'An unexpected error occurred. Please try again.',
    title: 'Error',
    action: 'Retry',
    severity: 'warning',
    recoverable: true,
  },
  GENERAL_PERMISSION_DENIED: {
    code: 'GENERAL_002',
    message: 'Permission denied. Please grant access in Settings.',
    title: 'Permission Required',
    action: 'Open Settings',
    severity: 'warning',
    recoverable: true,
  },
  GENERAL_STORAGE_FULL: {
    code: 'GENERAL_003',
    message: 'Not enough storage space. Please free up space and try again.',
    title: 'Storage Full',
    action: 'OK',
    severity: 'error',
    recoverable: true,
  },
};

/**
 * Get error definition by code
 * @param {string} code - Error code
 * @returns {Object} Error definition
 */
export const getErrorByCode = (code) => {
  return ERROR_CODES[code] || ERROR_CODES.GENERAL_UNKNOWN;
};

/**
 * Handle error with proper logging and user feedback
 * @param {Error|Object} error - Error object or error code
 * @param {Object} context - Additional context (screen, action, etc.)
 * @param {Function} onShowAlert - Optional callback to show alert dialog
 */
export const handleError = async (error, context = {}, onShowAlert = null) => {
  // Extract error code and message
  let errorCode = 'GENERAL_UNKNOWN';
  let errorMessage = 'An unexpected error occurred';
  let errorTitle = 'Error';
  let errorAction = 'Retry';
  let severity = 'warning';
  let isSecurityEvent = false;

  if (typeof error === 'string') {
    // Error code passed as string
    const errorDef = getErrorByCode(error);
    errorCode = error;
    errorMessage = errorDef.message;
    errorTitle = errorDef.title;
    errorAction = errorDef.action;
    severity = errorDef.severity;
    isSecurityEvent = errorDef.security || false;
  } else if (error?.code) {
    // Error object with code
    const errorDef = getErrorByCode(error.code);
    errorCode = error.code;
    errorMessage = error.message || errorDef.message;
    errorTitle = errorDef.title;
    errorAction = errorDef.action;
    severity = errorDef.severity;
    isSecurityEvent = errorDef.security || false;
  } else {
    // Generic error
    errorMessage = error?.message || 'An unexpected error occurred';
  }

  // Log error to analytics (if not a security event, log as regular analytics)
  try {
    const userId = await getCurrentUserId();
    
    if (isSecurityEvent) {
      await queueSecurityEvent({
        document_id: context.documentId || null,
        event_type: 'error',
        platform: Platform.OS,
        metadata: {
          error_code: errorCode,
          error_message: errorMessage,
          screen: context.screen || 'unknown',
          action: context.action || 'unknown',
        }
      });
    } else {
      await queueAnalyticsEvent({
        event_type: 'app_error',
        document_id: context.documentId || null,
        metadata: {
          error_code: errorCode,
          error_message: errorMessage.substring(0, 200), // Truncate long messages
          screen: context.screen || 'unknown',
          action: context.action || 'unknown',
          severity,
        }
      });
    }
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }

  // Show alert if callback provided
  if (onShowAlert) {
    onShowAlert({
      title: errorTitle,
      message: errorMessage,
      action: errorAction,
      errorCode,
    });
  }

  // Return error info for components that want to handle it themselves
  return {
    code: errorCode,
    message: errorMessage,
    title: errorTitle,
    action: errorAction,
    severity,
    recoverable: getErrorByCode(errorCode)?.recoverable || true,
  };
};

/**
 * Show error alert dialog
 * @param {Object} errorInfo - Error information from handleError
 * @param {Function} onAction - Optional callback when action button pressed
 */
export const showErrorAlert = (errorInfo, onAction = null) => {
  Alert.alert(
    errorInfo.title,
    errorInfo.message,
    [
      {
        text: errorInfo.action || 'OK',
        onPress: () => {
          if (onAction) onAction(errorInfo);
        },
      },
    ],
    { cancelable: errorInfo.severity !== 'error' }
  );
};

/**
 * Create a retry-friendly error handler for async operations
 * @param {Function} operation - Async operation to retry
 * @param {Object} options - Options
 * @returns {Function} Wrapped function with error handling
 */
export const withErrorHandling = (operation, options = {}) => {
  const {
    onError = null,
    fallback = null,
    context = {},
  } = options;

  return async (...args) => {
    try {
      return await operation(...args);
    } catch (error) {
      const errorInfo = handleError(error, context);
      
      if (onError) {
        onError(errorInfo);
      }
      
      return fallback;
    }
  };
};

export default {
  ERROR_CODES,
  getErrorByCode,
  handleError,
  showErrorAlert,
  withErrorHandling,
};
