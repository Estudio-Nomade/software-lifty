import { useLocalSearchParams } from 'expo-router';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import type { District } from '../api/types';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const SelectDistrictScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const { province } = useLocalSearchParams<{ province: string }>();
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDistricts = useCallback(async () => {
    if (!province) return;
    try {
      setLoading(true);
      setError(null);
      const { data: body } = await apiClient.get('/districts', {
        params: { province },
      });
      const payload = body?.data ?? body;
      setDistricts(payload.districts ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar municipios');
    } finally {
      setLoading(false);
    }
  }, [province]);

  useEffect(() => {
    fetchDistricts();
  }, [fetchDistricts]);

  const handleSelect = (district: District) => {
    navigation.navigate('DistrictTerms', {
      districtId: district.id,
      districtName: district.name,
    });
  };

  const renderItem = ({ item }: { item: District }) => (
    <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)} activeOpacity={0.7}>
      <Text style={styles.itemText}>{item.name}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Navbar title={`Municipios en ${province ?? ''}`} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.subtitle}>Seleccioná tu municipio</Text>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.turquoise} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchDistricts}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : districts.length === 0 ? (
          <Text style={styles.emptyText}>No hay municipios disponibles en {province}</Text>
        ) : (
          <FlatList
            data={districts}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.white },
  content: { flex: 1, padding: theme.spacing.lg },
  subtitle: {
    fontSize: theme.fontSize.md,
    color: theme.colors.mediumGray,
    marginBottom: theme.spacing.lg,
  },
  list: { gap: theme.spacing.sm },
  item: {
    backgroundColor: theme.colors.lightGray,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  itemText: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.deepBlue,
  },
  loader: { marginTop: theme.spacing.xl },
  errorContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  errorText: { color: theme.colors.dangerRed, fontSize: theme.fontSize.md },
  retryText: { color: theme.colors.turquoise, fontSize: theme.fontSize.md, fontWeight: '500' },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.mediumGray,
    fontSize: theme.fontSize.md,
    marginTop: theme.spacing.xl,
  },
});
