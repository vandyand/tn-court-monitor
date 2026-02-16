export interface TrackedCase {
  id: number;
  case_number: string;
  case_name: string | null;
  case_url: string | null;
  created_at: string;
}

export interface DocketEntry {
  id?: number;
  case_id: number;
  entry_date: string;
  event: string;
  filer: string;
  has_pdf: boolean;
  pdf_url: string | null;
  created_at?: string;
}

export interface Alert {
  id: number;
  case_id: number;
  entries_count: number;
  sent_at: string;
  case_number?: string;
  case_name?: string;
}

export interface SearchResult {
  case_number: string;
  case_name: string;
  internal_id: string;
  url: string;
}

export interface ScrapedDocketEntry {
  date: string;
  event: string;
  filer: string;
  has_pdf: boolean;
  pdf_postback_target: string | null;
}
