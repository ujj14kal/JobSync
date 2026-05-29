import { apiClient } from "./client";

export interface NeuralScorerStatus {
  trained: boolean;
  version: number;
  training_samples: number;
  val_mse: number | null;
  val_mae: number | null;
  epochs_trained: number;
  last_trained_at: string | null;
  loaded_in_memory: boolean;
  architecture: string;
  input_features: string;
}

export interface ModelStatus {
  neural_scorer: NeuralScorerStatus;
  recruiter_fit_predictor: {
    phase: string;
    model_type: string;
    version: number;
    training_samples: number;
    test_accuracy: number | null;
    test_auc: number | null;
    loaded_in_memory: boolean;
  };
  embedding_model: { model_name: string; embedding_dim: number };
  fine_tuned_embedder: { trained: boolean; model_path: string | null };
  score_calibrator: {
    loaded: boolean;
    samples_used: number;
    dimensions_calibrated: string[];
  };
  scoring_priority: string[];
}

export const modelMgmtApi = {
  getStatus: () => apiClient.get<ModelStatus>("/model/status"),

  trainNeuralScorer: (epochs = 100, fineTune = false) =>
    apiClient.post("/model/train/neural-scorer", null, {
      params: { epochs, fine_tune: fineTune },
    }),

  generateTrainingData: (pairs = 600) =>
    apiClient.post("/model/generate-training-data", null, {
      params: { pairs },
    }),

  trainEmbedder: (epochs = 5) =>
    apiClient.post("/model/train/embedder", null, {
      params: { epochs },
    }),

  trainCalibrator: () => apiClient.post("/model/train/calibrator"),

  trainRecruiterFit: (force = false) =>
    apiClient.post("/model/train/recruiter-fit", null, {
      params: { force },
    }),
};
