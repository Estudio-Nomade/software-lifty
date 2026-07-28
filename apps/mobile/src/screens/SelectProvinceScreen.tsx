import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import { apiClient } from '../api/client';
import { Navbar } from '../components/Navbar';
import { Text } from '../components/ui/Text';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { theme } from '../theme';

export const SelectProvinceScreen: React.FC = () => {
  const navigation = useAppNavigation();
  const [provinces, setProvinces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProvinces = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: body } = await apiClient.get('/districts/provinces');
      const payload = body?.data ?? body;
      setProvinces(payload.provinces ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar provincias');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProvinces();
  }, [fetchProvinces]);

  const handleSelect = (province: string) => {
    navigation.navigate('SelectDistrict', { province });
  };

  const renderItem = ({ item }: { item: string }) => (
    <TouchableOpacity style={styles.item} onPress={() => handleSelect(item)} activeOpacity={0.7}>
      <Text style={styles.itemText}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Navbar title="¿Dónde querés trabajar?" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.subtitle}>Seleccioná tu provincia</Text>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.turquoise} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchProvinces}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : provinces.length === 0 ? (
          <Text style={styles.emptyText}>No hay provincias disponibles</Text>
        ) : (
          <FlatList
            data={provinces}
            renderItem={renderItem}
            keyExtractor={(item) => item}
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
