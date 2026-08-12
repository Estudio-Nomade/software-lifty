import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { type Favorite, useFavoritesStore } from '../store/favoritesStore';
import { theme } from '../theme';
import { FavoriteEditor } from './FavoriteEditor';

interface QuickChipsProps {
  onSelect: (address: string) => void;
}

type EditorTarget = { mode: 'add'; label?: string } | { mode: 'edit'; favorite: Favorite };

const ICON_BY_LABEL: Record<string, keyof typeof Ionicons.glyphMap> = {
  casa: 'home-outline',
  trabajo: 'briefcase-outline',
};

function chipIcon(label: string): keyof typeof Ionicons.glyphMap {
  return ICON_BY_LABEL[label.toLowerCase()] ?? 'location-outline';
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

  const handleEditPress = (favorite: Favorite) => setEditor({ mode: 'edit', favorite });

  const handleDeletePress = (favorite: Favorite) => {
    Alert.alert('Eliminar favorito', `¿Querés eliminar "${favorite.label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => removeFavorite(favorite.id) },
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
        <View key={favorite.id} style={styles.favoriteGroup}>
          <TouchableOpacity
            style={styles.chip}
            onPress={() => handleChipPress(favorite)}
            activeOpacity={0.7}
          >
            <Ionicons name={chipIcon(favorite.label)} size={16} color={theme.colors.deepBlue} />
            <Text style={styles.chipLabel}>{favorite.label}</Text>
          </TouchableOpacity>

          {favorite.address ? (
            <>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleEditPress(favorite)}
                accessibilityLabel={`Editar ${favorite.label}`}
                activeOpacity={0.7}
              >
                <Ionicons name="pencil" size={16} color={theme.colors.mediumGray} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => handleDeletePress(favorite)}
                accessibilityLabel={`Eliminar ${favorite.label}`}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={16} color={theme.colors.dangerRed} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      ))}

      <TouchableOpacity
        style={styles.addChip}
        onPress={() => setEditor({ mode: 'add' })}
        activeOpacity={0.7}
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
  favoriteGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    gap: theme.spacing.xs,
  },
  chipLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
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
