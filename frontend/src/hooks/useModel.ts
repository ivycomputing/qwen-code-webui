import { useState, useEffect, useCallback } from "react";
import type { ModelConfig } from "../../../shared/types";
import { getModelsUrl } from "../config/api";

interface UseModelReturn {
  models: ModelConfig[];
  selectedModel: string | null;
  setSelectedModel: (modelId: string | null) => void;
  loading: boolean;
  error: string | null;
}

const STORAGE_KEY = "qwen-selected-model";

/**
 * Hook for managing model selection
 * - Fetches available models from API
 * - Persists selected model to localStorage
 */
export function useModel(): UseModelReturn {
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

  // Fetch models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        const response = await fetch(getModelsUrl());
        if (!response.ok) {
          throw new Error(`Failed to fetch models: ${response.status}`);
        }
        const data = await response.json();
        setModels(data.models || []);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch models:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch models");
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

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
  };
}