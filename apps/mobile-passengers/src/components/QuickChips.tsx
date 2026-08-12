import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { searchPlaces } from '../api/passenger';
import type { PlaceSuggestion } from '../api/types';
import { theme } from '../theme';

interface Chip {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  savedAddress: string | null;
}

const DEFAULT_CHIPS: Chip[] = [
  { name: 'Casa', icon: 'home-outline', savedAddress: null },
  { name: 'Trabajo', icon: 'briefcase-outline', savedAddress: null },
];

interface QuickChipsProps {
  onSelect: (address: string) => void;
}

export function QuickChips({ onSelect }: QuickChipsProps) {
  const [editingChip, setEditingChip] = useState<string | null>(null);
  const [addressInput, setAddressInput] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  useEffect(() => {
    if (!editingChip) return;
    const trimmed = addressInput.trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [addressInput, editingChip]);

  const handleChipPress = (chip: Chip) => {
    if (chip.savedAddress) {
      onSelect(chip.savedAddress);
      return;
    }
    setEditingChip(chip.name);
    setAddressInput('');
    setSuggestions([]);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    setAddressInput(suggestion.description);
    setSuggestions([]);
  };

  const handleSaveAddress = () => {
    const trimmed = addressInput.trim();
    if (!trimmed) {
      setEditingChip(null);
      return;
    }
    onSelect(trimmed);
    setEditingChip(null);
    setAddressInput('');
    setSuggestions([]);
  };

  if (editingChip) {
    return (
      <View style={styles.editContainer}>
        <View style={styles.editRow}>
          <TextInput
            style={styles.editInput}
            placeholder={`Dirección de ${editingChip}`}
            placeholderTextColor={theme.colors.mediumGray}
            value={addressInput}
            onChangeText={setAddressInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSaveAddress}
          />
          <TouchableOpacity style={styles.editSave} onPress={handleSaveAddress} activeOpacity={0.7}>
            <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((suggestion) => (
              <TouchableOpacity
                key={suggestion.place_id}
                style={styles.suggestionItem}
                onPress={() => handleSelectSuggestion(suggestion)}
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
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      {DEFAULT_CHIPS.map((chip) => (
        <TouchableOpacity
          key={chip.name}
          style={styles.chip}
          onPress={() => handleChipPress(chip)}
          activeOpacity={0.7}
        >
          <Ionicons name={chip.icon} size={16} color={theme.colors.deepBlue} />
          <Text style={styles.chipLabel}>{chip.name}</Text>
        </TouchableOpacity>
      ))}
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
    height: 44,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
    gap: theme.spacing.xs,
  },
  chipLabel: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
  },
  editContainer: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  editInput: {
    flex: 1,
    height: 44,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    fontFamily: theme.fontFamily.regular,
    fontSize: theme.fontSize.sm,
    color: theme.colors.deepBlue,
    borderWidth: 1,
    borderColor: theme.colors.lightGray,
  },
  editSave: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
});
