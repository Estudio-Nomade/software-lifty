import type React from 'react';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
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
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme';

type VehicleType = 'Auto' | 'Moto' | 'Camioneta';

interface ValidationErrors {
  vehiclePlate?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  vehicleYear?: string;
}

const PLATE_REGEX = /^[A-Z]{2,3}[0-9]{3}[A-Z]{0,2}$/;
const VEHICLE_TYPES: VehicleType[] = ['Auto', 'Moto', 'Camioneta'];
const CURRENT_YEAR = new Date().getFullYear();

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

const validateYear = (value: string) => {
  if (!value.trim()) return undefined;
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num) || num < 2000 || num > CURRENT_YEAR + 1)
    return `Ano entre 2000 y ${CURRENT_YEAR + 1}`;
  return undefined;
};

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
  const driverStatus = useAuthStore((s) => s.driverStatus);

  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehicleYear, setVehicleYear] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('Auto');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitError, setSubmitError] = useState('');

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
        vehicle_type: vehicleType,
      });

      const step: string = data?.step ?? 'documents';
      const target = STEP_ROUTE[step];
      if (target) {
        navigation.replace(target.screen);
      } else {
        navigation.navigate('OnboardingStep2');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.code === 'KYC_REQUIRED') {
        const kycRoute = STEP_ROUTE.kyc;
        if (kycRoute) navigation.replace(kycRoute.screen);
        return;
      }
      setSubmitError(err?.message ?? 'Error al guardar el vehiculo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.deepBlue} />
      <Navbar title="Paso 2/3" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text style={styles.sectionTitle}>VEHICULO</Text>
          <View style={styles.vehicleTypes}>
            {VEHICLE_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.vehicleType, vehicleType === type && styles.vehicleTypeSelected]}
                onPress={() => setVehicleType(type)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.vehicleTypeText,
                    vehicleType === type && styles.vehicleTypeTextSelected,
                  ]}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
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
                setVehicleYear(t);
                setError('vehicleYear', undefined);
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
              !isFormValid(vehiclePlate, vehicleBrand, vehicleModel, vehicleColor, vehicleYear)
            }
            loading={loading}
            variant="cta"
            style={styles.button}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.white,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  input: {
    width: 343,
  },
  halfInput: {
    flex: 1,
  },
  vehicleTypes: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: 343,
  },
  vehicleType: {
    flex: 1,
    height: 44,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.mediumGray,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.white,
  },
  vehicleTypeSelected: {
    backgroundColor: theme.colors.turquoise,
    borderColor: theme.colors.turquoise,
  },
  vehicleTypeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
  },
  vehicleTypeTextSelected: {
    color: theme.colors.white,
    fontWeight: theme.fontWeight.bold,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    width: 343,
  },
  submitError: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.dangerRed,
    textAlign: 'center',
    width: 343,
  },
  button: {
    width: 343,
    marginTop: theme.spacing.md,
  },
});
