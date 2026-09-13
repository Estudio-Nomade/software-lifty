export type IdentificationStatus = 'pending_pickup' | 'issued' | 'revoked';

export type PendingDriver = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  kyc_status: string | null;
  admin_review_status: string;
  identification_status?: IdentificationStatus;
  identification_issued_at?: string | null;
  created_at: string;
  documents_submitted: number;
};

export type DriverDocument = {
  id: string;
  doc_type: string;
  file_url: string;
  status: string;
  superseded_at: string | null;
  created_at: string;
};

export type DriverVehicle = {
  id: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  plate: string | null;
};

export type DriverDetail = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  kyc_status: string | null;
  verified_name: string | null;
  document_number_last4: string | null;
  admin_review_status: string;
  admin_reviewed_at: string | null;
  admin_review_notes: string | null;
  identification_status: IdentificationStatus;
  identification_issued_at: string | null;
  identification_external_ref: string | null;
  district_id: string | null;
  created_at: string;
  vehicles: DriverVehicle[];
  documents: DriverDocument[];
};

export type ReviewResult = {
  driver_id: string;
  action: 'approve' | 'reject';
  status: string;
  message: string;
};
