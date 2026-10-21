import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { PlaceSuggestion } from '../../api/types';
import { theme } from '../../theme';
import { Button } from '../Button';
import { QuickChips } from '../QuickChips';

interface ExpandedTripSearchProps {
  pickupAddress: string;
  destAddress: string;
  focusedField: 'pickup' | 'dest' | null;
  pickupLoading: boolean;
  /** Locked GPS/suggestion pick — no live autocomplete for that field. */
  pickupPicked?: boolean;
  destPicked?: boolean;
  suggestions: PlaceSuggestion[];
  placesLoading: boolean;
  placesError: string | null;
  searchError: string | null;
  showUseMyLocation: boolean;
  onBack: () => void;
  onPickupChange: (text: string) => void;
  onDestChange: (text: string) => void;
  onPickupFocus: () => void;
  onDestFocus: () => void;
  onClearPickup: () => void;
  onClearDest: () => void;
  onSelectSuggestion: (suggestion: PlaceSuggestion) => void;
  onUseMyLocation: () => void;
  onChipSelect: (selection: { address: string; lat?: number; lng?: number }) => void;
  onConfirm: () => void;
}

function splitSuggestion(description: string): { primary: string; secondary?: string } {
  const parts = description
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { primary: description };
  return { primary: parts[0], secondary: parts.slice(1).join(', ') };
}

export function ExpandedTripSearch({
  pickupAddress,
  destAddress,
  focusedField,
  pickupLoading,
  pickupPicked = false,
  destPicked = false,
  suggestions,
  placesLoading,
  placesError,
  searchError,
  showUseMyLocation,
  onBack,
  onPickupChange,
  onDestChange,
  onPickupFocus,
  onDestFocus,
  onClearPickup,
  onClearDest,
  onSelectSuggestion,
  onUseMyLocation,
  onChipSelect,
  onConfirm,
}: ExpandedTripSearchProps) {
  const destQuery = destAddress.trim();
  const pickupQuery = pickupAddress.trim();
  const activeQuery = focusedField === 'pickup' ? pickupQuery : destQuery;
  const fieldLocked =
    (focusedField === 'pickup' && pickupPicked) || (focusedField === 'dest' && destPicked);
  // Locked GPS/suggestion label is not a failed search — don't show false empty.
  const showEmptySuggestions =
    focusedField !== null &&
    !fieldLocked &&
    activeQuery.length >= 2 &&
    suggestions.length === 0 &&
    !pickupLoading &&
    !placesLoading &&
    !placesError;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          accessibilityLabel="Cerrar búsqueda"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.deepBlue} />
        </TouchableOpacity>
        <Text style={styles.title}>¿A dónde vas?</Text>
      </View>

      <View style={styles.fieldsCard}>
        <View style={[styles.fieldBlock, focusedField === 'pickup' && styles.fieldBlockFocused]}>
          <View style={styles.timelineCol}>
            <View style={[styles.dot, styles.dotOrigin]} />
            <View style={styles.timelineLine} />
          </View>
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Origen</Text>
            <View style={styles.inputRow}>
              {pickupLoading && !pickupQuery ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.loadingText}>Obteniendo ubicación…</Text>
                </View>
              ) : (
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Desde"
                  placeholderTextColor={theme.colors.mediumGray}
                  value={pickupAddress}
                  onFocus={onPickupFocus}
                  onChangeText={onPickupChange}
                  accessibilityLabel="Origen"
                />
              )}
              {pickupQuery.length > 0 ? (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={onClearPickup}
                  accessibilityLabel="Borrar origen"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={theme.colors.mediumGray} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.fieldBlock, focusedField === 'dest' && styles.fieldBlockFocused]}>
          <View style={styles.timelineCol}>
            <View style={[styles.dot, styles.dotDest]} />
          </View>
          <View style={styles.fieldContent}>
            <Text style={styles.fieldLabel}>Destino</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.fieldInput}
                placeholder="Hacia"
                placeholderTextColor={theme.colors.mediumGray}
                value={destAddress}
                onFocus={onDestFocus}
                onChangeText={onDestChange}
                autoFocus
                returnKeyType="search"
                onSubmitEditing={onConfirm}
                accessibilityLabel="Destino"
              />
              {destQuery.length > 0 ? (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={onClearDest}
                  accessibilityLabel="Borrar destino"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={20} color={theme.colors.mediumGray} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {showUseMyLocation ? (
        <TouchableOpacity
          style={styles.useLocationRow}
          onPress={onUseMyLocation}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Usar mi ubicación actual"
        >
          <View style={styles.useLocationIcon}>
            <Ionicons name="locate" size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.useLocationText}>Usar mi ubicación actual</Text>
        </TouchableOpacity>
      ) : null}

      {placesLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingLabel}>Buscando…</Text>
        </View>
      ) : null}

      {placesError && !placesLoading ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{placesError}</Text>
        </View>
      ) : null}

      {suggestions.length > 0 && !placesLoading ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => {
            const { primary, secondary } = splitSuggestion(suggestion.description);
            return (
              <TouchableOpacity
                key={suggestion.place_id}
                style={styles.suggestionItem}
                onPress={() => onSelectSuggestion(suggestion)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionIcon}>
                  <Ionicons name="location" size={16} color={theme.colors.deepBlue} />
                </View>
                <View style={styles.suggestionTexts}>
                  <Text style={styles.suggestionPrimary} numberOfLines={1}>
                    {primary}
                  </Text>
                  {secondary ? (
                    <Text style={styles.suggestionSecondary} numberOfLines={1}>
                      {secondary}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {showEmptySuggestions ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No encontramos calles ni lugares. Probá otro nombre.</Text>
        </View>
      ) : null}

      <QuickChips onSelect={onChipSelect} />

      {searchError ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={16} color={theme.colors.dangerRed} />
          <Text style={styles.errorText}>{searchError}</Text>
        </View>
      ) : null}

      <View style={styles.ctaWrap}>
        <Button variant="primary" onPress={onConfirm} disabled={!destQuery}>
          Continuar
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: theme.dimensions.navbarHeight,
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  fieldsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    ...theme.shadows.card,
  },
  fieldBlock: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    marginHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  fieldBlockFocused: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.primary,
  },
  timelineCol: {
    width: 20,
    alignItems: 'center',
    paddingTop: 6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotOrigin: {
    backgroundColor: theme.colors.primary,
  },
  dotDest: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: theme.colors.deepBlue,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 18,
    marginVertical: 4,
    backgroundColor: theme.colors.primary,
    opacity: 0.35,
  },
  fieldContent: {
    flex: 1,
    paddingLeft: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
    marginBottom: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 28,
  },
  fieldInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
    padding: 0,
    minHeight: 28,
  },
  loadingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 28,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  clearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 52,
  },
  useLocationIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useLocationText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  suggestions: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.06)',
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(13, 43, 69, 0.06)',
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionTexts: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
  },
  suggestionPrimary: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  suggestionSecondary: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
    marginTop: 2,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    minHeight: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  loadingLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
  },
  emptyBox: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(229, 57, 53, 0.08)',
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
  },
  ctaWrap: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
});
