import React from 'react';
import { XMarkIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/solid';

export interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  path?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

interface Props {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

export function FileAttachmentPreview({ attachments, onRemove, onRetry }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
      {attachments.map((file) => (
        <div
          key={file.id}
          className="relative flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
        >
          {/* Preview/Icon */}
          {file.type.startsWith('image/') && file.preview ? (
            <img src={file.preview} alt={file.name} className="w-12 h-12 object-cover rounded" />
          ) : (
            <div className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded">
              <span className="text-xs text-slate-500 font-medium">
                {file.name.split('.').pop()?.toUpperCase()}
              </span>
            </div>
          )}

          {/* File Info */}
          <div className="flex flex-col gap-1">
            <span className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate max-w-32">
              {file.name}
            </span>
            <span className="text-xs text-slate-500">
              {formatFileSize(file.size)}
            </span>
            
            {/* Upload Progress */}
            {file.status === 'uploading' && (
              <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {file.status === 'error' && (
            <div className="flex items-center gap-1">
              <ExclamationCircleIcon className="w-4 h-4 text-red-600" />
              <button
                onClick={() => onRetry(file.id)}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <ArrowPathIcon className="w-3 h-3" />
                Retry
              </button>
            </div>
          )}

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => onRemove(file.id)}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            title="Remove"
          >
            <XMarkIcon className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>
      ))}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 ** 2)).toFixed(2)} MB`;
}