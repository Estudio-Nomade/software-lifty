import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { ApiError } from '../api/types';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { STEP_ROUTE } from '../lib/postAuthRouting';
import {
  type VehicleTypeUi,
  validateVehicleYear,
  vehicleFormFromProfile,
  vehicleTypeToApi,
} from '../lib/vehicleForm';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

interface ValidationErrors {
  vehiclePlate?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: string;
}

const PLATE_REGEX = /^[A-Z]{2,3}[0-9]{3}[A-Z]{0,2}$/;
const VEHICLE_TYPES: VehicleTypeUi[] = ['Auto', 'Moto'];

const normalizePlate = (value: string) => value.replace(/\s+/g, '').toUpperCase();

const validatePlate = (value: string) => {
  if (!value.trim()) return undefined;
  if (!PLATE_REGEX.test(normalizePlate(value))) return 'Formato invalido (ej: ABC123)';
  return undefined;
};

const validateRequired = (value: string) => {
  if (!value.trim()) return 'Requerido';
  return undefined;
};

const validateYear = (value: string) => validateVehicleYear(value);

const isFormValid = (
  vehiclePlate: string,
  vehicleBrand: string,
  vehicleModel: string,
  vehicleColor: string,
  vehicleYear: string,
) => {
  return (
    vehiclePlate.trim() !== '' &&
    !validatePlate(vehiclePlate) &&
    vehicleBrand.trim() !== '' &&
    vehicleModel.trim() !== '' &&
    vehicleColor.trim() !== '' &&
    vehicleYear.trim() !== '' &&
    !validateYear(vehicleYear)
  );
};

