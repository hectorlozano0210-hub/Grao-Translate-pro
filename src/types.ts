export interface Device {
  id: number;
  device_id: string;
  auth_key: string | null;
  status: 'pending' | 'active';
  plan_type: string | null;
  total_minutes: number;
  remaining_minutes: number;
  created_at: string;
}

export interface TranslationResult {
  translatedText: string;
  originalText: string;
}
