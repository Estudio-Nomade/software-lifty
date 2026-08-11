import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

const PLACES = [
  { name: 'Trabajo', address: 'Av. 9 de Julio 1234' },
  { name: 'Casa', address: 'Av. Corrientes 5678' },
];

export function TripRequestScreen() {
  const { goBack, navigate } = useAppNavigation();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn}>
          <Ionicons name="close" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.mapPreview}>
        <Ionicons name="map-outline" size={48} color={theme.colors.deepBlue} />
        <Text style={styles.mapLabel}>Mapa</Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.colors.mediumGray} />
        <TextInput
          style={styles.searchInput}
          placeholder="¿A dónde vas?"
          placeholderTextColor={theme.colors.mediumGray}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>📌 Lugares recientes</Text>

        {PLACES.map((place) => (
          <TouchableOpacity
            key={place.name}
            style={styles.placeCard}
            onPress={() => navigate('VehicleSelect')}
          >
            <Ionicons name="location" size={20} color={theme.colors.primary} />
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{place.name}</Text>
              <Text style={styles.placeAddr}>{place.address}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.bottomSearch}>
          <Ionicons name="location-outline" size={18} color={theme.colors.mediumGray} />
          <Text style={styles.bottomSearchText}>Buscar en el mapa...</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.lightGray,
  },
  navbar: {
    height: theme.dimensions.navbarHeight,
    backgroundColor: theme.colors.white,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  navBtn: {
    alignSelf: 'flex-start',
    padding: theme.spacing.sm,
  },
  mapPreview: {
    height: 200,
    backgroundColor: '#B8D4E3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLabel: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
    color: theme.colors.deepBlue,
    marginTop: theme.spacing.sm,
  },
  searchBox: {
    position: 'absolute',
    top: theme.dimensions.navbarHeight + theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    height: 48,
    gap: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.deepBlue,
  },
  content: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.lightGray,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    height: 56,
    gap: theme.spacing.sm,
  },
  placeInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  placeName: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
    color: theme.colors.deepBlue,
  },
  placeAddr: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
  bottomSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.lightGray,
  },
  bottomSearchText: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.regular,
    color: theme.colors.mediumGray,
  },
});
