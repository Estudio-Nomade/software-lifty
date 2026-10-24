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
import { OnboardingCard, OnboardingChrome } from '../components/OnboardingChrome';
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
  // Mount-scoped one-shot flags (fresh refs on remount; never reset mid-mount).
  const prefillDone = useRef(false);
  /** True after user taps a type chip — only blocks the in-flight one-shot prefill. */
  const typeTouchedDuringPrefill = useRef(false);

  const selectVehicleType = (type: VehicleTypeUi) => {
    if (!prefillDone.current) typeTouchedDuringPrefill.current = true;
    setVehicleType(type);
  };

  // Prefill from GET /drivers/me so back/redirect/kill-app never shows a blank form twice.
  useEffect(() => {
    if (prefillDone.current) return;
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
          // Only apply profile type if user has not already picked while GET was in flight.
          if (!typeTouchedDuringPrefill.current) {
            setVehicleType(form.type);
          }
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.log('[driver-onboarding] vehicle prefilled from profile');
          }
        }
      } catch {
        // empty form — first time
      } finally {
        // Always mark done so this effect path never re-applies type (deps = []).
        prefillDone.current = true;
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
      <OnboardingChrome
        step={2}
        kicker="Vehículo"
        title="Datos del vehículo"
        subtitle="Patente y ficha como figuran en la cédula."
      />

      <OnboardingCard>
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

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Patente</Text>
          <Input
            placeholder="ABC123"
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
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Marca</Text>
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
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Modelo</Text>
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
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Color</Text>
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
          </View>
          <View style={styles.halfField}>
            <Text style={styles.fieldLabel}>Año</Text>
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
        </View>

        {submitError !== '' && <Text style={styles.submitError}>{submitError}</Text>}

        <Button
          title="Continuar"
          onPress={handleContinue}
          disabled={
            loadingProfile ||
            !isFormValid(vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, vehicleYear)
          }
          loading={loading || loadingProfile}
          variant="cta"
          style={styles.button}
        />
      </OnboardingCard>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Navbar title="Tu vehículo" onBack={() => navigation.goBack()} variant="light" />
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
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
  },
  hint: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    width: '100%',
  },
  fieldGroup: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  input: {
    width: '100%',
  },
  halfField: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  halfInput: {
    width: '100%',
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
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: '100%',
  },
  button: {
    width: '100%',
    marginTop: theme.spacing.xs,
  },
});
