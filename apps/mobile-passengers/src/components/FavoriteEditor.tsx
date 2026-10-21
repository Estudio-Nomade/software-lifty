import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { theme } from '../theme';
import { Button } from './Button';
import { Input } from './Input';

interface FavoriteEditorProps {
  initial?: { label: string; address: string; lat?: number; lng?: number };
  onSave: (label: string, address: string, lat?: number, lng?: number) => void;
  onCancel: () => void;
}

export function FavoriteEditor({ initial, onSave, onCancel }: FavoriteEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  // Gate live search while a pick (or initial lat/lng) is locked — same idea as destPicked on Home.
  // Any manual edit must clear coords first (handleAddressChange) or suggestions stay off and save would keep stale lat/lng.
  const addressQuery = coords ? '' : address;
  const { suggestions, loading, error } = usePlaceAutocomplete(addressQuery);

  const isEditing = initial != null && initial.address !== '';
  const canSave = label.trim().length > 0 && address.trim().length > 0;

  const handleAddressChange = (text: string) => {
    setAddress(text);
    // Unlock autocomplete + drop stale pick coords when the user edits the label.
    setCoords(null);
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave(label.trim(), address.trim(), coords?.lat, coords?.lng);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.backBtn} accessibilityLabel="Cancelar">
          <Ionicons name="arrow-back" size={22} color={theme.colors.deepBlue} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? 'Editar favorito' : 'Nuevo favorito'}</Text>
      </View>

      <Text style={styles.fieldLabel}>Nombre</Text>
      <Input placeholder="Ej: Casa, Trabajo, Gimnasio" value={label} onChangeText={setLabel} />

      <Text style={styles.fieldLabel}>Dirección</Text>
      <Input
        placeholder="Escribí la dirección"
        value={address}
        onChangeText={handleAddressChange}
        autoFocus
      />

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Buscando…</Text>
        </View>
      ) : null}

      {error && !loading ? <Text style={styles.errorText}>{error}</Text> : null}

      {suggestions.length > 0 && !loading ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.place_id}
              style={styles.suggestionItem}
              onPress={() => {
                setAddress(suggestion.description);
                setCoords({ lat: suggestion.lat, lng: suggestion.lng });
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={suggestion.description}
            >
              <View style={styles.suggestionIcon}>
                <Ionicons name="location" size={16} color={theme.colors.deepBlue} />
              </View>
              <Text style={styles.suggestionText} numberOfLines={2}>
                {suggestion.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Button variant="primary" onPress={handleSave} disabled={!canSave} style={styles.saveBtn}>
        {isEditing ? 'Guardar cambios' : 'Agregar a favorito'}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    marginTop: theme.spacing.md,
  },
  container: {
    marginHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  fieldLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    minHeight: 44,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  errorText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.dangerRed,
  },
  suggestions: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
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
  suggestionText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
    paddingVertical: theme.spacing.sm,
  },
  saveBtn: {
    marginTop: theme.spacing.lg,
  },
});
