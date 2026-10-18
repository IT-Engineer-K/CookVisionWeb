export type Confidence = "high" | "medium" | "low";

export type SessionStatus = "capturing" | "analyzing" | "done" | "failed";

export type CookingSession = {
  id: string;
  user_id: string;
  title: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  error: string | null;
};

export type Capture = {
  id: string;
  session_id: string;
  user_id: string;
  storage_path: string;
  taken_at: string;
  note: string | null;
  face_blurred: boolean;
  crop: Crop | null;
  source: CaptureSource;
  signature: number[] | null;
};

export type CaptureSource = "manual" | "auto";

/** 写真の中の切り抜き範囲（左上を0、右下を1とした割合） */
export type Crop = { x: number; y: number; w: number; h: number };

export type Recipe = {
  id: string;
  user_id: string;
  session_id: string | null;
  title: string;
  servings: number | null;
  description: string | null;
  visibility: "private";
  ai_provider: string | null;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredient = {
  id: string;
  recipe_id: string;
  position: number;
  name: string;
  amount: string | null;
  unit: string | null;
  confidence: Confidence;
  ai_name: string | null;
  ai_amount: string | null;
  ai_unit: string | null;
};

export type RecipeStep = {
  id: string;
  recipe_id: string;
  position: number;
  text: string;
  heat: string | null;
  duration_min: number | null;
  capture_id: string | null;
  confidence: Confidence;
  ai_text: string | null;
};
