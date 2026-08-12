import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

  const handleChipPress = (chip: Chip) => {
    if (chip.savedAddress) {
      onSelect(chip.savedAddress);
      return;
    }
    setEditingChip(chip.name);
    setAddressInput('');
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
  };

  if (editingChip) {
    return (
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
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
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
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  editInput: {
    flex: 1,
    height: 40,
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
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.white,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