export const OnboardingVehicleScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const setOnboardingStep = useAuthStore((s) => s.setOnboardingStep);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleTypeUi>('Auto');
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');
  const prefilled = useRef(false);
  /** User tapped a type chip — never let late prefill overwrite their choice. */
  const typeTouched = useRef(false);

  const selectVehicleType = (type: VehicleTypeUi) => {
    typeTouched.current = true;
    setVehicleType(type);
  };

  // Prefill from GET /drivers/me so back/redirect/kill-app never shows a blank form twice.
  useEffect(() => {
    if (prefilled.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { data } = await apiClient.get('/drivers/me');
        if (cancelled) return;
        const form = vehicleFormFromProfile(data?.vehicle);
        if (form) {
          setVehiclePlate(form.plate);
          setVehicleBrand(form.brand);
          setVehicleModel(form.model);
          setVehicleColor(form.color);
          setVehicleYear(form.year);
          // Don't stomp a type the user already picked while this request was in flight.
          if (!typeTouched.current) {
            setVehicleType(form.type);
          }
          prefilled.current = true;
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.log('[driver-onboarding] vehicle prefilled from profile');
          }
        }
      } catch {
        // empty form — first time
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setError = (field: keyof ValidationErrors, error: string | undefined) => {
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleContinue = async () => {
    if (!isFormValid(vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, vehicleYear)) return;
    setLoading(true);
    setSubmitError('');

    try {
      const { data } = await apiClient.put('/drivers/me', {
        vehicle_plate: normalizePlate(vehiclePlate),
        vehicle_brand: vehicleBrand.trim(),
        vehicle_model: vehicleModel.trim(),
        vehicle_color: vehicleColor.trim(),
        vehicle_year: Number.parseInt(vehicleYear, 10),
        vehicle_type: vehicleTypeToApi(vehicleType),
      });

      const step: string = data?.step ?? data?.data?.step ?? 'documents';
      setOnboardingStep(step);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[driver-onboarding] vehicle saved → step', step);
      }
      const target = STEP_ROUTE[step];
      if (target) {
        navigation.replace(target.screen);
      } else {
        navigation.replace('OnboardingStep2');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'KYC_REQUIRED') {
        setOnboardingStep('kyc');
        const kycRoute = STEP_ROUTE.kyc;
        if (kycRoute) navigation.replace(kycRoute.screen);
        return;
      }
      setSubmitError(err?.message ?? 'Error al guardar el vehiculo');
    } finally {
      setLoading(false);
    }
  };

  const formBody = (
    <>
      <Text style={styles.sectionTitle}>VEHICULO</Text>
      {vehiclePlate !== '' && vehicleBrand !== '' ? (
        <Text style={styles.hint}>Datos guardados. Revisá y continuá.</Text>
      ) : null}
      <View style={styles.vehicleTypes} accessibilityRole="radiogroup">
        {VEHICLE_TYPES.map((type) => {
          const selected = vehicleType === type;
          return (
            <Pressable
              key={type}
              style={({ pressed }) => [
                styles.vehicleType,
                selected && styles.vehicleTypeSelected,
                pressed && !selected && styles.vehicleTypePressed,
              ]}
              onPress={() => selectVehicleType(type)}
              hitSlop={8}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={type}
              testID={`vehicle-type-${type.toLowerCase()}`}
            >
              <Text
                style={[styles.vehicleTypeText, selected && styles.vehicleTypeTextSelected]}
                pointerEvents="none"
              >
                {type}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Input
        placeholder="Patente"
        value={vehiclePlate}
        onChangeText={(t) => {
          setVehiclePlate(t.toUpperCase());
          setError('vehiclePlate', undefined);
        }}
        onBlur={() => setError('vehiclePlate', validatePlate(vehiclePlate))}
        error={errors.vehiclePlate}
        containerStyle={styles.input}
        autoCapitalize="characters"
        maxLength={9}
      />
      <View style={styles.row}>
        <Input
          placeholder="Marca"
          value={vehicleBrand}
          onChangeText={(t) => {
            setVehicleBrand(t);
            setError('vehicleBrand', undefined);
          }}
          onBlur={() => setError('vehicleBrand', validateRequired(vehicleBrand))}
          error={errors.vehicleBrand}
          containerStyle={styles.halfInput}
        />
        <Input
          placeholder="Modelo"
          value={vehicleModel}
          onChangeText={(t) => {
            setVehicleModel(t);
            setError('vehicleModel', undefined);
          }}
          onBlur={() => setError('vehicleModel', validateRequired(vehicleModel))}
          error={errors.vehicleModel}
          containerStyle={styles.halfInput}
        />
      </View>
      <View style={styles.row}>
        <Input
          placeholder="Color"
          value={vehicleColor}
          onChangeText={(t) => {
            setVehicleColor(t);
            setError('vehicleColor', undefined);
          }}
          onBlur={() => setError('vehicleColor', validateRequired(vehicleColor))}
          error={errors.vehicleColor}
          containerStyle={styles.halfInput}
        />
        <Input
          placeholder="Año"
          value={vehicleYear}
          onChangeText={(t) => {
            const digits = t.replace(/\D/g, '').slice(0, 4);
            setVehicleYear(digits);
            // Show error live once they typed a full year (e.g. 2010).
            setError('vehicleYear', digits.length === 4 ? validateYear(digits) : undefined);
          }}
          onBlur={() => setError('vehicleYear', validateYear(vehicleYear))}
          error={errors.vehicleYear}
          containerStyle={styles.halfInput}
          keyboardType="numeric"
          maxLength={4}
        />
      </View>

      {submitError !== '' && <Text style={styles.submitError}>{submitError}</Text>}

      <Button
        title="CONTINUAR"
        onPress={handleContinue}
        disabled={
          loadingProfile ||
          !isFormValid(vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, vehicleYear)
        }
        loading={loading || loadingProfile}
        variant="cta"
        style={styles.button}
      />
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Navbar title="Paso 2/3" onBack={() => navigation.goBack()} />
      {/*
        Android: no KeyboardAvoidingView — SO already resizes; KAV leaves a gray gap.
        iOS: padding KAV. Keep #406 dismiss modes.
      */}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {formBody}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {formBody}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    // stretch full width — center + width:'100%' collapses chip hit targets on web/RN
    alignItems: 'stretch',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
    color: theme.colors.deepBlue,
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  hint: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.mediumGray,
    width: '100%',
    marginBottom: theme.spacing.xs,
  },
  input: {
    width: '100%',
  },
  halfInput: {
    flex: 1,
    minWidth: 0,
  },
  vehicleTypes: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: '100%',
    zIndex: 2,
  },
  vehicleType: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    // fixed border width avoids layout jump that can swallow the next press
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  vehicleTypeSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  vehicleTypePressed: {
    opacity: 0.85,
    borderColor: theme.colors.primary,
  },
  vehicleTypeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    fontFamily: theme.fontFamily.semibold,
  },
  vehicleTypeTextSelected: {
    color: theme.colors.white,
    fontFamily: theme.fontFamily.bold,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: '100%',
  },
  submitError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: '100%',
  },
  button: {
    width: '100%',
    marginTop: theme.spacing.md,
  },
});
