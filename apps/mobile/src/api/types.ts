import { z } from 'zod';

export const apiMetaSchema = z.object({
  timestamp: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    status: z.number(),
  }),
  meta: apiMetaSchema,
});

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: apiMetaSchema,
  });

export type ApiMeta = z.infer<typeof apiMetaSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(body: ApiErrorBody) {
    super(body.error.message);
    this.code = body.error.code;
    this.status = body.error.status;
  }
}

export const driverSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string(),
  vehicle_plate: z.string().nullable(),
  vehicle_brand: z.string().nullable(),
  vehicle_model: z.string().nullable(),
  vehicle_year: z.number().nullable(),
  vehicle_color: z.string().nullable(),
  photo_url: z.string().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'suspended']),
  is_online: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const driverStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'under_review', 'rejected', 'suspended']),
  step: z.enum(['profile', 'kyc', 'vehicle', 'documents', 'review', 'approved']).optional(),
  kyc_status: z.string().optional(),
  documents_pending_review: z.boolean().optional(),
  admin_review_notes: z.string().nullable().optional(),
  has_district: z.boolean().optional(),
  district: z
    .object({
      id: z.string(),
      name: z.string(),
      province: z.string(),
    })
    .optional(),
});

export const districtSchema = z.object({
  id: z.string(),
  name: z.string(),
  province: z.string(),
});

export const districtDetailSchema = districtSchema.extend({
  terms_and_conditions: z.string().nullable(),
  privacy_policy: z.string().nullable(),
});

export const tripStatusSchema = z.enum([
  'request_received',
  'accepted',
  'en_route',
  'waiting',
  'in_trip',
  'completed',
  'rejected',
  'offered',
  'expired',
  'cancelled',
  'cancelled_early',
  'cancelled_late',
  'rated',
]);

export const tripSchema = z.object({
  id: z.string(),
  driver_id: z.string(),
  passenger_id: z.string().nullable(),
  status: tripStatusSchema,
  origin_address: z.string().nullable(),
  origin_lat: z.number(),
  origin_lng: z.number(),
  dest_address: z.string().nullable(),
  dest_lat: z.number(),
  dest_lng: z.number(),
  pickup_instructions: z.string().nullable(),
  distance_km: z.number().nullable(),
  duration_minutes: z.number().nullable(),
  base_fare: z.number().nullable(),
  distance_fare: z.number().nullable(),
  time_fare: z.number().nullable(),
  total_fare: z.number().nullable(),
  platform_fee: z.number().nullable(),
  driver_earnings: z.number().nullable(),
  tip_amount: z.number().optional(),
  payment_method: z.string().nullable(),
  is_collected: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  passenger_name: z.string().nullable(),
  passenger_avatar_url: z.string().nullable(),
  passenger_phone: z.string().nullable(),
  passenger_rating: z.number().nullable(),
  verification_code: z.string().length(4).nullable(),
});

export const earningsTripSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  origin_address: z.string().nullable(),
  total_fare: z.number().nullable(),
  platform_fee: z.number().nullable(),
  driver_earnings: z.number().nullable(),
  payment_method: z.string().nullable(),
});

export const earningsDailySchema = z.object({
  total: z.number(),
  cash: z.number(),
  transfer: z.number(),
  trip_count: z.number(),
  trips: z.array(earningsTripSchema).optional(),
  yesterday: z.number().optional(),
  week: z.number().optional(),
  week_platform_fee: z.number().optional(),
  week_total_fare: z.number().optional(),
  platform_debt: z.number().optional(),
  commission_exempt_until: z.string().nullable().optional(),
});

export const paymentMethodSchema = z.object({
  id: z.string(),
  method_type: z.string(),
  account_number: z.string(),
  titular_name: z.string().nullable(),
  wallet: z.string().nullable(),
  created_at: z.string(),
});

export const documentSchema = z.object({
  id: z.string(),
  doc_type: z.enum([
    'license_front',
    'license_back',
    'registration_front',
    'registration_back',
    'insurance_front',
    'insurance_back',
    'background_check_front',
    'background_check_back',
    'rndg_front',
  ]),
  file_url: z.string(),
  status: z.enum(['pending_review', 'approved', 'rejected', 'superseded']).nullable().optional(),
  verified_at: z.string().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  created_at: z.string(),
});

export type Driver = z.infer<typeof driverSchema>;
export type DriverStatus = z.infer<typeof driverStatusSchema>;
export type EarningsDaily = z.infer<typeof earningsDailySchema>;
export type Trip = z.infer<typeof tripSchema>;
export type TripStatus = z.infer<typeof tripStatusSchema>;
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
export type DriverDocument = z.infer<typeof documentSchema>;
export const rateTripBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.string().optional(),
  comment: z.string().optional(),
});

export const rateTripResponseSchema = z.object({
  rating_id: z.string(),
  message: z.string(),
});

export const reportTags = [
  'No se presentó',
  'Mala actitud',
  'Sucio/desorden',
  'Dañó el vehículo',
  'Demora excesiva',
  'Pago incompleto',
] as const;

export type District = z.infer<typeof districtSchema>;
export type DistrictDetail = z.infer<typeof districtDetailSchema>;
export type RateTripBody = z.infer<typeof rateTripBodySchema>;
export type RateTripResponse = z.infer<typeof rateTripResponseSchema>;
export type ReportTag = (typeof reportTags)[number];

export const maneuverStepSchema = z.object({
  maneuver_type: z.string(),
  maneuver_modifier: z.string().optional(),
  name: z.string(),
  distance: z.number(),
  geometry: z.string(),
});

export const directionsResponseSchema = z.object({
  distance_km: z.number(),
  duration_minutes: z.number(),
  polyline: z.string(),
  steps: z.array(maneuverStepSchema),
  alternatives: z.array(
    z.object({
      distance_km: z.number(),
      duration_minutes: z.number(),
      polyline: z.string(),
      steps: z.array(maneuverStepSchema),
    }),
  ),
});

export type DirectionsResponse = z.infer<typeof directionsResponseSchema>;
