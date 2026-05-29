import { useState, useEffect, useCallback } from "react";
import type { ModelConfig } from "../../../shared/types";
import { getModelsUrl } from "../config/api";
import { fetchSessionModels } from "../api/openace";

interface UseModelReturn {
  models: ModelConfig[];
  selectedModel: string | null;
  setSelectedModel: (modelId: string | null) => void;
  loading: boolean;
  error: string | null;
  emptyReason: string | null;
  haPoolToken: string | null;
}

const STORAGE_KEY = "qwen-selected-model";

interface UseModelOptions {
  integratedMode?: boolean;
  workspaceType?: "local" | "remote";
  machineId?: string;
  sessionId?: string | null;
}

/**
 * Hook for managing model selection
 * - Fetches available models from API
 * - Persists selected model to localStorage
 */
export function useModel(options: UseModelOptions = {}): UseModelReturn {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModelState] = useState<string | null>(() => {
    // Initialize from localStorage
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [haPoolToken, setHaPoolToken] = useState<string | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        if (options.integratedMode) {
          const data = await fetchSessionModels({
            workspaceType: options.workspaceType || "local",
            machineId: options.machineId,
            sessionId: options.sessionId,
          });
          setModels(data.models || []);
          setEmptyReason(data.empty_reason || null);
          setHaPoolToken(data.ha_pool_token || null);
        } else {
          const response = await fetch(getModelsUrl());
          if (!response.ok) {
            throw new Error(`Failed to fetch models: ${response.status}`);
          }
          const data = await response.json();
          setModels(data.models || []);
          setEmptyReason(null);
          setHaPoolToken(null);
        }
        setError(null);
      } catch (err) {
        console.error("Failed to fetch models:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch models");
        setModels([]);
        setEmptyReason(null);
        setHaPoolToken(null);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [options.integratedMode, options.machineId, options.sessionId, options.workspaceType]);

  // Set default model when models are loaded
  useEffect(() => {
    if (models.length === 0) return;

    // Check if current selectedModel is valid
    const isValidModel = selectedModel && models.some((m) => m.id === selectedModel);

    if (!isValidModel) {
      // Either no selection or saved model is no longer available
      // Auto-select the first available model
      const defaultModel = models[0].id;
      setSelectedModelState(defaultModel);
      try {
        localStorage.setItem(STORAGE_KEY, defaultModel);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [models, selectedModel]);

  // Set selected model and persist to localStorage
  const setSelectedModel = useCallback((modelId: string | null) => {
    setSelectedModelState(modelId);
    try {
      if (modelId) {
        localStorage.setItem(STORAGE_KEY, modelId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  return {
    models,
    selectedModel,
    setSelectedModel,
    loading,
    error,
    emptyReason,
    haPoolToken,
  };
}
