import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { type Favorite, useFavoritesStore } from '../store/favoritesStore';
import { theme } from '../theme';
import { FavoriteEditor } from './FavoriteEditor';

interface QuickChipsProps {
  onSelect: (address: string) => void;
}

type EditorTarget = { mode: 'add'; label?: string } | { mode: 'edit'; favorite: Favorite };

const ICON_BY_LABEL: Record<string, keyof typeof Ionicons.glyphMap> = {
  casa: 'home',
  trabajo: 'briefcase',
};

function chipIcon(label: string): keyof typeof Ionicons.glyphMap {
  return ICON_BY_LABEL[label.toLowerCase()] ?? 'location';
}

export function QuickChips({ onSelect }: QuickChipsProps) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const addFavorite = useFavoritesStore((s) => s.addFavorite);
  const updateFavorite = useFavoritesStore((s) => s.updateFavorite);
  const removeFavorite = useFavoritesStore((s) => s.removeFavorite);

  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const handleChipPress = (favorite: Favorite) => {
    if (favorite.address) {
      onSelect(favorite.address);
      return;
    }
    setEditor({ mode: 'edit', favorite });
  };

  const handleChipLongPress = (favorite: Favorite) => {
    if (!favorite.address) {
      setEditor({ mode: 'edit', favorite });
      return;
    }
    Alert.alert(favorite.label, '¿Qué querés hacer?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Editar', onPress: () => setEditor({ mode: 'edit', favorite }) },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => removeFavorite(favorite.id),
      },
    ]);
  };

  const handleSave = (label: string, address: string) => {
    if (editor?.mode === 'edit') {
      updateFavorite(editor.favorite.id, label, address);
    } else {
      addFavorite(label, address);
    }
    setEditor(null);
    onSelect(address);
  };

  if (editor) {
    const initial =
      editor.mode === 'edit'
        ? { label: editor.favorite.label, address: editor.favorite.address }
        : { label: editor.label ?? '', address: '' };
    return (
      <FavoriteEditor initial={initial} onSave={handleSave} onCancel={() => setEditor(null)} />
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {favorites.map((favorite) => (
        <TouchableOpacity
          key={favorite.id}
          style={styles.chip}
          onPress={() => handleChipPress(favorite)}
          onLongPress={() => handleChipLongPress(favorite)}
          delayLongPress={350}
          activeOpacity={0.7}
          accessibilityLabel={
            favorite.address
              ? `${favorite.label}. Mantener para editar o eliminar`
              : `Configurar ${favorite.label}`
          }
        >
          <Ionicons name={chipIcon(favorite.label)} size={16} color={theme.colors.primary} />
          <Text style={styles.chipLabel}>{favorite.label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.addChip}
        onPress={() => setEditor({ mode: 'add' })}
        activeOpacity={0.7}
        accessibilityLabel="Agregar favorito"
      >
        <Ionicons name="add" size={16} color={theme.colors.primary} />
        <Text style={styles.addLabel}>Agregar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    marginTop: theme.spacing.md,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(13, 43, 69, 0.08)',
    gap: theme.spacing.xs,
  },
  chipLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    gap: theme.spacing.xs,
  },
  addLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.primary,
  },
});
