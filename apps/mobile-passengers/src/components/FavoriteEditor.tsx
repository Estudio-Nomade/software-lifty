import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePlaceAutocomplete } from '../hooks/usePlaceAutocomplete';
import { theme } from '../theme';
import { Button } from './Button';
import { Input } from './Input';

interface FavoriteEditorProps {
  initial?: { label: string; address: string };
  onSave: (label: string, address: string) => void;
  onCancel: () => void;
}

export function FavoriteEditor({ initial, onSave, onCancel }: FavoriteEditorProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const suggestions = usePlaceAutocomplete(address);

  const isEditing = initial != null && initial.address !== '';
  const canSave = label.trim().length > 0 && address.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave(label.trim(), address.trim());
  };

  return (
    <View style={styles.container}>
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
        onChangeText={setAddress}
        autoFocus
      />

      {suggestions.length > 0 ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.place_id}
              style={styles.suggestionItem}
              onPress={() => setAddress(suggestion.description)}
              activeOpacity={0.7}
            >
              <Ionicons name="location-outline" size={18} color={theme.colors.mediumGray} />
              <Text style={styles.suggestionText} numberOfLines={1}>
                {suggestion.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Button variant="primary" onPress={handleSave} disabled={!canSave} style={styles.saveBtn}>
        {isEditing ? 'Guardar cambios' : 'Agregar a favorito'}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  backBtn: {
    padding: theme.spacing.xs,
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
  suggestions: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    minHeight: 44,
  },
  suggestionText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  saveBtn: {
    marginTop: theme.spacing.lg,
  },
});
