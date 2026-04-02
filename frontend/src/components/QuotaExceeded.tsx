/**
 * QuotaExceeded Component - Display when user quota is exceeded
 *
 * This component shows a friendly error message when the user's
 * token or request quota has been exceeded.
 */

import React from 'react';

interface QuotaExceededProps {
  message?: string;
  quotaStatus?: {
    daily?: {
      tokens?: { used: number; limit: number | null; over_quota: boolean };
      requests?: { used: number; limit: number | null; over_quota: boolean };
    };
    monthly?: {
      tokens?: { used: number; limit: number | null; over_quota: boolean };
      requests?: { used: number; limit: number | null; over_quota: boolean };
    };
  };
  onRetry?: () => void;
}

export const QuotaExceeded: React.FC<QuotaExceededProps> = ({
  message = 'Your quota has been exceeded. Please contact your administrator.',
  quotaStatus,
  onRetry,
}) => {
  // Determine which quotas are exceeded
  const exceededItems: string[] = [];
  
  if (quotaStatus?.daily?.requests?.over_quota) {
    exceededItems.push(`Daily requests: ${quotaStatus.daily.requests.used}/${quotaStatus.daily.requests.limit || '∞'}`);
  }
  if (quotaStatus?.daily?.tokens?.over_quota) {
    exceededItems.push(`Daily tokens: ${quotaStatus.daily.tokens.used}/${quotaStatus.daily.tokens.limit || '∞'}`);
  }
  if (quotaStatus?.monthly?.requests?.over_quota) {
    exceededItems.push(`Monthly requests: ${quotaStatus.monthly.requests.used}/${quotaStatus.monthly.requests.limit || '∞'}`);
  }
  if (quotaStatus?.monthly?.tokens?.over_quota) {
    exceededItems.push(`Monthly tokens: ${quotaStatus.monthly.tokens.used}/${quotaStatus.monthly.tokens.limit || '∞'}`);
  }

  return (
    <div className="quota-exceeded">
      <div className="quota-exceeded-content">
        {/* Warning Icon */}
        <div className="quota-exceeded-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" x2="12" y1="9" y2="13" />
            <line x1="12" x2="12.01" y1="17" y2="17" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="quota-exceeded-title">Quota Exceeded</h2>

        {/* Message */}
        <p className="quota-exceeded-message">{message}</p>

        {/* Exceeded Items */}
        {exceededItems.length > 0 && (
          <div className="quota-exceeded-details">
            <h4>Exceeded Limits:</h4>
            <ul>
              {exceededItems.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Help Text */}
        <p className="quota-exceeded-help">
          Quota limits are set by your administrator. If you need higher limits, 
          please contact your administrator.
        </p>

        {/* Retry Button */}
        {onRetry && (
          <button className="quota-exceeded-retry" onClick={onRetry}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            Retry
          </button>
        )}
      </div>

      {/* Styles */}
      <style>{`
        .quota-exceeded {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 300px;
          padding: 2rem;
        }

        .quota-exceeded-content {
          text-align: center;
          max-width: 400px;
        }

        .quota-exceeded-icon {
          color: #f59e0b;
          margin-bottom: 1rem;
        }

        .quota-exceeded-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: #dc2626;
          margin-bottom: 0.5rem;
        }

        .quota-exceeded-message {
          color: #6b7280;
          margin-bottom: 1rem;
        }

        .quota-exceeded-details {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 0.5rem;
          padding: 1rem;
          margin-bottom: 1rem;
          text-align: left;
        }

        .quota-exceeded-details h4 {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #92400e;
        }

        .quota-exceeded-details ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin: 0;
        }

        .quota-exceeded-details li {
          font-size: 0.875rem;
          color: #78350f;
        }

        .quota-exceeded-help {
          font-size: 0.875rem;
          color: #9ca3af;
          margin-bottom: 1.5rem;
        }

        .quota-exceeded-retry {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .quota-exceeded-retry:hover {
          background: #2563eb;
        }

        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
          .quota-exceeded-title {
            color: #f87171;
          }

          .quota-exceeded-message {
            color: #9ca3af;
          }

          .quota-exceeded-details {
            background: #422006;
            border-color: #b45309;
          }

          .quota-exceeded-details h4 {
            color: #fcd34d;
          }

          .quota-exceeded-details li {
            color: #fbbf24;
          }

          .quota-exceeded-help {
            color: #6b7280;
          }
        }
      `}</style>
    </div>
  );
};